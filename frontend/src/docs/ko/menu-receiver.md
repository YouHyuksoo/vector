# 수신기 설정

## 개요

중앙 Vector Aggregator의 TOML 설정과 백업 이력을 관리합니다.

## 설정 영역

- Vector data directory와 관리 API
- Vector Agent `:6000`, Fluent Bit `:24224` 수신 설정
- HTTP sink `http://127.0.0.1:3110/api/logs`
- batch 크기·시간, request timeout·동시성
- disk buffer 크기와 `when_full` 안전 정책
- 대상 유형과 테이블/프로시저, 타임스탬프 처리

복잡한 설비별 VRL은 **VRL & 매핑** 화면에서 수정합니다. 원본 로그 저장은 현재 Fastify가 `RAW_LOG_BASE_PATH` 아래에서 담당합니다.

## 저장과 복구

설정을 저장하면 기존 TOML 백업이 남습니다. 변경 이력에서 내용을 미리 보고 복구할 수 있으며, 복구 전 현재 설정도 다시 백업됩니다. 설정 반영 후 Vector를 다시 불러오세요.
