-- ================================================================
-- SMT 마킹 로그 BOT_SERIAL_NO 오류 레코드 추출 + 예상값 복원
-- ================================================================
-- 배경:
--   P_SMT_MARKING_SAVE_RESULT 호출 시 p_pre_barcode(5번째 파라미터)에
--   BOT L 바코드를 넣어야 하는데, 일부 설비가 TOP L 바코드(또는 이전 마킹의
--   바코드)를 넣어서 호출 → IP_SMT_MARKING_LOG.BOT_SERIAL_NO 컬럼에
--   잘못된 값이 저장됨.
--
-- 판별 기준:
--   - 본 시스템은 BOT/TOP 양면에 동일한 SERIAL_NO를 마킹하는 구조
--   - (EQP01 01A63ED0F, EQP_02 MOBIS163LD18 데이터로 검증됨)
--   - 따라서 정상 저장 시: BOT_SERIAL_NO = SERIAL_NO
--   - WRONG: SIDE_FLAG='T' AND BOT_SERIAL_NO <> SERIAL_NO
--
-- 한계:
--   - "설비가 TOP L을 pre_barcode에 넣었어도 결과가 우연히 SERIAL_NO와
--      같은" 케이스는 본 필터에 포함되지 않음 (REQUEST_TEXT가 있는
--      2026-03-23 이후 데이터에서는 추가 식별 가능)
--   - 예상값(=SERIAL_NO)은 BOT/TOP 동일 바코드 구조 가정 하에서 유효
-- ================================================================

SELECT
    t.SEQ_NO,
    t.RUN_NO,
    t.SERIAL_NO_NUM,
    t.LR_FLAG,
    t.MACHINE_CODE,
    t.LINE_CODE,
    TO_CHAR(t.MARKING_DT, 'YYYY-MM-DD HH24:MI:SS') MARKING_DT,
    t.SERIAL_NO                                       "현재_TOP_SERIAL_NO",
    t.BOT_SERIAL_NO                                   "잘못저장된_BOT_SERIAL_NO",
    t.SERIAL_NO                                       "예상_BOT_SERIAL_NO",
    b.SERIAL_NO                                       "EQP_02_실제_BOT_SN_교차검증",
    CASE
        WHEN b.SERIAL_NO IS NULL                         THEN 'NO_BOT_LOG'
        WHEN b.SERIAL_NO = t.SERIAL_NO                    THEN 'CONFIRMED_OK_PREDICT'
        ELSE                                                   'CONFLICT'
    END                                               "검증결과",
    t.REQUEST_TEXT
FROM IP_SMT_MARKING_LOG t
LEFT JOIN IP_SMT_MARKING_LOG b
       ON b.RUN_NO        = t.RUN_NO
      AND b.SERIAL_NO_NUM = t.SERIAL_NO_NUM
      AND b.LR_FLAG       = t.LR_FLAG
      AND b.SIDE_FLAG     = 'B'
WHERE t.SIDE_FLAG     = 'T'
  AND t.BOT_SERIAL_NO <> t.SERIAL_NO
ORDER BY t.MACHINE_CODE, t.MARKING_DT, t.SEQ_NO;
