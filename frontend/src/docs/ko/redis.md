# 데이터 내구성과 복구

## 현재 구조

현재 시스템은 Redis와 BullMQ를 사용하지 않습니다. 내구성은 Vector disk buffer, 원본 파일, JSONL 처리 로그가 담당합니다.

## 보호 계층

| 장애 상황 | 보존 위치 | 복구 방법 |
|---|---|---|
| Backend 또는 Oracle 지연 | Vector `to_api` disk buffer | 서비스 복구 후 자동 재전송 |
| Oracle INSERT/프로시저 실패 | `data/process-logs/*.jsonl`의 ERROR와 `raw_data` | 시스템 로그의 재전송 기능 |
| 원문 재확인 필요 | `C:\data\raw-logs` | 원본 로그 파일 화면에서 조회·수동 투입 |
| 서버 재시작 | heartbeat snapshot, equipment registry | 시작 시 디스크 상태 복원 |

## Buffer 확인

**운영 진단**에서 Active, Rotation Wait, Orphan buffer와 source/sink 처리량을 함께 봅니다. buffer가 계속 증가하면 Backend, Oracle pool, 디스크 여유를 순서대로 확인하세요.

## 주의사항

- disk buffer가 가득 차면 `block` 정책에 의해 상류 수신까지 느려질 수 있습니다.
- 수집 제외 설비도 원본과 수신 이력은 남고 Oracle 적재만 건너뜁니다.
- 원본 파일 삭제 전에는 재처리 필요 여부를 확인하세요.
