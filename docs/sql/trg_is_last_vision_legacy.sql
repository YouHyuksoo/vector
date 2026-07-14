CREATE OR REPLACE TRIGGER TRG_LOG_VISION_LEGACY_IS_LAST
BEFORE INSERT ON LOG_VISION_LEGACY
FOR EACH ROW
DECLARE
  lvd_inspect_date     date;
BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정
-- VISION_LEGACY 는 LOG_DATE(YYYYMMDD) 와 LOG_TIME(HH24MISS) 이 분리 저장됨
-- LOG_TIME 이 NULL 이면 날짜만 사용 (시간은 00:00:00)
-------------------------------------------------------------------------------
  if :NEW.LOG_DATE is not null then
     begin
        if :NEW.LOG_TIME is not null then
           lvd_inspect_date := to_date(:NEW.LOG_DATE || LPAD(:NEW.LOG_TIME, 6, '0'), 'YYYYMMDDHH24MISS');
        else
           lvd_inspect_date := to_date(:NEW.LOG_DATE, 'YYYYMMDD');
        end if;
        :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
        :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
        :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
     exception
        when others then
           null;  -- 쓰레기값 무시
     end;
  end if;

  UPDATE LOG_VISION_LEGACY
  SET IS_LAST = 'N'
  WHERE BARCODE = :NEW.BARCODE
    AND IS_LAST = 'Y';
  :NEW.IS_LAST := 'Y';

  IF :NEW.DEVICE_RESULT IS NOT NULL
     AND UPPER(:NEW.DEVICE_RESULT) NOT IN ('PASS','OK','GOOD','Y') THEN
    P_AUTO_INSERT_QC(:NEW.BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W150', :new.file_name);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_VISION_LEGACY',
      '[TRG_LOG_VISION_LEGACY_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
