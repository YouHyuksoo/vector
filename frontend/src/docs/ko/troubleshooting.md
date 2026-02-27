# 문제 해결

## 자주 발생하는 오류

### Agent가 서버에 연결되지 않음

**증상**: 장비 수집기 목록에 Agent가 나타나지 않음

**확인 사항**:
1. Aggregator 서버가 실행 중인지 확인
2. Agent TOML의 `address`가 올바른 서버 IP:포트인지 확인
3. 방화벽에서 해당 포트(기본 9000)가 허용되어 있는지 확인
4. 네트워크 연결 테스트: `ping {서버 IP}`

**해결 방법**:
```bash
# 포트 연결 테스트
telnet 192.168.1.10 9000
```

### 로그가 수집되지 않음

**증상**: Agent는 온라인이지만 데이터가 들어오지 않음

**확인 사항**:
1. TOML의 `include` 경로가 실제 로그 파일 위치와 일치하는지 확인
2. 로그 파일이 `ignore_older_secs` 이내에 수정되었는지 확인
3. Vector 프로세스가 해당 파일에 읽기 권한이 있는지 확인

### Oracle DB 연결 실패

**증상**: 대시보드에서 Oracle 상태가 "중단"

**확인 사항**:
1. **설정** 페이지에서 Oracle 접속 정보 확인
2. Oracle 리스너 상태 확인: `lsnrctl status`
3. SID/서비스명이 올바른지 확인
4. 계정 비밀번호 만료 여부 확인

### 큐에 실패 건이 쌓임

**증상**: 큐 현황에서 "실패" 건수 증가

**확인 사항**:
1. **오류 현황** 페이지에서 상세 오류 메시지 확인
2. Oracle 테이블 구조가 매핑과 일치하는지 확인
3. 필수 필드가 누락되지 않았는지 확인

## 디버깅 방법

### Vector 로그 확인

```bash
# 상세 로그 모드로 실행
vector.exe --config config.toml --verbose

# 특정 컴포넌트 로그만 보기
VECTOR_LOG=debug vector.exe --config config.toml
```

### API 서버 로그 확인

Fastify 서버 콘솔에서 실시간 로그를 확인합니다.

### Redis 큐 상태 확인

```bash
redis-cli
> KEYS bull:*
> LLEN bull:log-queue:wait
```

## 성능 튜닝

| 항목 | 권장값 | 설명 |
|------|--------|------|
| `batch.max_events` | 10~50 | API 전송 배치 크기 |
| `batch.timeout_secs` | 5~10 | 배치 전송 주기 |
| `buffer.max_events` | 500 | 메모리 버퍼 크기 |
| BullMQ concurrency | 5 | 큐 동시 처리 수 |
