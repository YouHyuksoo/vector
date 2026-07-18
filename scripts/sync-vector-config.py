#!/usr/bin/env python3
"""운영 서버의 vector-config를 로컬 저장소와 대조/동기화한다.

배포(.github/workflows/deploy.yml)는 robocopy /MIR 미러링이라, 배포가 끝나면
서버의 vector-config는 저장소 내용으로 강제된다. 저장소에 없는 파일은 서버에서
삭제된다. 따라서 화면(수신기/송신기)이나 SSH로 서버에서 직접 고친 VRL·TOML은
git에 반영하지 않으면 다음 배포 때 사라진다. (COATING VRL 2회 소실 사고의 경로)

이 스크립트는 그 사고를 막기 위한 것이다. git push 전에 실행해서 서버에만
있는 변경을 먼저 저장소로 끌어와라.

  python scripts/sync-vector-config.py            # 대조만 (기본)
  python scripts/sync-vector-config.py --apply    # 서버 내용을 로컬로 덮어쓰기

서버에는 절대 쓰지 않는다. dir/download(읽기)만 수행한다.
"""

import argparse
import filecmp
import hashlib
import io
import os
import shutil
import subprocess
import sys
import tempfile

HOST = "20.10.30.112"
PORT = "22"
USER = "administrator"
PASSWORD = "1234"

SERVER_CONFIG_DIR = r"C:\Project\vector\vector-config"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_CONFIG_DIR = os.path.join(REPO_ROOT, "vector-config")

HELPER = os.path.expanduser(os.path.join("~", ".claude", "scripts", "remote-ssh.py"))
TRACKED_EXT = (".toml", ".json", ".conf")
# backups/ 는 서버가 자동 생성하는 이력이라 대조 대상에서 뺀다.
SKIP_DIRS = ("\\backups\\", "/backups/")


def ssh(*args, retries=4):
    """remote-ssh.py 는 호출마다 새 SSH 연결을 연다. 파일 수만큼 연속으로 열면
    sshd 의 MaxStartups 에 걸려 ConnectionReset(10054) 이 난다 → 재시도 + 간격."""
    cmd = [sys.executable, HELPER, "--host", HOST, "--port", PORT,
           "--user", USER, "--password", PASSWORD, *args]
    last = None
    for attempt in range(retries):
        last = subprocess.run(cmd, capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
        if last.returncode == 0:
            return last
        time.sleep(1.5 * (attempt + 1))
    return last


def normalized(path):
    """줄바꿈(CRLF/LF)과 앞뒤 공백 차이는 무시하고 내용만 비교."""
    raw = io.open(path, "rb").read()
    return hashlib.md5(raw.replace(b"\r\n", b"\n").strip()).hexdigest()


def list_server_files():
    r = ssh("exec", f"dir /b /s {SERVER_CONFIG_DIR}")
    if r.returncode != 0:
        sys.exit(f"서버 파일 목록 조회 실패:\n{r.stderr or r.stdout}")
    out = []
    for line in r.stdout.splitlines():
        p = line.strip()
        if not p.lower().endswith(TRACKED_EXT):
            continue
        if any(s in p.lower() for s in SKIP_DIRS):
            continue
        out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="서버 내용을 로컬 vector-config로 덮어쓴다 (로컬만 변경)")
    args = ap.parse_args()

    if not os.path.exists(HELPER):
        sys.exit(f"remote-ssh.py 를 찾을 수 없다: {HELPER}")

    server_files = list_server_files()
    print(f"서버 vector-config 파일 {len(server_files)}개 대조 중...\n")

    tmp = tempfile.mkdtemp(prefix="vector-config-server-")
    same, changed, only_server = [], [], []

    try:
        for remote in server_files:
            rel = remote.split("vector-config\\", 1)[1]
            local = os.path.join(LOCAL_CONFIG_DIR, rel)
            staged = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(staged), exist_ok=True)

            r = ssh("download", "--remote", remote.replace("\\", "/"), "--local", staged)
            if not os.path.exists(staged):
                print(f"  !! 다운로드 실패: {rel} ({r.stderr.strip()[:80]})")
                continue

            if not os.path.exists(local):
                only_server.append((rel, staged))
            elif normalized(staged) == normalized(local):
                same.append(rel)
            else:
                changed.append((rel, staged, local))

        # 로컬에만 있는 파일 — 배포되면 서버에 생기므로 소실 위험은 없다. 참고용.
        only_local = []
        for root, dirs, files in os.walk(LOCAL_CONFIG_DIR):
            dirs[:] = [d for d in dirs if d != "backups"]
            for fn in files:
                if not fn.lower().endswith(TRACKED_EXT):
                    continue
                rel = os.path.relpath(os.path.join(root, fn), LOCAL_CONFIG_DIR)
                known = set(same) | {c[0] for c in changed} | {o[0] for o in only_server}
                if rel not in known:
                    only_local.append(rel)

        print(f"[동일]              {len(same)}개")
        print(f"[서버와 내용 다름]  {len(changed)}개")
        for rel, _, _ in changed:
            print(f"   ~ {rel}")
        print(f"[서버에만 있음]     {len(only_server)}개   ← 커밋 안 하면 다음 배포 때 서버에서 삭제됨")
        for rel, _ in only_server:
            print(f"   + {rel}")
        print(f"[로컬에만 있음]     {len(only_local)}개   ← 아직 배포 안 된 신규 파일")
        for rel in only_local:
            print(f"   - {rel}")

        drift = changed or only_server
        if not drift:
            print("\n서버와 저장소가 일치한다. 가져올 것 없음.")
            return 0

        if not args.apply:
            print("\n서버에만 있는 변경이 있다. 로컬로 가져오려면:")
            print("    python scripts/sync-vector-config.py --apply")
            print("그다음 git diff 로 확인하고 커밋할 것. 커밋하지 않으면 다음 배포에 사라진다.")
            return 1

        for rel, staged, local in changed:
            shutil.copyfile(staged, local)
            print(f"  갱신: {rel}")
        for rel, staged in only_server:
            local = os.path.join(LOCAL_CONFIG_DIR, rel)
            os.makedirs(os.path.dirname(local), exist_ok=True)
            shutil.copyfile(staged, local)
            print(f"  추가: {rel}")

        print("\n로컬에 반영했다. `git diff vector-config` 로 확인하고 커밋할 것.")
        return 0

    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
