# 송신기 다운로드

## 배포 파일

| 항목 | 제공 파일 | 용도 |
|---|---|---|
| Vector 64비트 | `vector.zip` | 일반 Windows x64 설비 |
| Vector 32비트 | `vector-x86.zip` | 구형 Windows 설비 |
| Agent Manager | x64/x86 실행 파일 | 설비 PC 로컬 관리 UI와 서비스 제어 |
| Fluent Bit | `fluent-bit.zip` | Vector를 사용하기 어려운 32비트 환경 |
| 설비 설정 | `.toml` 또는 `.conf` | 송신기 설정 화면에서 관리한 구성 |

## 권장 배포 순서

1. 설비 PC 아키텍처에 맞는 Agent Manager를 실행합니다.
2. Agent Manager에서 Vector를 `C:\vector`에 설치합니다.
3. 이 화면에서 해당 설비 설정을 내려받아 같은 폴더에 둡니다.
4. 로컬 설정 화면에서 로그 경로와 중앙 서버 주소를 확인합니다.
5. Vector를 시작하고 Windows 서비스로 등록합니다.
6. 중앙 장비 대시보드에서 온라인 상태를 확인합니다.
