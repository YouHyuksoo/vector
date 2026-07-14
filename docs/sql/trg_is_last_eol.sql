CREATE OR REPLACE TRIGGER TRG_LOG_EOL_IS_LAST
BEFORE INSERT ON LOG_EOL
FOR EACH ROW

DECLARE

  lvl_count            number;
  lvd_inspect_date     date;

BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (START_TIME 기준)
-- 형식이 'YYYY-MM-DD HH24:MI:SS' 또는 'YYYYMMDDHH24MISS' 둘 다 허용
-- year=0 등 잘못된 값(ORA-01841)은 NULL로 fallback하여 INSERT 통과
-------------------------------------------------------------------------------
  if :NEW.START_TIME is not null then
     BEGIN
        lvd_inspect_date := to_date(:NEW.START_TIME, 'YYYY-MM-DD HH24:MI:SS');
     EXCEPTION WHEN OTHERS THEN
        BEGIN
           lvd_inspect_date := to_date(:NEW.START_TIME, 'YYYYMMDDHH24MISS');
        EXCEPTION WHEN OTHERS THEN
           lvd_inspect_date := NULL;
        END;
     END;

     if lvd_inspect_date is not null then
        :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
        :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
        :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
     end if;
  end if;

  --------------------------------------
  -- IS_LAST 처리
  --------------------------------------

  UPDATE LOG_EOL
     SET IS_LAST = 'N'
   WHERE BARCODE = :NEW.BARCODE
     AND IS_LAST = 'Y';

  :NEW.IS_LAST := 'Y';


  --------------------------------------
  -- SAMPLE 확인
  --------------------------------------

  select count(*)
    into lvl_count
    from imcn_sample
   where sample_barcode =  :NEW.BARCODE
     and sample_type = 'E'
     and rownum = 1 ;

  if ( lvl_count > 0 ) then
       :NEW.IS_SAMPLE := 'Y';

  else

       IF :NEW.ARRAY_RESULT IS NOT NULL AND UPPER(:NEW.ARRAY_RESULT) NOT IN ('PASS','OK','GOOD','Y') THEN
           P_AUTO_INSERT_QC(:NEW.BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W155', :NEW.FILE_NAME);
       END IF;

  end if ;

  --------------------------------------
  -- Set vs Product label mapping
  --------------------------------------
/*
  select count(*)
    into lvl_count
    from ip_product_2d_barcode
   where serial_no    = :new.barcode
     and rating_label = :new.label ;

 if ( lvl_count = 0 and :new.label is not null ) then

      update ip_product_2d_barcode
         set rating_label = :new.label
       where serial_no    = :new.barcode ;

 end if;
 */

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_EOL',
      '[TRG_LOG_EOL_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
