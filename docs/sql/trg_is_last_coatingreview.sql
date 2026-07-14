CREATE OR REPLACE TRIGGER TRG_LOG_COATINGREVIEW_IS_LAST
BEFORE INSERT ON LOG_COATINGREVIEW
FOR EACH ROW
DECLARE

  lvl_count            number;
  lvd_inspect_date     date;

BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (SAVE_DATE 기준, 포맷: YYYYMMDDHH24MISS)
-------------------------------------------------------------------------------
  if :NEW.SAVE_DATE is not null then
     lvd_inspect_date := to_date(:NEW.SAVE_DATE, 'YYYYMMDDHH24MISS');
     :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
     :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
     :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
  end if;

  -- IS_LAST 확인

  UPDATE LOG_COATINGREVIEW
     SET IS_LAST = 'N'
   WHERE SUB_BARCODE = :NEW.SUB_BARCODE
     AND IS_LAST = 'Y';

  :NEW.IS_LAST := 'Y';

  -- SAMPLE 확인

  select count(*)
    into lvl_count
    from imcn_sample
   where sample_barcode = :NEW.SUB_BARCODE
     and sample_type = 'T'
     and rownum = 1 ;

  if ( lvl_count > 0 ) then
       :NEW.IS_SAMPLE := 'Y';

  else

       IF :NEW.AREA_RESULT IS NOT NULL AND UPPER(:NEW.AREA_RESULT) NOT IN ('PASS','OK','GOOD','Y') THEN
           P_AUTO_INSERT_QC(:NEW.SUB_BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W122', :new.file_name);
       END IF;

  end if ;

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_COATINGREVIEW',
      '[TRG_LOG_COATINGREVIEW_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
