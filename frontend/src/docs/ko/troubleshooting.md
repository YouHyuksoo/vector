# 문제 해결

## Agent가 오프라인

1. Agent Manager와 Vector 프로세스가 실행 중인지 확인합니다.
2. TOML의 서버 주소와 설비 ID를 확인합니다.
3. 설비 PC에서 중앙 서버 6000 포트를 검사합니다.

```powershell
Test-NetConnection 20.10.30.112 -Port 6000
```

## 온라인이지만 로그가 없음

1. `include`와 `exclude` 패턴이 실제 파일 경로와 맞는지 확인합니다.
2. `read_from`, `ignore_older_secs`, fingerprint와 multiline 설정을 확인합니다.
3. **운영 진단**에서 source 수신량과 6000 연결을 확인합니다.
4. **원본 로그 파일**에서 서버까지 파일이 도착했는지 확인합니다.

## Buffer가 증가

**운영 진단**에서 source는 증가하지만 sink가 멈췄는지 확인합니다. Backend 상태, Oracle 연결/pool, `vector-data` 디스크 여유와 시스템 로그를 순서대로 점검합니다.

## Oracle 적재 실패

1. **시스템 로그 → 오류**에서 stage, 대상 테이블과 메시지를 확인합니다.
2. VRL 결과 필드와 `config/table-registry.json` 매핑을 대조합니다.
3. Oracle 접속은 **시스템 설정 → Oracle → 연결 테스트**로 확인합니다.
4. 수정 후 원본 데이터가 있는 오류를 재전송하거나 파일을 수동 투입합니다.

## 설정 적용 후 수신 중단

최근 Aggregator 백업을 미리 보고 복구한 뒤 Vector를 다시 불러옵니다. VRL은 적용 전에 반드시 시뮬레이션하세요.
