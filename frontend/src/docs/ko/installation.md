# 수집기 설치 가이드

## 권장 설치: Agent Manager

1. **송신기 다운로드**에서 운영체제에 맞는 `agent-manager` 실행 파일을 받습니다.
2. 설비 PC에서 실행하고 `http://localhost:9090`에 접속합니다.
3. 관리 화면에서 Vector를 설치하면 파일이 `C:\vector`에 배치됩니다.
4. 서버에서 설비 TOML을 다운로드해 `C:\vector`에 저장합니다.
5. Agent Manager 설정 화면에서 설비 ID, 유형, 라인, 로그 경로와 서버 주소를 확인합니다.
6. Vector를 시작하고 필요하면 Windows 서비스로 등록합니다.
7. 중앙 **장비 대시보드**에서 온라인 상태를 확인합니다.

## 수동 설치

1. `vector.zip`(64비트) 또는 `vector-x86.zip`(32비트)을 `C:\vector`에 풉니다.
2. 설비 TOML을 같은 폴더에 둡니다.
3. `include`, `exclude`, `equipment_id`, `line_code`, `address = "서버IP:6000"`을 실제 환경에 맞춥니다.
4. 설정을 검증한 뒤 Vector를 시작합니다.

```powershell
C:\vector\vector.exe validate --config C:\vector\EQUIPMENT.toml
C:\vector\vector.exe --config C:\vector\EQUIPMENT.toml
```

## 네트워크

설비 PC에서 중앙 서버 TCP 6000 접근이 가능해야 합니다. Fluent Bit 사용 설비는 TCP 24224를 사용합니다.
