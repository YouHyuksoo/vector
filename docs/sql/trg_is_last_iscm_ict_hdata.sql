CREATE OR REPLACE TRIGGER TRG_LOG_ISCM_ICT_HDATA_IS_LAST
BEFORE INSERT ON LOG_ISCM_ICT_HDATA
FOR EACH ROW
DECLARE

  lvd_inspect_date     date;

BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정
--
-- Header_Data 섹션은 설비가 찍은 실측 검사시각(TEST_DATE / TEST_TIME)을 갖고 있어
-- 이를 우선 사용하고, 파싱 실패 시 SYSDATE 로 폴백한다.
-- 포맷이 확정되지 않아 후보를 순서대로 시도한다 — 전부 실패해도 INSERT 는 막지 않는다
-- (trg_is_last_spi_vd 의 "쓰레기값이면 무시" 규약과 동일).
-------------------------------------------------------------------------------
  lvd_inspect_date := NULL;

  IF :NEW.TEST_DATE IS NOT NULL THEN
    BEGIN
      lvd_inspect_date := TO_DATE(
        TRIM(:NEW.TEST_DATE) || ' ' || NVL(TRIM(:NEW.TEST_TIME), '000000'),
        'YYYY-MM-DD HH24:MI:SS');
    EXCEPTION WHEN OTHERS THEN
      lvd_inspect_date := NULL;
    END;

    IF lvd_inspect_date IS NULL THEN
      BEGIN
        lvd_inspect_date := TO_DATE(
          REPLACE(REPLACE(TRIM(:NEW.TEST_DATE), '-', ''), '/', '')
          || NVL(REPLACE(TRIM(:NEW.TEST_TIME), ':', ''), '000000'),
          'YYYYMMDDHH24MISS');
      EXCEPTION WHEN OTHERS THEN
        lvd_inspect_date := NULL;
      END;
    END IF;
  END IF;

  -- 실측 시각을 못 얻으면 INSERT 시점 기준 (LOG_ICT 와 동일)
  lvd_inspect_date := NVL(lvd_inspect_date, SYSDATE);

  :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
  :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
  :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);

  --------------------------------------
  -- IS_LAST 고정 (BARCODE 단위 DELETE → INSERT 패턴, trg_is_last_iscm_ict 주석 참고)
  --------------------------------------

  :NEW.IS_LAST := 'Y';

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_ISCM_ICT_HDATA',
      '[TRG_LOG_ISCM_ICT_HDATA_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
