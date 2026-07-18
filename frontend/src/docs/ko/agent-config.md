# Agent 설정

## 역할

Vector Agent 또는 Fluent Bit이 설비 로그 파일을 감시하고 중앙 Aggregator로 전송합니다.

## 필수 정보

| 항목 | 설명 |
|---|---|
| 설비 유형 | Aggregator의 VRL 분기 키 |
| 로그 유형 | 처리 로그 분류 |
| 라인 코드 | 생산 라인 식별자 |
| 설비 ID | 하트비트와 원본 저장 경로의 고유 키 |
| include / exclude | 포함·제외할 파일 glob |
| read_from | 기존 파일을 처음부터 읽을지, 새 내용부터 읽을지 |
| address | 중앙 서버 `IP:6000` |

## 송신기 설정 화면

1. 왼쪽에서 Vector 또는 Fluent Bit 구성을 선택합니다.
2. 설비 정보와 서버 연결을 입력합니다.
3. 감시 경로, 제외 경로, 재귀 검색, 전체 파일 묶기 옵션을 확인합니다.
4. fingerprint·multiline·재전송 폴더와 disk buffer 정책을 필요에 맞게 설정합니다.
5. 저장 전 TOML 검증 결과를 확인하고 설정 파일을 다운로드합니다.

> 같은 파일을 다시 읽지 않도록 `data_dir`와 fingerprint 설정을 임의로 초기화하지 마세요.
