# Agent 설정

## 개요

Agent는 각 설비 PC에 설치되어 로그 파일을 수집하고 Aggregator 서버로 전송하는 컴포넌트입니다.

## TOML 설정 구조

```toml
data_dir = "./data"

[sources.file_log]
type = "file"
include = ["C:/logs/*.csv"]
read_from = "end"
ignore_older_secs = 86400

[transforms.add_meta]
type = "remap"
inputs = ["file_log"]
source = '''
  .equip_type = "AOI"
  .line_code = "LINE-01"
  .equip_id = "AOI-001"
'''

[sinks.to_aggregator]
type = "vector"
inputs = ["add_meta"]
address = "192.168.1.10:9000"
```

## 주요 설정 항목

### Source (로그 수집)

| 항목 | 설명 | 예시 |
|------|------|------|
| `include` | 감시할 로그 파일 경로 | `["C:/logs/*.csv"]` |
| `read_from` | 읽기 시작 위치 | `end` (새 줄만) / `beginning` (전체) |
| `ignore_older_secs` | 오래된 파일 무시 (초) | `86400` (24시간) |

### Transform (메타데이터)

| 항목 | 설명 |
|------|------|
| `equip_type` | 설비 유형 (SP, SPI, AOI 등) |
| `line_code` | 라인 코드 |
| `equip_id` | 설비 고유 ID |

### Sink (서버 전송)

| 항목 | 설명 |
|------|------|
| `address` | Aggregator 서버 IP:포트 |

## 설비 유형별 설정

**송신기 설정** 페이지에서 GUI로 편집하거나, TOML 직접 편집 모드를 사용할 수 있습니다.

### 로그 경로 예시

| 설비 유형 | 경로 패턴 |
|-----------|-----------|
| SP | `C:/SP_DATA/results/*.csv` |
| SPI | `D:/SPI/inspection/*.log` |
| AOI | `C:/AOI/output/*.dat` |
| REFLOW | `C:/REFLOW/temp/*.csv` |

## 관리 화면에서 설정

1. **송신기 설정** 페이지에서 설비를 선택합니다
2. 설비 정보(유형, 라인 코드, ID)를 입력합니다
3. 로그 경로와 서버 연결 정보를 설정합니다
4. 저장 후 **송신기 다운로드** 페이지에서 설정 파일을 다운로드합니다
