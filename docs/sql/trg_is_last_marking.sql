CREATE OR REPLACE TRIGGER TRG_LOG_MARKING_IS_LAST
BEFORE INSERT ON LOG_MARKING
FOR EACH ROW
DECLARE
  lvd_inspect_date     date;
BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (MARKING_DT 기준, 포맷: YYYYMMDDHH24MISS)
-------------------------------------------------------------------------------
  if :NEW.MARKING_DT is not null then
     lvd_inspect_date := to_date(:NEW.MARKING_DT, 'YYYYMMDDHH24MISS');
     :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
     :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
     :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
  end if;

  UPDATE LOG_MARKING
     SET IS_LAST = 'N'
   WHERE MAIN_BARCODE   = :NEW.MAIN_BARCODE
     AND MARKED_BARCODE = :NEW.MARKED_BARCODE
     AND IS_LAST = 'Y';

  :NEW.IS_LAST := 'Y';

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_MARKING',
      '[TRG_LOG_MARKING_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
