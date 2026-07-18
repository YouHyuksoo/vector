# 대시보드

## 개요

중앙 수집 시스템의 연결 흐름과 등록된 Oracle 타겟을 빠르게 확인하는 첫 화면입니다.

## 화면 구성

- **인프라 상태**: Backend, Vector Aggregator, Oracle과 서버 실행 환경
- **서비스 연결 흐름**: Agent → Aggregator → Backend → Oracle 단계별 상태와 처리량
- **등록된 테이블**: `config/table-registry.json`에 등록된 TABLE 타겟과 컬럼 수
- **업데이트 시각**: 마지막 상태 조회 시각과 조회 오류

장비별 상태는 **장비 대시보드**, buffer와 병목은 **운영 진단**, 상세 처리 이력은 **시스템 로그**에서 확인합니다.
