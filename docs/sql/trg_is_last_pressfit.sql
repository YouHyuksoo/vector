CREATE OR REPLACE TRIGGER TRG_LOG_PRESSFIT_IS_LAST
BEFORE INSERT ON LOG_PRESSFIT
FOR EACH ROW
DECLARE

  lvl_count            number;
  lvd_inspect_date     date;

BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (SYSDATE 기준)
-- PRESSFIT CSV 에는 날짜/시각 컬럼이 없다 (파일명 20260713.csv 가 유일한 날짜 근거).
-- LOG_ICT 와 동일하게 INSERT 시점의 SYSDATE 로 처리한다.
--
-- ※ 지난 파일을 수동 재적재하면 ACTUAL_DATE 가 적재일 기준이 되어 실제 작업일과
--   어긋난다. 실시간 수집이 정상 경로라는 전제.
-------------------------------------------------------------------------------
  lvd_inspect_date := SYSDATE;
  :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
  :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
  :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);

  --------------------------------------
  -- IS_LAST 고정
  --  • 자기 테이블 UPDATE 는 ORA-04091 mutating 유발 → bulk INSERT 막힘
  --  • backend(log-ingest.service.ts BARCODE_REPLACE_TABLES)가 동일 BARCODE
  --    이전 행을 DELETE 후 INSERT 하므로 INSERT 되는 행이 항상 최신이다
  --------------------------------------

  :NEW.IS_LAST := 'Y';

  --------------------------------------
  -- 불량 QC 자동 등록
  --  공정코드 W180 = ISCM PRESSFIT (IP_PRODUCT_WORKSTAGE 확인)
  --  판정은 TOTAL_RESULT 기준 — PRESS_RESULT/HEIGHT_RESULT 중 하나라도 NG 면
  --  설비가 TOTAL_RESULT 를 NG 로 내린다.
  --------------------------------------

  IF :NEW.TOTAL_RESULT IS NOT NULL
     AND UPPER(:NEW.TOTAL_RESULT) NOT IN ('PASS','OK','GOOD','Y','SKIP') THEN
    P_AUTO_INSERT_QC(:NEW.BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W180', :NEW.FILE_NAME);
  END IF;

  --------------------------------------
  -- SAMPLE 확인
  --------------------------------------

  select count(*)
    into lvl_count
    from imcn_sample
   where sample_barcode = :NEW.BARCODE
     and sample_type = 'C'
     and rownum = 1 ;

  if ( lvl_count > 0 ) then
       :NEW.IS_SAMPLE := 'Y';
  end if ;

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_PRESSFIT',
      '[TRG_LOG_PRESSFIT_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
