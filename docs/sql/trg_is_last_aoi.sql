CREATE OR REPLACE TRIGGER TRG_LOG_AOI_IS_LAST
BEFORE INSERT ON LOG_AOI
FOR EACH ROW
DECLARE

  lvl_count            number;
  lvs_sample_section   varchar2(1);
  lvd_inspect_date     date;

BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (START_DATE 기준)
-- AOI는 START_DATE가 VARCHAR2(100)이라 DATE형으로 변환 후 함수 호출
-------------------------------------------------------------------------------
  if :NEW.START_DATE is not null then
     lvd_inspect_date := to_date(:NEW.START_DATE, 'YYYY/MM/DD HH24:MI:SS');
     :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
     :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
     :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);
  end if;

-------------------------------------------------------------------------------
-- 듀얼 라인 라인 코드 분리 처리 Lane : Front Rear 로 구분
-------------------------------------------------------------------------------

  IF :new.line_code >= '11' then  -- 11 이상은 파나소닉 라인으로 판단

     if :new.lane = 'Front' then

         -- 그대로 라인코드 사용
         null ;
     else
          :new.line_code := trim( to_char( to_number(:new.line_code ) +1 , '00') ) ;
     end if ;

  END IF ;



 -------------------------------------------------------------------------------
  UPDATE LOG_AOI
     SET IS_LAST = 'N'
   WHERE SERIAL_NO = :NEW.SERIAL_NO
     AND IS_LAST = 'Y';

  :NEW.IS_LAST := 'Y';

  ------------------------------------
  -- SAMPLE 확인
  ------------------------------------

  select count(*), max(sample_section)
    into lvl_count, lvs_sample_section
    from imcn_sample
   where sample_barcode = :NEW.SERIAL_NO
     and sample_type = 'S'
     and rownum = 1 ;

  if ( lvl_count > 0 ) then

       :NEW.IS_SAMPLE := 'Y';

       P_INSERT_SAMPLE_INPUT_RAW (
                                       to_date( :NEW.START_DATE, 'YYYY/MM/DD HH24:MI:SS') ,   -- AOI 는 문자형이라 DATE 형으로 변경
                                       :NEW.LINE_CODE,
                                       'W070',              -- AOI
                                       :NEW.SERIAL_NO,
                                       :NEW.RESULT,
                                       :NEW.EQUIPMENT_ID
                                );

       if ( lvs_sample_section = 'G' ) then

            update ip_product_line
               set sample_lot_no = :NEW.SERIAL_NO,
                   sample_check_date = sysdate
             where line_code = :new.line_code ;

       else

             update ip_product_line
                set sample_lot_no2 = :NEW.SERIAL_NO,
                    sample_check_date2 = sysdate
              where line_code = :new.line_code ;

       end if;

  else

      IF :NEW.RESULT IS NOT NULL  AND UPPER(:NEW.RESULT) NOT IN ('PASS','OK','GOOD','Y', 'OVERKILL') THEN
          P_AUTO_INSERT_QC(:NEW.SERIAL_NO, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W070', :new.file_name);
      END IF;


  end if ;

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_AOI',
      '[TRG_LOG_AOI_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
