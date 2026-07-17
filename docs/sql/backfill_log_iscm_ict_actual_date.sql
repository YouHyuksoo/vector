-- =============================================================================
--  LOG_ISCM_ICT / _HDATA 기존 행 ACTUAL_DATE 백필 (1회성)
-- =============================================================================
--  _COMP 는 대상 아님 — 작업일자 컬럼을 두지 않는다
--  (drop_log_iscm_ict_comp_work_columns.sql 참고).
--  트리거(TRG_LOG_ISCM_ICT*_IS_LAST) 배포 이전에 적재된 행은 ACTUAL_DATE 가 NULL 이다.
--  트리거는 INSERT 시점에만 동작하므로 기존 행에는 소급되지 않는다.
--
--  기준 시각: LOG_ISCM_ICT_HDATA.TEST_DATE + TEST_TIME (설비 실측 검사시각)
--    형식은 'YYYYMMDD' + 'HHMISS' (운영 데이터로 확인: 20260711 / 124532)
--    헤더/COMP 에는 날짜 필드가 없어 BARCODE 로 HDATA 를 조인해 가져온다.
--
--  ※ 신규 행은 헤더/COMP 가 SYSDATE 기준이라 백필 값(실측 기준)과 산출 근거가 다르다.
--    정상 운영에서는 로그가 실시간으로 들어와 두 값이 사실상 같지만,
--    이 백필 대상은 며칠 지나 적재된 건이라 SYSDATE 로 채우면 틀린 날짜가 된다.
--    → 백필은 실측 기준이 맞다.
--
--  멱등: ACTUAL_DATE IS NULL 인 행만 갱신. 재실행 안전.
-- =============================================================================

-- 1) HDATA — 자기 행의 TEST_DATE/TEST_TIME 사용
UPDATE LOG_ISCM_ICT_HDATA h
   SET (h.ACTUAL_DATE, h.SHIFT_CODE, h.ZONE_CODE) =
       (SELECT f_get_work_actual_date(d, 'A'),
               f_get_work_shift_code(d),
               f_get_worktime_zone_hour(d)
          FROM (SELECT TO_DATE(TRIM(h.TEST_DATE) || NVL(TRIM(h.TEST_TIME), '000000'),
                               'YYYYMMDDHH24MISS') AS d
                  FROM dual))
 WHERE h.ACTUAL_DATE IS NULL
   AND h.TEST_DATE IS NOT NULL;
/

-- 2) 헤더 — BARCODE 로 HDATA 조인
UPDATE LOG_ISCM_ICT t
   SET (t.ACTUAL_DATE, t.SHIFT_CODE, t.ZONE_CODE) =
       (SELECT h.ACTUAL_DATE, h.SHIFT_CODE, h.ZONE_CODE
          FROM LOG_ISCM_ICT_HDATA h
         WHERE h.BARCODE = t.BARCODE
           AND ROWNUM = 1)
 WHERE t.ACTUAL_DATE IS NULL
   AND EXISTS (SELECT 1 FROM LOG_ISCM_ICT_HDATA h
                WHERE h.BARCODE = t.BARCODE AND h.ACTUAL_DATE IS NOT NULL);
/

