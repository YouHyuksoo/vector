CREATE OR REPLACE TRIGGER TRG_LOG_ICT_IS_LAST
BEFORE INSERT ON LOG_ICT
FOR EACH ROW
DECLARE

  lvl_count            number;
  lvd_inspect_date     date;

BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (SYSDATE 기준)
-- LOG_ICT 는 설비 로그에 문자형 날짜 컬럼이 없어 INSERT 시점의 SYSDATE 로 처리
-------------------------------------------------------------------------------
  lvd_inspect_date := SYSDATE;
  :NEW.ACTUAL_DATE := f_get_work_actual_date(lvd_inspect_date, 'A');
  :NEW.SHIFT_CODE  := f_get_work_shift_code(lvd_inspect_date);
  :NEW.ZONE_CODE   := f_get_worktime_zone_hour(lvd_inspect_date);

  --------------------------------------
  -- IS_LAST 고정 (이전 행 UPDATE 제거 — backend가 DELETE 후 INSERT 패턴 사용)
  --  • 자기 테이블 UPDATE 는 ORA-04091 mutating 유발 → bulk INSERT 막힘
  --  • backend(log-ingest.service.ts)가 동일 BARCODE 이전 행을 DELETE 후 INSERT 함
  --  • LOG_ICT 한 BARCODE = N test rows, 이력 보존 불필요 (도메인 확인됨)
  --------------------------------------

  :NEW.IS_LAST := 'Y';

  --------------------------------------
  -- 불량 QC 자동 등록 (변경 없음)
  --------------------------------------

  IF :NEW.RESULT IS NOT NULL  AND UPPER(:NEW.RESULT) NOT IN ('PASS','OK','GOOD','Y' , 'SKIP') THEN
    P_AUTO_INSERT_QC(:NEW.BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W110', :new.file_name);
  END IF;

  --------------------------------------
  -- SAMPLE 확인 (변경 없음)
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
    P_TRIGGER_ERROR_LOG('LOG_ICT',
      '[TRG_LOG_ICT_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
