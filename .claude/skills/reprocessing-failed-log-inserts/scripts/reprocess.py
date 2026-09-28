"""
Oracle 적재 실패(연결 장애 등)로 누락된 로그를 process-logs RAW_DATA에서 꺼내 재적재한다.

  python reprocess.py collect --table LOG_AOI --from 2026-09-24 --to 2026-09-27
  python reprocess.py check   --table LOG_AOI
  python reprocess.py post    --table LOG_AOI --yes
  python reprocess.py verify  --table LOG_AOI [--fix]
  python reprocess.py cleanup --table LOG_AOI

접속 정보는 ~/.infra 인벤토리(solum-log / SVEHICLEPDB)에서 읽는다. 상태는 %TEMP%/vector-reprocess/<TABLE>/ 에 저장.
"""
import argparse, json, os, sys, tempfile, time
from collections import defaultdict

import oracledb
import paramiko

sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".infra"))
import inventory_lib  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REMOTE_DIR = "C:/Windows/Temp/vector-reprocess"
SERVER, DB_SITE = "solum-log", "SVEHICLEPDB"
CONN_ERRORS = ("NJS-503|NJS-040|NJS-510|NJS-500|NJS-501|ENETUNREACH|ECONNRESET|ETIMEDOUT|"
               "ORA-03113|ORA-03114|ORA-12170|ORA-12541|ORA-12543")

# 운영 DB의 IS_LAST 트리거 UPDATE 조건과 일치해야 한다: key = WHERE 바코드 컬럼,
# iscm = IP_PRODUCT_2D_BARCODE COUNT 가드의 SERIAL_NO 비교 컬럼 (가드가 없으면 None → 키 전체에서 최신 1건).
# ts_sql/ts_cols = "나중 검사" 판단 기준 (문자열 정렬이 시간순이어야 함)
TABLES = {
    "LOG_AOI": dict(key=["SERIAL_NO"], iscm="SERIAL_NO", ts_sql="END_DATE", ts_cols=["END_DATE"]),
    "LOG_SPI": dict(key=["ARRAY_BARCODE"], iscm="ARRAY_BARCODE",
                    ts_sql="INSPECTION_DATE||' '||INSPECTION_END_TIME", ts_cols=["INSPECTION_DATE", "INSPECTION_END_TIME"]),
    "LOG_MARKING": dict(key=["MAIN_BARCODE", "MARKED_BARCODE"], iscm="MARKED_BARCODE",
                        ts_sql="MARKING_DT", ts_cols=["MARKING_DT"]),
}


def cfg(args):
    if args.table in TABLES:
        return TABLES[args.table]
    sys.exit(f"{args.table}: TABLES 프리셋 없음. 트리거 TRG_{args.table}_IS_LAST 의 UPDATE WHERE 조건을 읽고 TABLES에 추가할 것.")


def state_dir(table):
    d = os.path.join(tempfile.gettempdir(), "vector-reprocess", table)
    os.makedirs(d, exist_ok=True)
    return d


def load_state(table):
    p = os.path.join(state_dir(table), "state.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def save_state(table, **kw):
    st = load_state(table); st.update(kw)
    json.dump(st, open(os.path.join(state_dir(table), "state.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return st


# ---------- remote (로그서버) ----------
def ssh():
    s = inventory_lib.resolve_os(SERVER, "ssh")
    c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(s["host"], port=s.get("port") or 22, username=s["username"], password=s["password"], timeout=30)
    return c


def run_remote(c, cmd):
    """긴 작업도 끊기지 않게 타임아웃 없이 실행하고 출력을 줄 단위로 흘려보낸다."""
    _, out, err = c.exec_command("chcp 65001 >nul & " + cmd)
    for line in iter(out.readline, ""):
        print(line, end="", flush=True)
    e = err.read().decode("utf-8", "replace").strip()
    if e:
        print("[stderr]", e)
    return out.channel.recv_exit_status()


def run_node(cl, script, table, args):
    """스크립트와 인자 JSON 파일을 올리고 실행한다 (cmd.exe 인용부호 문제 회피)."""
    sftp = cl.open_sftp()
    run_remote(cl, f'mkdir "{REMOTE_DIR.replace('/', chr(92))}" 2>nul')
    sftp.put(os.path.join(HERE, script), f"{REMOTE_DIR}/{script}")
    local = os.path.join(state_dir(table), f"{script}.args.json")
    json.dump(args, open(local, "w", encoding="utf-8"), ensure_ascii=False)
    remote = f"{REMOTE_DIR}/{table}_{script}.args.json"
    sftp.put(local, remote)
    return run_remote(cl, f"node {REMOTE_DIR}/{script} {remote}")


# ---------- oracle ----------
def db():
    s = inventory_lib.get_oracle_profile(DB_SITE)
    return oracledb.connect(user=s["user"], password=s["password"], dsn=f"{s['host']}:{s['port']}/{s['service_name']}")


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def existing_files(cur, table, keys, since):
    names = sorted({k["f"] for k in keys}); found = set()
    for ch in chunks(names, 900):
        ph = ",".join(f":{i + 1}" for i in range(len(ch)))
        cur.execute(f"select distinct equipment_id||'/'||file_name from {table} "
                    f"where created_at >= to_date('{since}','YYYY-MM-DD') - 2 and file_name in ({ph})", ch)
        found |= {r[0] for r in cur}
    return found


def fetch_rows(cur, table, c, key_tuples):
    """key 튜플들에 해당하는 모든 행 (rowid, key..., line_code, ts, is_last, log_id, created_at)."""
    cols = c["key"]; out = []
    for ch in chunks(key_tuples, 900 // len(cols)):
        binds, ph = [], []
        for t in ch:
            ph.append("(" + ",".join(f":{len(binds) + i + 1}" for i in range(len(cols))) + ")"); binds += list(t)
        cur.execute(f"select rowid,{','.join(cols)},line_code,{c['ts_sql']},is_last,log_id,created_at from {table} "
                    f"where ({','.join(cols)}) in ({','.join(ph)})", binds)
        out += cur.fetchall()
    return out


def iscm_counts(cur, values):
    cnt = {}
    for ch in chunks(sorted(values), 900):
        ph = ",".join(f":{i + 1}" for i in range(len(ch)))
        cur.execute(f"select serial_no,count(*) from ip_product_2d_barcode where serial_no in ({ph}) group by serial_no", ch)
        cnt.update(dict(cur.fetchall()))
    return cnt


# ---------- commands ----------
def cmd_collect(args):
    c = cfg(args)
    save_state(args.table, frm=args.frm, to=args.to)
    cl = ssh()
    rc = run_node(cl, "collect.js", args.table, {
        "table": args.table, "from": args.frm, "to": args.to, "errorRegex": args.error_regex,
        "excludeFilename": args.exclude_filename, "keyCols": c["key"], "tsCols": c["ts_cols"], "outDir": REMOTE_DIR})
    cl.open_sftp().get(f"{REMOTE_DIR}/{args.table}_keys.json", os.path.join(state_dir(args.table), "keys.json"))
    cl.close(); print("keys ->", state_dir(args.table)); return rc


def cmd_check(args):
    c = cfg(args); st = load_state(args.table)
    keys = json.load(open(os.path.join(state_dir(args.table), "keys.json"), encoding="utf-8"))
    con = db(); cur = con.cursor()
    ex = existing_files(cur, args.table, keys, st["frm"])
    todo = [k for k in keys if k["e"] + "/" + k["f"] not in ex]
    print(f"files {len(keys)} | already in DB {len(keys) - len(todo)} | to post {len(todo)} (rows {sum(k['n'] for k in todo)})")
    # 재투입할 과거 검사보다 최신 검사가 DB에 이미 있는 키 → 트리거가 IS_LAST를 과거행으로 뒤집음 (verify --fix 로 교정)
    newest = defaultdict(str)
    for k in todo:
        for t in k["k"]:
            newest[tuple(t)] = max(newest[tuple(t)], k["ts"])
    rows = fetch_rows(cur, args.table, c, list(newest))
    later = defaultdict(str)
    for r in rows:
        later[tuple(r[1:1 + len(c["key"])])] = max(later[tuple(r[1:1 + len(c["key"])])], r[-4] or "")
    conflicts = [k for k, ts in newest.items() if later.get(k, "") > ts]
    snap = [[str(x) for x in r] for r in rows if tuple(r[1:1 + len(c["key"])]) in set(conflicts) and r[-3] == "Y"]
    json.dump(sorted(ex), open(os.path.join(state_dir(args.table), "existing.json"), "w"))
    json.dump(snap, open(os.path.join(state_dir(args.table), "islast_snapshot.json"), "w"))
    print(f"keys {len(newest)} | keys with NEWER inspection already in DB: {len(conflicts)} (현재 Y 행 스냅샷 {len(snap)}건 저장)")
    for k in conflicts[:5]:
        print("  ", k, "repost", newest[k], "< db", later[k])
    cl = ssh(); cl.open_sftp().put(os.path.join(state_dir(args.table), "existing.json"), f"{REMOTE_DIR}/{args.table}_existing.json"); cl.close()


def cmd_post(args):
    c = cfg(args)
    if not args.yes:
        sys.exit("운영 Oracle에 INSERT 한다. check 결과를 확인했으면 --yes 로 다시 실행.")
    con = db(); cur = con.cursor()
    cur.execute("select to_char(systimestamp,'YYYY-MM-DD HH24:MI:SS') from dual"); t0 = cur.fetchone()[0]
    cl = ssh()
    rc = run_node(cl, "post.js", args.table, {"table": args.table, "tsCols": c["ts_cols"], "outDir": REMOTE_DIR, "batch": args.batch})
    cl.close()
    time.sleep(5)
    cur.execute("select to_char(systimestamp,'YYYY-MM-DD HH24:MI:SS') from dual"); t1 = cur.fetchone()[0]
    save_state(args.table, post_start=t0, post_end=t1); print("post window (DB time):", t0, "~", t1); return rc


def cmd_verify(args):
    c = cfg(args); st = load_state(args.table); nk = len(c["key"])
    keys = json.load(open(os.path.join(state_dir(args.table), "keys.json"), encoding="utf-8"))
    con = db(); cur = con.cursor()
    ex = existing_files(cur, args.table, keys, st["frm"])
    missing = [k for k in keys if k["e"] + "/" + k["f"] not in ex]
    print(f"files {len(keys)} | in DB {len(keys) - len(missing)} | MISSING {len(missing)}")
    for k in missing[:10]:
        print("  missing", k["e"], k["f"])
    # IS_LAST: 트리거 규칙대로 그룹(ISCM=라인별, 그 외=키 전체)마다 최신 1건만 Y 여야 한다
    tuples = sorted({tuple(t) for k in keys for t in k["k"]})
    rows = fetch_rows(cur, args.table, c, tuples)
    ic = 1 + c["key"].index(c["iscm"]) if c.get("iscm") else None
    iscm = iscm_counts(cur, {r[ic] for r in rows}) if ic else {}
    groups = defaultdict(list)
    for r in rows:
        kv = tuple(r[1:1 + nk]); line = r[1 + nk] if ic and iscm.get(r[ic], 0) >= 2 else "*"
        groups[kv + (line,)].append(r)
    to_y, to_n = [], []
    for g in groups.values():
        g.sort(key=lambda r: ((r[2 + nk] or ""), r[4 + nk]), reverse=True)  # ts desc, log_id desc
        if g[0][3 + nk] != "Y": to_y.append(g[0][0])
        to_n += [r[0] for r in g[1:] if r[3 + nk] == "Y"]
    print(f"IS_LAST groups {len(groups)} | latest not Y: {len(to_y)} | older still Y: {len(to_n)}")
    if args.fix and (to_y or to_n):
        cur.executemany(f"update {args.table} set is_last='Y' where rowid=:1", [(r,) for r in to_y])
        cur.executemany(f"update {args.table} set is_last='N' where rowid=:1", [(r,) for r in to_n])
        con.commit(); print(f"fixed: Y {len(to_y)}, N {len(to_n)} (committed)")
    elif to_y or to_n:
        print("→ --fix 로 교정 (최신 1건 Y, 나머지 N)")


def cmd_cleanup(args):
    cl = ssh(); run_remote(cl, f'del /q "{REMOTE_DIR.replace("/", chr(92))}\\{args.table}_*" & echo cleaned'); cl.close()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    for name in ("collect", "check", "post", "verify", "cleanup"):
        s = sp.add_parser(name); s.add_argument("--table", required=True, type=str.upper)
        if name == "collect":
            s.add_argument("--from", dest="frm", required=True, help="process-logs 파일 날짜(UTC) 시작 YYYY-MM-DD")
            s.add_argument("--to", required=True, help="끝 날짜(UTC). 현지 장애 종료일 +1일까지 잡을 것")
            s.add_argument("--error-regex", default=CONN_ERRORS)
            s.add_argument("--exclude-filename", default=None, help="재처리 제외할 파일명 정규식")
        if name == "post":
            s.add_argument("--yes", action="store_true"); s.add_argument("--batch", type=int, default=20)
        if name == "verify":
            s.add_argument("--fix", action="store_true")
    a = p.parse_args()
    sys.exit(globals()["cmd_" + a.cmd](a) or 0)


if __name__ == "__main__":
    main()
