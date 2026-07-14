CREATE OR REPLACE TRIGGER TRG_LOG_FCT_IS_LAST
BEFORE INSERT ON LOG_FCT
FOR EACH ROW
DECLARE
  lvd_inspect_date     date;
BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정
-- FCT 는 LOG_DATE(YYYY-MM-DD) 와 LOG_TIME(HH24:MI:SS) 이 분리되어 저장됨
-- LOG_TIME 이 NULL 이면 날짜만 사용 (시간은 00:00:00)
-------------------------------------------------------------------------------
  if :NEW.LOG_DATE is not null then
     if :NEW.LOG_TIME is not null then
        lvd_inspect_date := to_date(:NEW.LOG_DATE || ' ' || :NEW.LOG_TIME, 'YYYY-MM-DD HH24:MI:SS');
     else
        lvd_inspect_date := to_date(:NEW.LOG_DATE, 'YYYY-MM-DD');
     end if;
     :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
     :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
     :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
  end if;

  UPDATE LOG_FCT
  SET IS_LAST = 'N'
  WHERE BARCODE = :NEW.BARCODE
    AND IS_LAST = 'Y';
  :NEW.IS_LAST := 'Y';

  IF :NEW.RESULT IS NOT NULL
     AND UPPER(:NEW.RESULT) NOT IN ('PASS','OK','GOOD','Y') THEN
    P_AUTO_INSERT_QC(:NEW.BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W135', :NEW.File_Name);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_FCT',
      '[TRG_LOG_FCT_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
