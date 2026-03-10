# 송신기 다운로드

## 개요

설비 PC에 설치할 Vector 엔진과 설비별 TOML 설정 파일을 다운로드하는 페이지입니다.

## 전제조건

- Fastify 서버가 실행 중이어야 합니다
- Vector 실행파일(`vector.zip`)이 서버의 다운로드 경로에 있어야 합니다
- 설비 설정 파일을 다운로드하려면 **송신기 설정**에서 설비가 등록되어 있어야 합니다

## 화면 구성

### 1. Vector 실행파일

**vector.zip 다운로드** 버튼을 클릭하면 Vector 엔진 압축 파일을 다운로드합니다.

- 파일 크기: 약 40MB
- 설비 PC에 압축 해제 후 사용합니다
- zip에 포함된 파일: `bin/vector.exe`, `start-vector.bat`, `stop-vector.bat`, `install-service.bat`, `uninstall-service.bat`

### 2. Agent Manager

**agent-manager.exe 다운로드** 버튼을 클릭하면 설비 PC 종합 관리 프로그램을 다운로드합니다.

- 파일 크기: 약 45MB
- Node.js 설치 없이 단독 실행 가능한 exe 파일입니다
- 설비 PC에서 `agent-manager.exe`를 실행하면 웹 브라우저(`http://localhost:9090`)에서 관리 UI에 접근할 수 있습니다

**Agent Manager 주요 기능:**

| 기능 | 설명 |
|------|------|
| **상태 모니터링** | Vector 실행 상태, PID, 가동 시간, 전송 메트릭 |
| **설정 관리** | 폼 모드(설비 정보 입력) + TOML 직접 편집 모드 |
| **프로세스 제어** | Vector 시작/중지/재시작, Aggregator 연결 테스트 |
| **Vector 설치** | 마스터 서버에서 vector.exe 자동 다운로드 |
| **Vector 업데이트** | 버전 확인 + 새 버전 다운로드 교체 |
| **서비스 등록** | Windows 서비스로 등록/해제 (자동 시작) |

### 3. 설비별 설정 파일

**송신기 설정** 페이지에서 등록한 모든 설비의 TOML 파일 목록이 표시됩니다.

- 각 설비 옆의 **다운로드** 버튼으로 개별 다운로드
- 다운로드한 TOML 파일을 Vector 실행파일과 같은 폴더에 배치합니다

### 4. 설치 방법 가이드

화면 하단에 설치 방법이 안내됩니다.

## 설비 PC 설치 순서

### 방법 A: Agent Manager 사용 (권장)

```
1. agent-manager.exe를 다운로드하여 설비 PC에 복사
2. agent-manager.exe 실행 → 브라우저에서 http://localhost:9090 접속
3. 관리 탭 → "Vector 설치" 버튼 클릭 (자동 다운로드)
4. 설정 탭 → 폼 모드에서 설비 정보 입력 (설비 ID, 타입, IP, 라인, 로그 경로, 서버 주소)
5. 관리 탭 → "시작" 버튼으로 Vector 실행
6. (선택) 관리 탭 → Windows 서비스 등록으로 자동 시작 설정
```

### 방법 B: 수동 설치

```
1. vector.zip 다운로드 → 압축 해제
2. 설비 TOML 다운로드 → 같은 폴더에 배치
3. TOML 파일 편집:
   - include = ["C:/실제/로그/경로/*.csv"]
   - address = "실제서버IP:6000"
4. 실행: start-vector.bat 더블클릭 (data_dir 자동 생성)
   또는 서비스 등록: install-service.bat 관리자 실행
5. 대시보드에서 Agent 온라인 확인
```
