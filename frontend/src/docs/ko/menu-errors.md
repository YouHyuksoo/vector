# 처리 로그

`data/process-logs/process-YYYY-MM-DD.jsonl`의 SUCCESS/ERROR 이력을 조회하는 보조 화면입니다. 상태, stage, 대상, 설비와 기간으로 필터링할 수 있습니다.

`RAW_DATA`가 있는 ERROR는 재전송 화면에서 직접 적재 흐름으로 다시 처리할 수 있습니다. 현재 처리 로그는 Oracle `LOG_ERROR` 테이블이나 Redis 큐를 사용하지 않습니다.
