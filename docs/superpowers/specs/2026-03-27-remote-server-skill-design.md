# Remote Server Management Skill 설계서

## 개요
SSH 기반으로 Windows 원격 서버에 접속하여 파일 탐색, 읽기, 복사, 수정, 서비스 확인, 환경 정보 수집 등을 대화형으로 수행하는 Claude Code 스킬.

## 스킬 정보
- **이름**: `remote`
- **호출**: `/remote`
- **방식**: 대화형 (인자 없이 호출 → 서버 선택 → 작업 반복)

## 접속 방식
- **프로토콜**: SSH (OpenSSH)
- **대상**: Windows 서버 (OpenSSH Server 활성화 필요)
- **인증**: 비밀번호 (`sshpass`) 또는 SSH 키
- **파일 전송**: `scp`

## 설정 파일
- **경로**: `~/.claude/remote-servers.json`
- `.gitignore`에 자동 추가 권장

```json
{
  "servers": {
    "prod-1": {
      "host": "192.168.1.10",
      "port": 22,
      "username": "admin",
      "password": "mypass123",
      "authType": "password",
      "description": "운영 서버 1호기"
    },
    "dev-server": {
      "host": "10.0.0.5",
      "port": 22,
      "username": "deploy",
      "authType": "key",
      "keyPath": "C:/Users/hsyou/.ssh/id_rsa",
      "description": "개발 서버"
    }
  },
  "defaults": {
    "port": 22,
    "username": "admin"
  }
}
```

## 지원 명령어

### 폴더/파일 탐색
| 요청 | SSH 명령 |
|---|---|
| "C:\logs 보여줘" | `dir C:\logs` |
| "하위 폴더 포함" | `dir /s C:\logs` |

### 파일 읽기
| 요청 | SSH 명령 |
|---|---|
| "access.log 보여줘" | `type C:\logs\access.log` |
| "마지막 50줄" | `powershell Get-Content C:\logs\access.log -Tail 50` |

### 파일/폴더 찾기
| 요청 | SSH 명령 |
|---|---|
| "*.log 파일 찾아줘" | `dir /s /b C:\*.log` |
| "vector 이름 포함 파일" | `dir /s /b C:\*vector*` |
| "최근 1일 내 수정 파일" | `powershell Get-ChildItem C:\ -Recurse \| Where{$_.LastWriteTime -gt (Get-Date).AddDays(-1)}` |

### 파일 내용 검색
| 요청 | SSH 명령 |
|---|---|
| "port=3100 찾아줘" | `findstr /s /i "port=3100" C:\config\*` |
| "ERROR 포함 줄" | `findstr /i "ERROR" C:\logs\access.log` |
| "keyword 포함 파일 목록" | `findstr /s /m /i "keyword" C:\path\*` |

### 파일 복사
| 요청 | 명령 |
|---|---|
| "로컬로 가져와" | `scp user@host:C:/file ./` |
| "서버로 보내줘" | `scp ./file user@host:C:/path/` |

### 파일 수정
1. `scp`로 로컬 임시 폴더에 다운로드
2. Claude가 `Read` → `Edit`로 수정
3. diff 표시 후 사용자 승인
4. `scp`로 업로드

### 서비스/프로세스
| 요청 | SSH 명령 |
|---|---|
| "서비스 상태 확인" | `sc query <서비스명>` |
| "실행 중인 프로세스" | `tasklist` |

### 환경 정보
| 요청 | SSH 명령 |
|---|---|
| "디스크 용량" | `wmic logicaldisk get size,freespace,caption` |
| "OS 정보" | `systeminfo` |
| "IP 확인" | `ipconfig` |

## 보안
- `remote-servers.json`은 `.gitignore`에 추가
- 위험 명령(del, rmdir, sc stop, shutdown 등) 실행 전 사용자 확인 필수
- 파일 수정 시 업로드 전 diff 확인 후 승인

## 에러 처리
- 접속 실패 → 주소/포트/방화벽 확인 안내
- 인증 실패 → 사용자명/비밀번호/키 경로 확인 안내
- 타임아웃(30초) → 계속 진행 여부 확인
- 권한 거부 → 관리자 권한 필요 안내
- 호스트 키 미등록 → fingerprint 표시 후 승인 요청

## sshpass 의존성
- 스킬 최초 실행 시 `sshpass` 설치 여부 확인
- 미설치 시 설치 방법 안내
- 키 인증 서버는 `sshpass` 불필요

## 대화 흐름
```
/remote → 설정 로드 → 서버 선택 → 연결 테스트 → 대화 루프
  ├─ 자연어 해석 → SSH/SCP 명령 변환
  ├─ 위험 명령 확인
  ├─ 실행 및 결과 표시
  └─ "종료" / "다른 서버" → 세션 종료 or 전환
```

## 편의 기능
- "서버 등록해줘" → 대화형으로 설정 추가
- "서버 목록" → 등록 서버 리스트 출력
- "서버 정보 수정" → 설정 변경/삭제
