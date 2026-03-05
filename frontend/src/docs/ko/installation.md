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

설비 PC의 원하는 경로에 압축을 해제합니다. zip에는 실행파일과 배치 스크립트가 포함되어 있습니다.

```
C:\vector\
  ├── bin\vector.exe         # Vector 엔진 실행파일
  ├── start-vector.bat       # 수동 시작 스크립트
  ├── stop-vector.bat        # 수동 정지 스크립트
  ├── install-service.bat    # Windows 서비스 등록
  └── uninstall-service.bat  # Windows 서비스 제거
```

### 3. 설정 파일 배치

**송신기 다운로드** 페이지에서 해당 설비의 TOML 설정 파일을 다운로드하여 같은 폴더에 배치합니다.

```
C:\vector\
  ├── bin\vector.exe
  ├── start-vector.bat
  ├── install-service.bat
  └── SPI.toml              # 설비별 TOML 설정
```

### 4. 설정 파일 수정

TOML 파일에서 아래 항목을 실제 환경에 맞게 수정합니다:

- **include**: 실제 로그 파일 경로
- **address**: Aggregator 서버 IP 및 포트
- **data_dir**: Vector 내부 데이터 저장 경로 (폴더가 없으면 자동 생성됩니다)

### 5. 실행

**방법 1 - 배치 파일 (권장):**

`start-vector.bat`을 더블클릭하면 자동으로 TOML 파일을 감지하여 실행합니다.

- TOML에 설정된 `data_dir` 폴더가 없으면 **자동 생성**됩니다
- 이미 실행 중인 경우 경고를 표시합니다

**방법 2 - 직접 실행:**

```bash
bin\vector.exe --config SPI.toml
```

## 폴더 구조

```
설치 폴더/
├── bin/
│   └── vector.exe           # Vector 엔진
├── start-vector.bat         # 수동 시작
├── stop-vector.bat          # 수동 정지
├── install-service.bat      # 서비스 등록
├── uninstall-service.bat    # 서비스 제거
├── EQUIP-01.toml            # 설비 설정 파일
└── config/                  # Vector 기본 설정 (참고용)
```

## 서비스 등록 (선택)

Windows 서비스로 등록하면 부팅 시 자동 실행됩니다.

**`install-service.bat`을 관리자 권한으로 실행:**

1. 우클릭 → "관리자 권한으로 실행"
2. TOML 파일이 여러 개인 경우 선택 화면이 나타납니다
3. `data_dir` 폴더가 없으면 자동 생성됩니다
4. 서비스명: `VectorAgent_{설비명}` (예: `VectorAgent_SPI`)
5. 실패 시 자동 재시작 정책이 설정됩니다 (5초/10초/30초)
6. 서비스 제거: `uninstall-service.bat` 실행
