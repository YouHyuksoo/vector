CREATE OR REPLACE TRIGGER TRG_LOG_MAOI_IS_LAST
BEFORE INSERT ON LOG_MAOI
FOR EACH ROW
DECLARE
  lvd_inspect_date     date;
BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (START_DATE 기준, 포맷: YYYY/MM/DD HH24:MI:SS)
-- MAOI 는 START_DATE 가 VARCHAR2(100) 이라 DATE형으로 변환 후 함수 호출
-------------------------------------------------------------------------------
  if :NEW.START_DATE is not null then
     lvd_inspect_date := to_date(:NEW.START_DATE, 'YYYY/MM/DD HH24:MI:SS');
     :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
     :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
     :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
  end if;

  UPDATE LOG_MAOI
  SET IS_LAST = 'N'
  WHERE SERIAL_NO = :NEW.SERIAL_NO
    AND IS_LAST = 'Y';

  :NEW.IS_LAST := 'Y';

  IF :NEW.RESULT IS NOT NULL
     AND UPPER(:NEW.RESULT) NOT IN ('PASS','OK','GOOD','Y') THEN
    P_AUTO_INSERT_QC(:NEW.SERIAL_NO, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W060', :new.file_name);
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_MAOI',
      '[TRG_LOG_MAOI_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
