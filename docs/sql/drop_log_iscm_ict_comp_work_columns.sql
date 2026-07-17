-- =============================================================================
--  LOG_ISCM_ICT_COMP 에서 작업일자 컬럼/트리거 제거
-- =============================================================================
--  COMP 는 BARCODE 로만 조회한다. 작업일자로 직접 거는 조회가 없으므로
--  ACTUAL_DATE / SHIFT_CODE / ZONE_CODE 를 두지 않는다.
--  작업일자가 필요하면 BARCODE 로 LOG_ISCM_ICT_HDATA 를 조인해서 얻는다.
--
--  IS_LAST 도 제거한다. backend 가 BARCODE 단위 DELETE 후 INSERT 하므로
--  COMP 에 남아있는 행은 항상 최신이고, 최신 여부를 따로 표시할 이유가 없다.
-- =============================================================================

BEGIN
  EXECUTE IMMEDIATE 'DROP TRIGGER TRG_LOG_ISCM_ICT_COMP_IS_LAST';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -4080 THEN RAISE; END IF;  -- ORA-04080: 트리거 없음 → 무시
END;
/

DECLARE
  TYPE t_names IS TABLE OF VARCHAR2(128);
  v_cols t_names := t_names('ACTUAL_DATE', 'SHIFT_CODE', 'ZONE_CODE', 'IS_LAST');
  v_cnt  NUMBER;
BEGIN
  FOR j IN 1 .. v_cols.COUNT LOOP
    SELECT COUNT(*) INTO v_cnt
      FROM user_tab_columns
     WHERE table_name = 'LOG_ISCM_ICT_COMP'
       AND column_name = v_cols(j);

    IF v_cnt > 0 THEN
      EXECUTE IMMEDIATE 'ALTER TABLE LOG_ISCM_ICT_COMP DROP COLUMN ' || v_cols(j);
    END IF;
  END LOOP;
END;
/
