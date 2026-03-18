# 송신기 다운로드

## 개요

설비 PC에 설치할 Vector 엔진, Agent Manager, 설비별 TOML 설정 파일을 다운로드하는 페이지입니다.

## 화면 구성

### 1. Vector 실행파일

**vector.zip 다운로드** 버튼을 클릭하면 Vector 엔진 압축 파일을 다운로드합니다.

- 파일 크기: 약 40MB
- zip에 포함된 파일: `bin/vector.exe`, `config/`, `licenses/`, bat 파일들
- Agent Manager의 "Vector 설치" 기능을 사용하면 자동으로 다운로드+압축 해제됩니다

### 2. Agent Manager

**agent-manager.exe 다운로드** 버튼을 클릭하면 설비 PC 종합 관리 프로그램을 다운로드합니다.

- 파일 크기: 약 45MB
- **exe 하나만으로 단독 실행** (Node.js 불필요, 추가 파일 불필요)
- 실행하면 웹 브라우저(`http://localhost:9090`)에서 관리 UI에 접근
- **다국어 지원**: 한국어, English, Español, Tiếng Việt

**Agent Manager 주요 기능:**

| 기능 | 설명 |
|------|------|
| **상태 모니터링** | Vector 실행 상태, PID, 가동 시간, 전송 메트릭 |
| **설정 관리** | 폼 모드(설비 정보 입력) + TOML 직접 편집 모드 |
| **프로세스 제어** | Vector 시작/중지/재시작, Aggregator 연결 테스트 |
| **Vector 설치** | 마스터 서버에서 vector.zip 자동 다운로드 + 압축 해제 |
| **Vector 업데이트** | 버전 확인 + 새 버전 다운로드 교체 |
| **서비스 등록** | Windows 서비스로 등록/해제 (자동 시작) |

### 3. 설비별 설정 파일

**송신기 설정** 페이지에서 등록한 모든 설비의 TOML 파일 목록이 표시됩니다.

- 각 설비 옆의 **다운로드** 버튼으로 개별 다운로드
- 다운로드한 TOML 파일을 `C:\vector\config\` 폴더에 저장합니다
- Agent Manager가 config 폴더에서 .toml 파일을 자동으로 찾습니다 (파일명 무관)

## 설비 PC 설치 순서

### 방법 A: Agent Manager 사용 (권장)

```
1. agent-manager.exe 다운로드 → 설비 PC에서 실행
2. http://localhost:9090 접속
3. 관리 탭 → "Vector 설치" 클릭 (vector.zip 자동 다운로드 + C:\vector\에 압축 해제)
4. 이 페이지에서 설비 TOML 다운로드 → C:\vector\config\ 에 저장
5. 설정 탭 → 설비 정보 확인/수정 (로그 경로, IP 등) → 저장
6. 관리 탭 → "시작" 클릭
7. (선택) 관리 탭 → Windows 서비스 등록 (PC 재부팅 시 자동 시작)
```

### 방법 B: 수동 설치

```
1. vector.zip 다운로드 → C:\vector\ 에 압축 해제
2. 설비 TOML 다운로드 → C:\vector\config\ 에 저장
3. TOML 파일 편집:
   - include = ["C:\\실제\\로그\\경로\\*.csv"]
   - address = "실제서버IP:6000"
4. 실행: start-vector.bat 더블클릭
   또는 서비스 등록: install-service.bat 관리자 실행
5. 대시보드에서 Agent 온라인 확인
```
