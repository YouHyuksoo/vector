"""
SMT 마킹 BOT_SERIAL_NO 오류 추출 + 예상값 + 교차검증 CSV 저장
"""
import json, os, csv, oracledb

SQL = """
SELECT
    t.SEQ_NO,
    t.RUN_NO,
    t.SERIAL_NO_NUM,
    t.LR_FLAG,
    t.MACHINE_CODE,
    t.LINE_CODE,
    TO_CHAR(t.MARKING_DT, 'YYYY-MM-DD HH24:MI:SS') MARKING_DT,
    t.SERIAL_NO         AS CURRENT_TOP_SERIAL_NO,
    t.BOT_SERIAL_NO     AS WRONG_BOT_SERIAL_NO,
    t.SERIAL_NO         AS EXPECTED_BOT_SERIAL_NO,
    b.SERIAL_NO         AS EQP02_VERIFIED_BOT_SN,
    CASE
        WHEN b.SERIAL_NO IS NULL          THEN 'NO_BOT_LOG'
        WHEN b.SERIAL_NO = t.SERIAL_NO    THEN 'CONFIRMED_OK_PREDICT'
        ELSE                                   'CONFLICT'
    END AS VERIFY_RESULT,
    t.REQUEST_TEXT
FROM IP_SMT_MARKING_LOG t
LEFT JOIN (
    SELECT RUN_NO, SERIAL_NO_NUM, LR_FLAG, MAX(SERIAL_NO) SERIAL_NO
      FROM IP_SMT_MARKING_LOG
     WHERE SIDE_FLAG = 'B'
     GROUP BY RUN_NO, SERIAL_NO_NUM, LR_FLAG
) b ON b.RUN_NO        = t.RUN_NO
   AND b.SERIAL_NO_NUM = t.SERIAL_NO_NUM
   AND b.LR_FLAG       = t.LR_FLAG
WHERE t.SIDE_FLAG     = 'T'
  AND t.BOT_SERIAL_NO <> t.SERIAL_NO
ORDER BY t.MACHINE_CODE, t.MARKING_DT, t.SEQ_NO
"""

with open(os.path.expanduser("~/.oracle_db_config.json")) as f:
    cfg = json.load(f)["profiles"]["SVEHICLEPDB"]

conn = oracledb.connect(
    user=cfg["user"], password=cfg["password"],
    dsn=f"{cfg['host']}:{cfg['port']}/{cfg['service_name']}"
)
cur = conn.cursor()
cur.execute(SQL)
cols = [c[0] for c in cur.description]
rows = cur.fetchall()

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wrong_marking_recovery.csv")
with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(cols)
    for r in rows:
        w.writerow(r)

# 집계 요약
by_machine = {}
by_verify = {}
for r in rows:
    m = r[cols.index("MACHINE_CODE")]
    v = r[cols.index("VERIFY_RESULT")]
    by_machine[m] = by_machine.get(m, 0) + 1
    by_verify[v] = by_verify.get(v, 0) + 1

print(f"총 {len(rows)}건 저장: {out_path}")
print("설비별:", by_machine)
print("검증별:", by_verify)

cur.close()
conn.close()
