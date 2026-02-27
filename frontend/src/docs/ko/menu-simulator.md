# VRL 시뮬레이터

## 개요

VRL(Vector Remap Language) 파싱 코드를 개발하고 테스트하는 통합 환경입니다.
실제 로그 샘플로 VRL 코드의 파싱 결과를 미리 확인하고, 검증된 코드를 Aggregator에 바로 적용할 수 있습니다.

## 전제조건

- Fastify 서버가 실행 중이어야 합니다
- Vector 엔진(`vector.exe`)이 서버에 설치되어 있어야 합니다 (시뮬레이션 실행에 사용)
- AI 코드 생성을 사용하려면 **설정 > AI 모델** 에서 최소 1개 AI 모델이 활성화되어 있어야 합니다

## 사용 방법

### 1단계: 설비 유형 선택

화면 상단에서 파싱할 설비 유형을 선택합니다.

- SP, SPI, MAOI, AOI, REFLOW, ICT, FCT, BURNIN, HIPOT, EOL, METALMASK, MOUNTER, VISCOSITY
- 기존에 VRL 코드가 저장된 설비를 선택하면 자동으로 코드가 로드됩니다

### 2단계: 샘플 로그 준비

좌측 영역에 파싱할 샘플 로그를 준비합니다.

**직접 입력**:
- 텍스트 영역에 실제 로그 데이터를 붙여넣습니다

**파일 업로드**:
- **파일 불러오기** 버튼으로 로그 파일을 로드합니다
- 지원 형식: `.txt`, `.csv`, `.log`, `.tsv`

### 3단계: VRL 코드 작성

우측 영역에 VRL 파싱 코드를 작성합니다.

**수동 작성 예시**:
```
lines = split!(.message, ",")
.data.INSPECTOR = get!(lines, [0])
.data.MODEL = get!(lines, [1])
.data.RESULT = get!(lines, [2])
```

**AI 자동 생성**:
1. AI 섹션에서 사용할 모델을 선택합니다 (Gemini, Mistral, Claude)
2. 파싱 규칙을 자연어로 설명합니다
   - 예: "쉼표로 구분, 1번째 필드는 INSPECTOR, 2번째는 MODEL, 3번째는 RESULT"
3. **AI 생성** 버튼을 클릭하면 VRL 코드가 자동 생성됩니다
4. 생성된 코드를 필요에 따라 수정할 수 있습니다

### 4단계: 시뮬레이션 실행

**시뮬레이션** 버튼을 클릭합니다.

- **성공**: 파싱된 필드와 값이 결과 영역에 표시됩니다
- **실패**: VRL 문법 오류나 런타임 오류 메시지가 표시됩니다
- 결과를 확인하고 코드를 수정하여 반복 테스트할 수 있습니다

### 5단계: TOML에 적용

파싱이 정상 동작하면 **TOML에 반영** 버튼을 클릭합니다.

1. VRL 코드가 aggregator.toml의 해당 설비 transform 블록에 삽입됩니다
2. 파싱 필드가 자동으로 DB에 동기화됩니다 (타겟 매핑의 드롭다운에 반영)
3. Vector 재시작 모달이 표시됩니다

> TOML 적용 전에 반드시 시뮬레이션으로 검증하세요.

## VRL 코드 작성 팁

### CSV 형식 파싱
```
lines = split!(.message, ",")
.data.FIELD1 = get!(lines, [0])
.data.FIELD2 = get!(lines, [1])
```

### 키-값 형식 파싱
```
pairs = split!(.message, ";")
for_each(pairs) -> |_i, pair| {
  kv = split!(pair, "=")
  key = strip_whitespace!(get!(kv, [0]))
  .data = set!(.data, [key], get!(kv, [1]))
}
```

### 고정 길이 파싱
```
.data.CODE = slice!(.message, 0, 10)
.data.VALUE = slice!(.message, 10, 20)
```
