"""SPI raw 로그 재처리 — Vector aggregator/manual-ingest 우회.

용도:
- LOG_SPI에 옛 VRL로 시프트된 데이터를 삭제한 뒤, raw 파일을 신 VRL 로직으로 재처리
- manual-ingest/simulate가 EPERM으로 막혔을 때 (Vector binary tmpdir 권한 문제)
- 사실상 manual-ingest의 끝단 `processLogBatch()`와 동등한 흐름을 직접 호출

흐름:
1. `/api/monitor/log-files?path=<폴더>` 로 파일 목록 조회
2. 각 파일 `/api/monitor/log-files/read?path=<...>` 로 내용 읽기
3. 신 VRL(`vector-aggregator.toml` SPI 블록) 로직 그대로 Python에서 파싱
4. logRecord 배열 만들어 `POST /api/logs` — log-ingest 파이프라인 정상 동작

검증된 케이스 (2026-05-13):
- SPI-01 88건, SPI-02 260건, 모두 정상 INSERT (트리거 mutating 없음)

사용 예:
    python reprocess_raw_logs.py --equipment-id SPI-01 --line-code 01 \\
        --folder SPI/SPI-01/2026-05-12

    python reprocess_raw_logs.py --equipment-id SPI-02 --line-code 02 \\
        --folder SPI/SPI-02/2026-05-12 --server http://20.10.30.112:3100
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def http_get(server: str, path: str, retries: int = 2) -> dict:
    url = server + path
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            if attempt < retries:
                time.sleep(1.0 * (attempt + 1))
    assert last_err is not None
    raise last_err


def http_post(server: str, path: str, body) -> tuple[int, str]:
    req = urllib.request.Request(
        server + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def parse_spi_csv(content: str) -> list[dict]:
    """vector-aggregator.toml의 SPI 블록 (L216~) 로직과 동일.

    파일 구조 (신 KohYoung SPI 포맷, 2026-05~):
        L0: Master header (13 cols)
        L1: Master data row
        L2: "Panel"
        L3: Panel header (ArrayBarcode, PanelResult)
        L4+: Panel data rows
        L X: "ComponentID"로 시작 → 이 라인부터 IGNORE
    """
    lines = content.split("\n")
    if len(lines) < 2:
        return []
    master_cols = [c.strip() for c in lines[1].split(",")]
    if len(master_cols) < 13:
        return []

    master_data = {
        "MASTER_BARCODE": master_cols[0],
        "PCBID": master_cols[1],
        "INSPECTION_DATE": master_cols[2],
        "INSPECTION_START_TIME": master_cols[3],
        "INSPECTION_END_TIME": master_cols[4],
        "TOTAL_PANEL_CNT": master_cols[5],
        "JOB_NAME": master_cols[6],
        "PCB_RESULT": master_cols[7],
        "USER_ID": master_cols[8],
        "LOT_INFO": master_cols[9],
        "MACHINE_ID": master_cols[10],
        "SIDE": master_cols[11],
        "LANE": master_cols[12],
    }

    panel_start = 4
    panel_end = len(lines)
    for idx, line in enumerate(lines[panel_start:]):
        if line.startswith("ComponentID"):
            panel_end = panel_start + idx
            break

    rows = []
    for row_line in lines[panel_start:panel_end]:
        if not row_line.strip():
            continue
        cols = [c.strip() for c in row_line.split(",")]
        item = dict(master_data)
        item["ARRAY_BARCODE"] = cols[0] if len(cols) > 0 else ""
        item["PANEL_RESULT"] = cols[1] if len(cols) > 1 else ""
        rows.append(item)
    return rows


def main() -> int:
    p = argparse.ArgumentParser(description="SPI raw 파일을 신 VRL 로직으로 재처리")
    p.add_argument("--server", default="http://20.10.30.112:3100", help="MES 서버 주소")
    p.add_argument("--equipment-id", required=True, help="예: SPI-01")
    p.add_argument("--line-code", required=True, help="예: 01")
    p.add_argument("--folder", required=True,
                   help="log-files API 기준 상대경로. 예: SPI/SPI-01/2026-05-12")
    p.add_argument("--dry-run", action="store_true",
                   help="파싱만 하고 POST는 안 함 (검증용)")
    p.add_argument("--sleep", type=float, default=0.05,
                   help="파일 간 대기 (초, Oracle pool 보호용)")
    args = p.parse_args()

    print(f"=== Reprocess {args.equipment_id} folder {args.folder} ===")
    listing = http_get(args.server, f"/api/monitor/log-files?path={urllib.parse.quote(args.folder)}")
    entries = listing.get("entries", [])
    files = [e["name"] for e in entries if e.get("type") == "file"]
    print(f"Files: {len(files)}")
    if args.dry_run:
        print("(dry-run: POST 생략)")

    total_files = 0
    total_rows = 0
    total_accepted = 0
    total_failed = 0
    errors: list[str] = []

    for fname in files:
        path = f"{args.folder}/{fname}"
        try:
            file_resp = http_get(args.server, f"/api/monitor/log-files/read?path={urllib.parse.quote(path)}")
            content = file_resp.get("content", "")
            rows = parse_spi_csv(content)
            if not rows:
                errors.append(f"{fname}: 0 rows parsed")
                continue

            if args.dry_run:
                total_files += 1
                total_rows += len(rows)
                continue

            log_record = {
                "equipment_id": args.equipment_id,
                "equipment_type": "SPI",
                "log_type": "INSPECTION",
                "target_type": "TABLE",
                "target_table": "LOG_SPI",
                "timestamp": datetime.datetime.now().isoformat(),
                "data": {"ROWS": rows},
                "filename": fname,
                "line_code": args.line_code,
            }
            status, body = http_post(args.server, "/api/logs", [log_record])
            if status == 202:
                resp = json.loads(body)
                total_files += 1
                total_rows += len(rows)
                total_accepted += resp.get("accepted", 0)
                total_failed += resp.get("failed", 0)
            else:
                errors.append(f"{fname}: HTTP {status} - {body[:200]}")
        except Exception as e:
            errors.append(f"{fname}: exception - {str(e)[:200]}")
        time.sleep(args.sleep)

    print()
    print("=== Result ===")
    print(f"Files processed: {total_files}/{len(files)}")
    print(f"Rows generated:  {total_rows}")
    if not args.dry_run:
        print(f"Accepted:        {total_accepted}")
        print(f"Failed:          {total_failed}")
    if errors:
        print(f"Errors: {len(errors)}")
        for e in errors[:10]:
            print(f"  - {e}")
        if len(errors) > 10:
            print(f"  ... ({len(errors) - 10} more)")
    return 0 if total_failed == 0 and not errors else 1


if __name__ == "__main__":
    sys.exit(main())
