-- =============================================================================
--  TRG_LOG_PRESSFIT_IS_LAST — LOG_PRESSFIT BEFORE INSERT 트리거
-- =============================================================================
--  2026-07-30: 운영 DB 소스를 기준으로 동기화했다.
--
--  ※ IS_LAST 유지용 자기 테이블 UPDATE 는 이 트리거의 정상 로직이다.
--    대신 backend 가 이 테이블에 **행별 INSERT** 를 해야 한다.
--    row trigger 가 자기 테이블에 DML 을 하면 다중행 INSERT(executeMany 배열 바인딩)에서
--    ORA-04091 (mutating table) 이 발생하고, backend 는 batchErrors 로 그 배치를
--    통째로 잃는다. 2026-07-18 ~ 07-29 손실이 이 조합 때문이었다
--    (LOG_ERROR STAGE='TRIGGER' 22건, 07-29 20260726.csv 전체 재전송 → 적재 0행).
--
--    → 해결: log-ingest.service.ts 의 BARCODE_REPLACE_TABLES 에서 LOG_PRESSFIT 을
--      제거해 다른 LOG_* 테이블과 동일한 행별 INSERT 규약으로 되돌렸다.
--      단행 INSERT ... VALUES 는 mutating table 제약 예외라 아래 UPDATE 가 정상 동작한다.
--      LOG_PRESSFIT 을 다시 BARCODE_REPLACE_TABLES 에 넣으면 손실이 재발한다.
-- =============================================================================

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
  -- IS_LAST 관리
  --  동일 BARCODE 이전 행을 'N' 으로 내리고 새 행만 'Y' 로 둔다 (이력 보존).
  --  ※ 자기 테이블 UPDATE 이므로 backend 는 반드시 행별 INSERT 를 써야 한다.
  --    executeMany 다중행 INSERT 면 ORA-04091 로 배치가 통째로 사라진다.
  --------------------------------------

  UPDATE LOG_PRESSFIT
     SET IS_LAST = 'N'
   WHERE BARCODE = :NEW.BARCODE
     AND IS_LAST = 'Y';

  :NEW.IS_LAST := 'Y';

  --------------------------------------
  -- SAMPLE 확인 + 불량 QC 자동 등록
  --  샘플이면 QC 등록하지 않는다.
  --  공정코드 W180 = ISCM PRESSFIT (IP_PRODUCT_WORKSTAGE 확인)
  --  판정은 TOTAL_RESULT 기준 — PRESS_RESULT/HEIGHT_RESULT 중 하나라도 NG 면
  --  설비가 TOTAL_RESULT 를 NG 로 내린다.
  --------------------------------------

  select count(*)
    into lvl_count
    from imcn_sample
   where sample_barcode = :NEW.BARCODE
   --  and sample_type = 'C'
     and rownum = 1 ;

  if ( lvl_count > 0 ) then

       :NEW.IS_SAMPLE := 'Y';

  else

        IF :NEW.TOTAL_RESULT IS NOT NULL
           AND UPPER(:NEW.TOTAL_RESULT) NOT IN ('PASS','OK','GOOD','Y','SKIP') THEN
          P_AUTO_INSERT_QC(:NEW.BARCODE, :NEW.LOG_ID, :NEW.EQUIPMENT_ID, 'W180', :NEW.FILE_NAME);
        END IF;

  end if;

  --------------------------------------
  -- ※ 확인 필요 (2026-07-30):
  --   운영 소스에는 위 if 블록 뒤에 `:NEW.IS_SAMPLE := 'N';` 가 무조건 실행되어
  --   IS_SAMPLE 이 항상 'N' 이 되는 문장이 있었다. 의도된 것인지 확인이 필요해
  --   이번 수정에서는 건드리지 않고 그대로 남긴다 (행 손실과 무관).
  --------------------------------------

  :NEW.IS_SAMPLE := 'N';

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_PRESSFIT',
      '[TRG_LOG_PRESSFIT_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
