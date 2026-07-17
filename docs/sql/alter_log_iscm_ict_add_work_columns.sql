-- =============================================================================
--  LOG_ISCM_ICT / _HDATA 에 작업일자 컬럼 추가
-- =============================================================================
--  _COMP 는 제외한다. BARCODE 로만 조회하므로 작업일자 컬럼을 두지 않는다
--  (drop_log_iscm_ict_comp_work_columns.sql 참고).
--  ACTUAL_DATE / SHIFT_CODE / ZONE_CODE 는 oracle-ddl.ts 의 자동 테이블 생성기가
--  만들지 않는다 (SYSTEM_COLUMNS / SYSTEM_TAIL_COLUMNS 에 없음).
--  트리거 전용 컬럼이므로 트리거 배포 전에 이 스크립트로 먼저 추가한다.
--
--  컬럼 타입은 LOG_ICT 의 실제 정의를 복사한다 — 다른 LOG_* 테이블과 타입이
--  어긋나면 f_get_work_* 반환값 대입에서 조용히 잘릴 수 있어 추측하지 않는다.
--
--  멱등(idempotent): 이미 있는 컬럼은 건너뛴다. 재실행 안전.
-- =============================================================================

DECLARE
  TYPE t_names IS TABLE OF VARCHAR2(128);

  v_tabs t_names := t_names('LOG_ISCM_ICT', 'LOG_ISCM_ICT_HDATA');
  v_cols t_names := t_names('ACTUAL_DATE', 'SHIFT_CODE', 'ZONE_CODE');

  v_type   VARCHAR2(200);
  v_exists NUMBER;
BEGIN
  FOR i IN 1 .. v_tabs.COUNT LOOP

    -- 대상 테이블 자체가 없으면 조용히 건너뜀 (아직 생성 전인 환경 대비)
    SELECT COUNT(*) INTO v_exists
      FROM user_tables
     WHERE table_name = v_tabs(i);

    IF v_exists = 0 THEN
      DBMS_OUTPUT.PUT_LINE('SKIP (no table): ' || v_tabs(i));
      CONTINUE;
    END IF;

    FOR j IN 1 .. v_cols.COUNT LOOP

      SELECT COUNT(*) INTO v_exists
        FROM user_tab_columns
       WHERE table_name = v_tabs(i)
         AND column_name = v_cols(j);

      IF v_exists > 0 THEN
        DBMS_OUTPUT.PUT_LINE('SKIP (exists): ' || v_tabs(i) || '.' || v_cols(j));
        CONTINUE;
      END IF;

      -- LOG_ICT 의 동일 컬럼 정의를 그대로 가져온다
      SELECT CASE data_type
               WHEN 'VARCHAR2' THEN 'VARCHAR2(' || data_length || ')'
               WHEN 'CHAR'     THEN 'CHAR(' || data_length || ')'
               WHEN 'NUMBER'   THEN
                 CASE WHEN data_precision IS NULL THEN 'NUMBER'
                      ELSE 'NUMBER(' || data_precision || ',' || NVL(data_scale, 0) || ')'
                 END
               ELSE data_type
             END
        INTO v_type
        FROM user_tab_columns
       WHERE table_name = 'LOG_ICT'
         AND column_name = v_cols(j);

      EXECUTE IMMEDIATE 'ALTER TABLE ' || v_tabs(i) || ' ADD (' || v_cols(j) || ' ' || v_type || ')';
      DBMS_OUTPUT.PUT_LINE('ADDED: ' || v_tabs(i) || '.' || v_cols(j) || ' ' || v_type);

    END LOOP;
  END LOOP;
END;
/

-- 주석 (컬럼이 실제로 붙은 뒤에만 의미가 있으므로 별도 블록)
DECLARE
  TYPE t_names IS TABLE OF VARCHAR2(128);
  v_tabs t_names := t_names('LOG_ISCM_ICT', 'LOG_ISCM_ICT_HDATA');
  v_cnt  NUMBER;
BEGIN
  FOR i IN 1 .. v_tabs.COUNT LOOP
    SELECT COUNT(*) INTO v_cnt FROM user_tab_columns
     WHERE table_name = v_tabs(i) AND column_name = 'ACTUAL_DATE';
    IF v_cnt > 0 THEN
      EXECUTE IMMEDIATE 'COMMENT ON COLUMN ' || v_tabs(i) || '.ACTUAL_DATE IS ''작업일자 (트리거 자동 설정)''';
      EXECUTE IMMEDIATE 'COMMENT ON COLUMN ' || v_tabs(i) || '.SHIFT_CODE  IS ''근무조 (트리거 자동 설정)''';
      EXECUTE IMMEDIATE 'COMMENT ON COLUMN ' || v_tabs(i) || '.ZONE_CODE   IS ''타임존 (트리거 자동 설정)''';
    END IF;
  END LOOP;
END;
/
