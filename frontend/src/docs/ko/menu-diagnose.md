# 운영 진단

## 개요

Vector Aggregator, Oracle, 설비 연결과 처리량을 한 번에 점검하는 미션 컨트롤 화면입니다.

## 주요 지표

- 최근 10분의 Active Buffer, Vector 메모리, DB INSERT 추이
- Vector disk buffer의 Active·Rotation Wait·Orphan 구성
- source 수신량과 sink 전송량, TCP 6000 연결 수
- Oracle pool 연결 상태, 분당 적재량, 데이터 지연
- 장비별 온라인/오프라인 상태와 시스템 설정 요약

## 판단 순서

1. Backend·Vector·Oracle 연결 상태를 확인합니다.
2. source 수신량은 증가하지만 sink 전송량이 멈췄는지 봅니다.
3. Active Buffer와 Orphan 용량이 계속 증가하는지 확인합니다.
4. Oracle pool, 적재량과 지연 시간을 함께 비교합니다.

화면의 **새로고침**으로 최신 진단 결과를 다시 수집할 수 있습니다.
