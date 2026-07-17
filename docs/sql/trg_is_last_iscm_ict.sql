CREATE OR REPLACE TRIGGER TRG_LOG_ISCM_ICT_IS_LAST
BEFORE INSERT ON LOG_ISCM_ICT
FOR EACH ROW
DECLARE

  lvd_inspect_date     date;

BEGIN

-------------------------------------------------------------------------------
-- 작업일자 / 근무조 / 타임존 자동 설정 (SYSDATE 기준)
-- 헤더블록에는 신뢰할 수 있는 문자형 날짜 컬럼이 없어 INSERT 시점의 SYSDATE 로 처리
-- (LOG_ICT 와 동일 규약)
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

EXCEPTION
  WHEN OTHERS THEN
    P_TRIGGER_ERROR_LOG('LOG_ISCM_ICT',
      '[TRG_LOG_ISCM_ICT_IS_LAST] ' || SQLCODE || ': ' || SUBSTR(SQLERRM, 1, 500)
      || CHR(10) || SUBSTR(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE, 1, 2000));
    RAISE;
END;
/
