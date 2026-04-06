CREATE OR REPLACE PROCEDURE P_AUTO_INSERT_QC (
  /* ================================================================
   * 프로시저명 : P_AUTO_INSERT_QC
   * 작성자  : 지성솔루션컨설팅
   * 작성일  : 2026-04-03
   * 수정이력:
   *   2026-04-03 - 지성솔루션컨설팅 - 최초 작성
   *   2026-04-03 - AI(Claude)       - 한글 주석 자동 추가
   *   2026-04-03 - AI(Claude)       - 첫 번째 등록 시 가성확정+출고 자동처리 로직 추가
   *   2026-04-03 - AI(Claude)       - BARCODE+FILE_NAME 중복 SKIP 로직 추가
   * ================================================================
   * [AI 분석] 기능 설명:
   *   검사 장비(AOI 등)에서 불량 판정된 제품의 QC(품질관리) 데이터를
   *   IP_PRODUCT_WORK_QC 테이블에 자동으로 등록하는 프로시저.
   *   같은 BARCODE+FILE_NAME 조합이 이미 등록되어 있으면 SKIP한다.
   *   (LOG_EOL 등에서 한 파일에 1400건씩 들어와도 1건만 등록)
   * ================================================================ */
  p_barcode        IN VARCHAR2,
  p_log_id         IN VARCHAR2,
  p_equipment_id   IN VARCHAR2,
  p_workstage_code IN VARCHAR2,
  p_file_name      IN VARCHAR2 DEFAULT NULL
)
IS
  v_line_code   VARCHAR2(10);
  v_model_name  VARCHAR2(50);
  v_item_code   VARCHAR2(20);
  v_shift_code  VARCHAR2(2);
  v_exists      NUMBER := 0;
  v_dup_file    NUMBER := 0;   -- [AI] BARCODE+FILE_NAME 중복 체크용
BEGIN
  -- [AI Step 0] BARCODE + FILE_NAME 중복 체크 → 이미 등록되어 있으면 SKIP
  IF p_file_name IS NOT NULL THEN
    BEGIN
      SELECT 1 INTO v_dup_file
      FROM IP_PRODUCT_WORK_QC
      WHERE SERIAL_NO = p_barcode
        AND FILE_NAME = p_file_name
        AND ROWNUM = 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_dup_file := 0;
    END;

    IF v_dup_file = 1 THEN
      RETURN;  -- 이미 등록된 조합이므로 SKIP
    END IF;
  END IF;

  -- [AI Step 1] 주야간 시프트 판별 (08:00~20:00 = 주간, 그 외 = 야간)
  IF TO_NUMBER(TO_CHAR(SYSDATE, 'HH24')) >= 8
     AND TO_NUMBER(TO_CHAR(SYSDATE, 'HH24')) < 20 THEN
    v_shift_code := '1';
  ELSE
    v_shift_code := '2';
  END IF;

  -- [AI Step 2] 바코드로 제품 정보 조회 (라인/모델/품목)
  BEGIN
    SELECT LINE_CODE, MODEL_NAME, ITEM_CODE
    INTO v_line_code, v_model_name, v_item_code
    FROM IP_PRODUCT_2D_BARCODE
    WHERE SERIAL_NO = p_barcode
      AND ROWNUM = 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      v_line_code  := NULL;
      v_model_name := '*';
      v_item_code  := NULL;
  END;

  -- [AI Step 3] 같은 라인+공정+바코드로 기존 QC 이력 존재 여부 확인
  BEGIN
    SELECT 1 INTO v_exists
    FROM IP_PRODUCT_WORK_QC
    WHERE SERIAL_NO = p_barcode
      AND LINE_CODE = v_line_code
      AND WORKSTAGE_CODE = p_workstage_code
      AND ROWNUM = 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      v_exists := 0;
  END;

  -- [AI Step 4] QC 이력 데이터 등록
  IF v_exists = 0 THEN
    -- 첫 번째 등록: 가성 확정 + 반품(출고) + 재사용 + 수리완료 (즉시 완결 처리)
    INSERT INTO IP_PRODUCT_WORK_QC (
      SERIAL_NO, ITEM_CODE, LOG_ID, QC_DATE, QC_SEQUENCE,
      QC_RESULT, RECEIPT_DEFICIT, QC_INSPECT_HANDLING,
      BAD_REASON_CODE, REPAIR_DIVISION, REPAIR_RESULT_CODE, REPAIR_DATE,
      WORKSTAGE_CODE, LINE_CODE, MACHINE_CODE, MODEL_NAME, SHIFT_CODE,
      ORGANIZATION_ID, DEFECT_QTY, BAD_QTY,
      FILE_NAME,
      ENTER_BY, ENTER_DATE, LAST_MODIFY_BY, LAST_MODIFY_DATE
    ) VALUES (
      p_barcode,
      v_item_code,
      p_log_id,
      SYSDATE,
      SEQ_QC_REPAIR_SEQUENCE.NEXTVAL,
      'O',           -- QC_RESULT: 가성
      '2',           -- RECEIPT_DEFICIT: 2반품(출고)
      'U',           -- QC_INSPECT_HANDLING: 재사용
      'B',           -- BAD_REASON_CODE: 기능불량
      'P',           -- REPAIR_DIVISION: PBA
      'G',           -- REPAIR_RESULT_CODE: 수리완료
      SYSDATE,       -- REPAIR_DATE: 수리완료 시각
      p_workstage_code,
      v_line_code,
      p_equipment_id,
      v_model_name,
      v_shift_code,
      1,             -- ORGANIZATION_ID
      1,             -- DEFECT_QTY
      1,             -- BAD_QTY
      p_file_name,
      'AUTO_QC',     -- ENTER_BY
      SYSDATE,       -- ENTER_DATE
      'AUTO_QC',     -- LAST_MODIFY_BY
      SYSDATE        -- LAST_MODIFY_DATE
    );
  ELSE
    -- 두 번째 이후: 가성 + 입고 + 대기 상태 (수동 처리 대기)
    INSERT INTO IP_PRODUCT_WORK_QC (
      SERIAL_NO, ITEM_CODE, LOG_ID, QC_DATE, QC_SEQUENCE,
      QC_RESULT, RECEIPT_DEFICIT, QC_INSPECT_HANDLING,
      BAD_REASON_CODE, REPAIR_DIVISION, REPAIR_RESULT_CODE,
      WORKSTAGE_CODE, LINE_CODE, MACHINE_CODE, MODEL_NAME, SHIFT_CODE,
      ORGANIZATION_ID, DEFECT_QTY, BAD_QTY,
      FILE_NAME,
      ENTER_BY, ENTER_DATE, LAST_MODIFY_BY, LAST_MODIFY_DATE
    ) VALUES (
      p_barcode,
      v_item_code,
      p_log_id,
      SYSDATE,
      SEQ_QC_REPAIR_SEQUENCE.NEXTVAL,
      'O',           -- QC_RESULT: 가성
      '1',           -- RECEIPT_DEFICIT: 1입고
      'W',           -- QC_INSPECT_HANDLING: 대기
      'B',           -- BAD_REASON_CODE: 기능불량
      'P',           -- REPAIR_DIVISION: PBA
      'W',           -- REPAIR_RESULT_CODE: 대기
      p_workstage_code,
      v_line_code,
      p_equipment_id,
      v_model_name,
      v_shift_code,
      1,             -- ORGANIZATION_ID
      1,             -- DEFECT_QTY
      1,             -- BAD_QTY
      p_file_name,
      'AUTO_QC',     -- ENTER_BY
      SYSDATE,       -- ENTER_DATE
      'AUTO_QC',     -- LAST_MODIFY_BY
      SYSDATE        -- LAST_MODIFY_DATE
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    NULL;
END P_AUTO_INSERT_QC;
