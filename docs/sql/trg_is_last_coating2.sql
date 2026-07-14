CREATE OR REPLACE TRIGGER TRG_LOG_COATING2_IS_LAST
BEFORE INSERT ON LOG_COATING2
FOR EACH ROW
DECLARE
  lvd_inspect_date     date;
BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (DATE_TIME 기준, 포맷: YYYYMMDDHH24MISS)
-------------------------------------------------------------------------------
  if :NEW.DATE_TIME is not null then
     lvd_inspect_date := to_date(:NEW.DATE_TIME, 'YYYYMMDDHH24MISS');
     :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
     :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
     :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
  end if;

  UPDATE LOG_COATING2
  SET IS_LAST = 'N'
  WHERE BARCODE = :NEW.BARCODE
    AND IS_LAST = 'Y';
  :NEW.IS_LAST := 'Y';

  IF :NEW.RESULT IS NOT NULL
     AND UPPER(:NEW.RESULT) NOT IN ('PASS','OK','GOOD','Y') THEN
    P_AUTO_INSERT_QC(:NEW.BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W121', :new.file_name);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_COATING2',
      '[TRG_LOG_COATING2_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
