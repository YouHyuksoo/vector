---
name: reprocessing-failed-log-inserts
description: Use when Vector 로그가 raw 파일로는 수신됐는데 LOG_* 테이블에 없을 때 — 로그서버/Oracle 장애, 재부팅, 네트워크 끊김 후 "누락 재처리", "빠진 로그 다시 넣어", process-logs에 NJS-503 / NJS-040 / NJS-510 / ENETUNREACH / ORA-03113 TABLE_INSERT ERROR가 쌓였을 때
---

# 적재 실패 로그 재처리

## Overview
process-logs JSONL의 ERROR 레코드에는 VRL 파싱이 끝난 레코드(`RAW_DATA`)가 그대로 남아 있다. 이 레코드를 `POST /api/logs`로 다시 보내면 파이프라인을 그대로 탄다. 재처리의 핵심은 **넣은 뒤 IS_LAST가 맞는지 검증하는 것**이다.

## 쓰지 말 것
- `POST /api/monitor/retry`, `retry/all`: 모든 JSONL(파일당 수백 MB)을 동기로 통째 읽는다. 운영 Backend가 멈추거나 `ERR_STRING_TOO_LONG`으로 실패한다.
- PowerShell `ConvertFrom-Json`으로 JSONL 스캔하기: 너무 느리다. 서버에 있는 node의 readline 스트리밍을 쓴다.
- 파싱 오류(`ORA-01843`, `ORA-01861` 등)는 재처리해도 똑같이 실패한다. 원인(VRL, 설비 파일 형식)부터 고친다.

## 절차
`scripts/reprocess.py`를 이 스킬 폴더에서 실행한다. 접속 정보는 인벤토리(`solum-log`, `SVEHICLEPDB`)에서 읽는다.

```bash
python scripts/reprocess.py collect --table LOG_AOI --from 2026-09-24 --to 2026-09-27   # 대상 추출(서버)
python scripts/reprocess.py check   --table LOG_AOI      # DB에 이미 있는 파일 제외, 더 최신 검사 충돌 확인
python scripts/reprocess.py post    --table LOG_AOI --yes   # 시간순 재투입 (운영 INSERT)
python scripts/reprocess.py verify  --table LOG_AOI      # 누락 0 확인 + IS_LAST 점검
python scripts/reprocess.py verify  --table LOG_AOI --fix   # 불일치가 있으면 교정 후 다시 verify
python scripts/reprocess.py cleanup --table LOG_AOI
```

- `--from`/`--to`는 process-logs **파일 날짜(UTC)** 기준이다. 날짜는 이렇게 정한다.
  - `--from`: 현지 장애 시작 시각 + 6시간의 UTC 날짜
  - `--to`: 현지 장애 종료 시각 + 6시간의 UTC 날짜 + 1일. 재부팅 뒤 Vector 버퍼가 몰아서 재전송하다 난 오류까지 잡기 위해서다.
  - 예: 현지 10/3 02:00 ~ 10/4 09:00 → `--from 2026-10-03 --to 2026-10-05`
  - 범위를 넓게 잡아도 안전하다. `check`가 이미 DB에 있는 파일을 걸러낸다.
- `collect`의 `NON-MATCHED ERRORS`는 연결 오류가 아닌 실패다. 재처리 대상이 아니므로 사용자에게 따로 보고한다. 이 수가 연결 오류보다 많으면 장애 원인이 연결 문제가 아닐 수 있다. `post`하기 전에 원인부터 확인한다.
- 섞여 들어온 비정상 파일은 `--exclude-filename '<정규식>'`으로 뺀다. 예: SPI-13 패드 측정 파일 `^IDNO\.|^\d{8}D\d?B\d{14}\.csv$`
- `post`는 운영 DB에 쓰는 작업이다. 사용자 승인을 받은 뒤 `--yes`로 실행한다.

## IS_LAST (가장 흔한 사고)
각 LOG_* 테이블의 `BEFORE INSERT` 트리거는 **들어오는 순서대로** 이전 행을 N으로, 새 행을 Y로 만든다. 재처리는 과거 데이터를 늦게 넣는 작업이라 다음이 깨진다.
- 이미 DB에 더 최신 검사가 있으면 → 과거 행이 Y가 된다.
- 한 배치(20건)는 병렬로 처리된다 → 같은 키가 둘 다 Y가 된다. AOI는 바코드를 못 읽으면 `SERIAL_NO`가 `YYYYMMDDHHMISS` 시각값이라 설비 간 충돌이 잦다.
- 장애 후 Vector 디스크 버퍼가 밀린 데이터를 몰아서 재전송해도 같은 문제가 생긴다.

`verify --fix`는 트리거 규칙대로 **그룹마다 최신 1건만 Y**로 맞춘다. ISCM 바코드(IP_PRODUCT_2D_BARCODE에 2건 이상)는 라인별로, 그 외는 키 전체에서 1건이다. `check`는 교정 전 Y 행을 `islast_snapshot.json`에 남긴다.

## 새 테이블 추가
`reprocess.py`의 `TABLES`에 프리셋이 있는 테이블은 LOG_AOI, LOG_SPI, LOG_MARKING이다. 다른 테이블은 추가해야 한다.

1. 트리거 소스는 **운영 DB에서** 읽는다: oracle-db 스킬의 `--trigger-source TRG_<TABLE>_IS_LAST --site SVEHICLEPDB`. 레포의 `docs/sql/*.sql`은 옛날 버전일 수 있어 근거로 쓰지 않는다.
2. `key`: UPDATE WHERE에 쓰인 바코드 컬럼. MARKING처럼 두 개일 수 있다.
3. `iscm`: `IP_PRODUCT_2D_BARCODE ... WHERE SERIAL_NO = :NEW.<col>` COUNT 가드에 쓰인 컬럼. 가드가 없으면 `None`으로 둔다.
4. `ts_sql` / `ts_cols`: 검사 시각 컬럼. 먼저 DB에서 값 포맷을 샘플로 뽑아 확인한다. 예: `select distinct regexp_replace(<col>,'[0-9]','9') from <table> where created_at > sysdate-7`. 포맷이 섞여 있으면 문자열 정렬이 시간순이 아니므로, `ts_sql`을 `to_char(to_date(...))` 같은 식으로 정규화한다.
5. 처음 추가한 테이블은 `verify`를 `--fix` 없이 먼저 돌린다(읽기 전용). 불일치 샘플이 트리거 규칙과 맞는지 눈으로 확인한 뒤에 `--fix`를 쓴다.

## 보고
테이블별로 대상 파일 수, 이미 있던 파일 수, 재투입 건수, 누락 0 확인, IS_LAST 교정 건수를 표로 정리한다.
