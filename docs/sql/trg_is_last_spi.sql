CREATE OR REPLACE TRIGGER TRG_LOG_SPI_IS_LAST
BEFORE INSERT ON LOG_SPI
FOR EACH ROW
DECLARE
  lvd_inspect_date     date;
BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정
-- SPI 는 INSPECTION_DATE(YYYY-MM-DD) 와 INSPECTION_END_TIME(HH24:MI:SS) 이 분리 저장됨
-- INSPECTION_END_TIME 이 NULL 이면 날짜만 사용 (시간은 00:00:00)
-------------------------------------------------------------------------------
  if :NEW.INSPECTION_DATE is not null then
     if :NEW.INSPECTION_END_TIME is not null then
        lvd_inspect_date := to_date(:NEW.INSPECTION_DATE || ' ' || :NEW.INSPECTION_END_TIME, 'YYYY-MM-DD HH24:MI:SS');
     else
        lvd_inspect_date := to_date(:NEW.INSPECTION_DATE, 'YYYY-MM-DD');
     end if;
     :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
     :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
     :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
  end if;

  UPDATE LOG_SPI
     SET IS_LAST = 'N'
   WHERE ARRAY_BARCODE = :NEW.ARRAY_BARCODE   -- MASTER_BARCODE - ARRAY_BARCODE  : 1:N
     AND IS_LAST = 'Y';

  :NEW.IS_LAST := 'Y';

/*  IF :NEW.PCB_RESULT IS NOT NULL  AND UPPER(:NEW.PCB_RESULT) NOT IN ('PASS','OK','GOOD','Y') THEN
     P_AUTO_INSERT_QC(:NEW.ARRAY_BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W030',:new.file_name);
  END IF;*/

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_SPI',
      '[TRG_LOG_SPI_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
