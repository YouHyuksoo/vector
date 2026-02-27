# 수집기 설치 가이드

## 시스템 요구사항

| 구분 | 최소 사양 |
|------|-----------|
| OS | Windows 10 이상 / Linux (x64) |
| RAM | 512MB 이상 |
| 디스크 | 100MB (Vector 엔진) + 로그 저장 공간 |
| 네트워크 | Aggregator 서버와 TCP 통신 가능 |

## 설치 순서

### 1. Vector 엔진 다운로드

관리 화면의 **송신기 다운로드** 페이지에서 `vector.zip`을 다운로드합니다.

### 2. 압축 해제

설비 PC의 원하는 경로에 압축을 해제합니다.

```
C:\vector\
  ├── vector.exe
  └── (설정 파일 위치)
```

### 3. 설정 파일 배치

**송신기 다운로드** 페이지에서 해당 설비의 TOML 설정 파일을 다운로드하여 같은 폴더에 배치합니다.

```
C:\vector\
  ├── vector.exe
  └── EQUIP-01.toml
```

### 4. 설정 파일 수정

TOML 파일에서 아래 항목을 실제 환경에 맞게 수정합니다:

- **include**: 실제 로그 파일 경로
- **address**: Aggregator 서버 IP 및 포트

### 5. 실행

```bash
vector.exe --config EQUIP-01.toml
```

## 폴더 구조

```
프로젝트 루트/
├── config/
│   ├── aggregator.toml    # Aggregator(수신기) 설정
│   └── agents/            # 설비별 Agent 설정
│       ├── EQUIP-01.toml
│       └── EQUIP-02.toml
├── data/                  # 수집 데이터 저장
├── logs/                  # 시스템 로그
└── vector.exe             # Vector 엔진
```

## 서비스 등록 (선택)

Windows 서비스로 등록하면 부팅 시 자동 실행됩니다:

```bash
sc create VectorAgent binPath= "C:\vector\vector.exe --config C:\vector\EQUIP-01.toml"
sc config VectorAgent start= auto
```
