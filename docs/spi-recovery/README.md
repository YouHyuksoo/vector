# SPI 로그 복구 플레이북

LOG_SPI에 데이터가 안 들어가거나, 컬럼이 시프트되어 들어가는 사고 대응 가이드. 일반적인 "VRL 변경 → 메모리 미반영 → 잘못 파싱 → 트리거 폭발" 패턴의 복구에도 활용.

원본 사고: 2026-05-13. 신 KohYoung SPI 포맷 VRL이 git push만 되고 Vector aggregator reload 되지 않아 옛 VRL이 신 파일을 잘못 파싱 → `ARRAY_BARCODE="PadDefectType"` 같은 헤더값이 반복 INSERT → 트리거 mutating(ORA-04091) 폭발.

---

## 진단 단계

### 1) DB에서 현황 파악
```sql
-- 오늘 INSERT된 건수
SELECT COUNT(*), TO_CHAR(MAX(CREATED_AT),'YYYY-MM-DD HH24:MI:SS') AS LAST_AT
  FROM LOG_SPI WHERE CREATED_AT >= TRUNC(SYSDATE);

-- 어제 이후 분포 (시프트 데이터 패턴 식별용)
SELECT EQUIPMENT_ID, ARRAY_BARCODE, PANEL_RESULT, COUNT(*)
  FROM LOG_SPI WHERE CREATED_AT >= TRUNC(SYSDATE)-1
 GROUP BY EQUIPMENT_ID, ARRAY_BARCODE, PANEL_RESULT
 ORDER BY COUNT(*) DESC;
```
헤더값(`PadDefectType`, `ComponentID`, `ArrayBarcode`)이 ARRAY_BARCODE/PANEL_RESULT에 들어있으면 옛 VRL 결과.

### 2) 트리거 상태 확인
```sql
SELECT STATUS, LAST_DDL_TIME FROM USER_OBJECTS WHERE OBJECT_NAME='TRG_LOG_SPI_IS_LAST';
```
스킬 사용:
```bash
python C:/Users/hsyou/.claude/skills/oracle-db/scripts/oracle_connector.py \
  --site SVEHICLEPDB --trigger-source TRG_LOG_SPI_IS_LAST
```

### 3) 에러 로그 확인
```bash
curl -s "http://20.10.30.112:3100/api/monitor/errors?status=ERROR&equipmentId=SPI-01&limit=20"
```
`ORA-04091: ... table is mutating ... at TRG_LOG_SPI_IS_LAST` 패턴 = 매핑 시프트로 인한 트리거 폭발.

### 4) registry / procedure 매핑 확인
```bash
curl -s "http://20.10.30.112:3100/api/monitor/registry"   # rows[].SOURCE_FIELD, procRows[]
curl -s "http://20.10.30.112:3100/api/monitor/procedures/SP_LOG_INS_SPI"
```
참고: `SP_LOG_INS_SPI` 본문은 NULL (dead). procRows에 매핑만 남아있지만 실제 호출 안 됨.

### 5) 현재 deploy된 VRL과 메모리 차이 의심 시
```bash
# 파일 기준 (참고용, 메모리 상태 아님)
curl -s "http://20.10.30.112:3100/api/monitor/vrl/code/SPI"

# git에서 옛 vs 현 VRL 비교
git log --oneline -- vector-config/aggregator/vector-aggregator.toml | head -20
git show <prev-commit>:vector-config/aggregator/vector-aggregator.toml
```
`vector-aggregator.toml` 백업 목록이 비어있으면(`/api/monitor/aggregator/backups`) git push로만 갱신된 상태 = 메모리에 옛 VRL.

### 6) 송신측 상태 확인
```bash
curl -s "http://20.10.30.112:3100/api/monitor/overview"   # heartbeat
curl -s "http://20.10.30.112:3100/api/monitor/remote/SPI-01/metrics"   # Vector events_in/out
curl -s "http://20.10.30.112:3100/api/monitor/log-files?path=SPI/SPI-01/2026-05-12"   # raw 파일 목록
```

---

## 복구 절차

### 1) Vector aggregator reload (필수)
```bash
curl -X POST "http://20.10.30.112:3100/api/monitor/vector/reload"
# {"success":true,"message":"Vector reloaded (PID: ...)"}
```
신 VRL이 메모리에 로드됨. PID 변경 = 사실상 restart (다른 설비 잠깐 영향 후 복구).

### 2) 잘못 들어간 데이터 삭제
- 시간 범위 기준이 안전 (LOG_ID range는 정상 데이터 섞일 수 있음).
```sql
-- 카운트 확인 먼저
SELECT COUNT(*) FROM LOG_SPI
 WHERE CREATED_AT >= TO_DATE('2026-05-12 21:00:00','YYYY-MM-DD HH24:MI:SS')
   AND CREATED_AT <  TO_DATE('2026-05-12 22:00:00','YYYY-MM-DD HH24:MI:SS');

-- 삭제
DELETE FROM LOG_SPI
 WHERE CREATED_AT >= TO_DATE('2026-05-12 21:00:00','YYYY-MM-DD HH24:MI:SS')
   AND CREATED_AT <  TO_DATE('2026-05-12 22:00:00','YYYY-MM-DD HH24:MI:SS');
COMMIT;
```
**주의**: DELETE 트리거 cascade로 `rows affected` 보고가 실제보다 적게 나올 수 있음. COMMIT 후 SELECT로 재검증.

### 3) raw 파일 재처리
서버에 보관된 raw 파일(`C:\data\raw-logs\SPI\<equipmentId>\<date>\`)을 신 VRL 로직으로 파싱 → `/api/logs` 직접 POST.

```bash
python C:/Project/vector/docs/spi-recovery/reprocess_raw_logs.py \
  --equipment-id SPI-01 --line-code 01 --folder SPI/SPI-01/2026-05-12
```
스크립트는 `manual-ingest` 우회 (Vector binary 없이 직접 logRecord 생성). 자세한 내용은 [reprocess_raw_logs.py](reprocess_raw_logs.py) 참조.

### 4) 검증
```sql
SELECT EQUIPMENT_ID, COUNT(*) AS CNT,
       COUNT(DISTINCT ARRAY_BARCODE) AS DIST_AB,
       COUNT(DISTINCT MASTER_BARCODE) AS DIST_MB
  FROM LOG_SPI WHERE CREATED_AT >= TRUNC(SYSDATE)
 GROUP BY EQUIPMENT_ID;
```
- ARRAY_BARCODE/MASTER_BARCODE가 모두 긴 바코드 (`0011...` `0012...`) ✓
- `PCBID`, `MACHINE_ID`, `SIDE`, `LANE` 값이 정상 ✓
- `IS_LAST='Y'` (트리거 정상) ✓

---

## 사용한 API/도구 인덱스

### Backend API (monitor.route.ts)
| 용도 | 엔드포인트 |
|------|-----------|
| Vector aggregator reload | `POST /api/monitor/vector/reload` |
| 로그 직접 투입 (Vector 우회) | `POST /api/logs` |
| 수동 투입 (Vector binary 사용) | `POST /api/monitor/vrl/manual-ingest` |
| VRL 시뮬레이션 | `POST /api/monitor/vrl/simulate` |
| 처리 로그 조회 | `GET /api/monitor/logs` |
| 에러 로그만 | `GET /api/monitor/errors?status=ERROR` |
| 설비 heartbeat | `GET /api/monitor/overview` |
| raw 파일 탐색 | `GET /api/monitor/log-files?path=...` |
| raw 파일 읽기 | `GET /api/monitor/log-files/read?path=...` |
| 현재 VRL 코드 | `GET /api/monitor/vrl/code/<TYPE>` |
| registry 매핑 | `GET /api/monitor/registry` |
| 프로시져 매핑 상세 | `GET /api/monitor/procedures/<KEY>` |
| Aggregator TOML 백업 | `GET /api/monitor/aggregator/backups` |
| 설비 PC Vector metric | `GET /api/monitor/remote/<id>/metrics` |
| 설비 PC Vector 제어 | `POST /api/monitor/remote/<id>/control/{start,stop,restart,test-connection}` |

### Oracle DB (oracle-db skill)
```bash
python C:/Users/hsyou/.claude/skills/oracle-db/scripts/oracle_connector.py --site SVEHICLEPDB \
  --query "SELECT ..."
  --trigger-source <name>
  --procedure-source <name>
  --describe-table <name>
```

### 핵심 코드 파일
| 파일 | 역할 |
|------|------|
| `vector-config/aggregator/vector-aggregator.toml` | Aggregator VRL (SPI block: L216~) |
| `src/server/routes/log-ingest.route.ts` | `POST /api/logs` (Vector HTTP sink + 수동 호출) |
| `src/services/log-ingest.service.ts` | `processLogBatch()` — 청크 병렬 + 행별 INSERT |
| `src/database/dynamic-insert.ts` | registry SOURCE_FIELD 기반 동적 INSERT (`data.` prefix 자동 제거) |
| `src/schemas/log-ingest.schema.ts` | logRecord zod 스키마 |

---

## 트러블슈팅

### manual-ingest/simulate EPERM
`Operation not permitted` 발생 시 `tmpdir()` 권한 문제. 두 가지 해결:
1. 임시 폴더 권한 부여 (운영 서버 `C:\Users\Administrator\AppData\Local\Temp`)
2. `monitor.route.ts`의 `tmpdir()` 호출을 프로젝트 내 폴더(`C:\Project\vector\tmp` 등)로 교체 후 deploy
- 우회: `POST /api/logs` 직접 호출 ([reprocess_raw_logs.py](reprocess_raw_logs.py) 참조)

### DELETE rows affected가 적게 나옴
DELETE 트리거 cascade일 가능성 (예: child row 자동 삭제). COMMIT 후 SELECT로 실제 잔존 건수 검증.

### Vector reload 후에도 옛 동작 지속
- Vector aggregator PID가 변경됐는지 확인 (`GET /api/monitor/vector`)
- 변경 안 됐으면 `stop` + `start` (`POST /api/monitor/vector/stop` 후 `/start`)

### 송신 정지가 길어지는 경우
- 설비 PC Vector heartbeat 살아있는지 (`overview`)
- `events_in/events_out`이 변하는지 (`remote/<id>/metrics`)
- `events_in=0`이면 설비 PC 로컬 폴더(`C:\logs\<type>\` 또는 `E:\Export...`)에 새 파일이 안 만들어지는 것
- fingerprint 캐시는 Vector agent restart로 초기화 안 됨 (`data_dir` 유지). 강제 재송신 필요 시 설비 PC에서 `data_dir` 비우고 restart
