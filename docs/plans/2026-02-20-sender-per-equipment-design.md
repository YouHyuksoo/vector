# 송신기 설비별 설정 관리

## 개요
송신기(Agent) TOML 설정을 설비 유형별로 분리 관리하여, 각 설비에서 자신의 설정을 다운로드하여 바로 설치할 수 있도록 한다.

## 설비 유형 (초기)
SP, SPI, MAOI, AOI, REFLOW — 이후 추가 가능

## 파일 구조
```
vector-config/agent/
├── SP.toml
├── SPI.toml
├── MAOI.toml
├── AOI.toml
└── REFLOW.toml
```

## Backend API
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/monitor/agent/configs | 설비 목록 반환 |
| GET | /api/monitor/agent/config/:name | 특정 설비 TOML 조회 |
| PUT | /api/monitor/agent/config/:name | 특정 설비 TOML 저장 + .bak 백업 |
| POST | /api/monitor/agent/configs | 새 설비 생성 { name, content? } |
| DELETE | /api/monitor/agent/config/:name | 설비 설정 삭제 |
| GET | /api/monitor/agent/config/:name/download | .toml 파일 다운로드 |

## Frontend UI
좌우 분할 레이아웃:
- 좌측: 설비 목록 카드 + 추가/삭제
- 우측: 선택된 설비 TOML 에디터 + 다운로드 버튼
