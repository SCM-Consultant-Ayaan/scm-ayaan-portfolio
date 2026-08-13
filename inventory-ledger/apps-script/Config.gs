/**
 * 다법인·다창고 재고수불부 — 설정 상수
 *
 * 이 파일 하나만 보면 전체 시트 구조를 알 수 있게, 탭 이름과 열 이름을 전부 여기 모아둔다.
 * 연동 대상 시트(발주내역_관리시트 / SKU 매핑 시트)의 열 이름은 "연동설정" 탭 값으로
 * 관리하고, 여기 상수는 그 기본값(seed)일 뿐이다 — 실제 운영 중 열 이름이 바뀌면
 * 코드가 아니라 연동설정 탭만 고치면 된다.
 */

var TABS = {
  ENTITY: '법인마스터',
  WAREHOUSE: '창고마스터',
  FX: '환율마스터',
  LINK_CONFIG: '연동설정',
  SEED_STOCK: '기초재고_시작값',
  IN_MANUAL: '거래_입고',
  OUT: '거래_출고',
  DISPOSAL: '거래_폐기',
  DONATION: '거래_기부',
  INTERCO: '거래_사간거래',
  TRANSFER: '거래_창고이동',
  ADJUST: '거래_재고조정',
  ENDING_ACTUAL: '기말재고_실측',
  UPLOAD_BATCH: '업로드이력',
  UPLOAD_MAP: '업로드매핑',
};

var HEADERS = {};
HEADERS[TABS.ENTITY] = ['법인코드', '법인명', '국내외구분', '통화코드', '사용여부', '정렬순서', 'updatedAt', 'updatedBy'];
HEADERS[TABS.WAREHOUSE] = ['창고코드', '창고명', '국내외구분', '사용여부', '정렬순서', 'updatedAt', 'updatedBy'];
HEADERS[TABS.FX] = ['통화코드', 'KRW환율', '기준일자', 'updatedAt'];
HEADERS[TABS.LINK_CONFIG] = ['항목', '값', '설명'];
HEADERS[TABS.SEED_STOCK] = ['id', '법인코드', '창고코드', '상품코드', '시작연월', '기초수량', '기초단가', '메모', 'updatedAt', 'updatedBy'];
HEADERS[TABS.IN_MANUAL] = ['id', '적용일자', '입력일자', '법인코드', '창고코드', '상품코드', '세부구분', '수량', '메모', 'updatedAt', 'updatedBy', '배치ID'];
HEADERS[TABS.OUT] = ['id', '적용일자', '입력일자', '법인코드', '창고코드', '상품코드', '세부구분', '수량', '출처', '메모', 'updatedAt', 'updatedBy', '배치ID'];
HEADERS[TABS.DISPOSAL] = ['id', '적용일자', '입력일자', '법인코드', '창고코드', '상품코드', '수량', '사유', 'updatedAt', 'updatedBy', '배치ID'];
HEADERS[TABS.DONATION] = ['id', '적용일자', '입력일자', '법인코드', '창고코드', '상품코드', '수량', '수혜처', 'updatedAt', 'updatedBy', '배치ID'];
HEADERS[TABS.INTERCO] = ['id', '적용일자', '입력일자', 'from법인코드', 'to법인코드', '창고코드', '상품코드', '수량', '메모', 'updatedAt', 'updatedBy', '배치ID'];
HEADERS[TABS.TRANSFER] = ['id', '적용일자', '입력일자', '법인코드', 'from창고코드', 'to창고코드', '상품코드', '수량', '메모', 'updatedAt', 'updatedBy', '배치ID'];
HEADERS[TABS.ADJUST] = ['id', '적용일자', '입력일자', '법인코드', '창고코드', '상품코드', '구분', '증감수량', '사유', 'updatedAt', 'updatedBy', '배치ID'];
HEADERS[TABS.ENDING_ACTUAL] = ['id', '연월', '입력일자', '법인코드', '창고코드', '상품코드', '실측수량', '출처', 'updatedAt', 'updatedBy', '배치ID'];
HEADERS[TABS.UPLOAD_BATCH] = ['배치ID', '거래유형', '파일명', '행수', '업로드일시', '업로드자', '상태', '삭제일시', '삭제자'];
/**
 * 거래처마다 자기 방식대로 내보내는 원본 파일(3PL 재고 리포트 등)을 매번 우리 표준
 * 양식으로 바꿔 달라고 할 수 없으니, "이 열이 상품코드, 이 열이 수량"처럼 한 번 지정해
 * 두면 다음부터는 같은 형식 파일을 그대로 올릴 수 있게 하는 매핑 저장소.
 * 매핑JSON 예: {"적용일자":"A","법인코드":"B","상품코드":"D",...} (필드키 -> 열문자)
 */
HEADERS[TABS.UPLOAD_MAP] = ['id', '거래유형', '매핑이름', '헤더행', '매핑JSON', 'updatedAt', 'updatedBy'];

/**
 * 이 헤더들은 값이 전부 숫자로만 보여도(예: "0001", "00119") 반드시 텍스트로 저장한다.
 * Google Sheets는 셀 서식이 "자동"이면 숫자처럼 보이는 문자열을 자동으로 숫자로 바꿔버려서
 * (예: "0001" -> 1) 앞자리 0이 사라지고, 그 결과 코드 비교(===)가 깨져 중복행이 생기거나
 * SKU 매핑이 안 맞는 문제가 생긴다. appendRowByHeaders_/updateRowById_ 가 이 목록에 있는
 * 열은 쓰기 전에 셀 서식을 "일반 텍스트"로 고정한다.
 */
var FORCE_TEXT_HEADERS = [
  'id', '배치ID', '창고코드', '법인코드', '상품코드', '통화코드',
  'from법인코드', 'to법인코드', 'from창고코드', 'to창고코드',
];

var ENUM = {
  IN_REASON: ['무상입고', '반품입고'],
  OUT_REASON: ['판매출고', '기타출고'],
  ADJUST_REASON: ['재고실사', '재고전환', '전산재고조정'],
  DOMESTIC: '국내',
  OVERSEAS: '해외',
  SOURCE_ACTUAL: '실측',
  SOURCE_RESIDUAL: '잔차추정',
};

// 연동설정 탭에 처음 세팅될 기본 key-value. 실제 값은 setupAll() 실행 후 이 탭에서 직접 수정한다.
var LINK_CONFIG_DEFAULTS = [
  ['PO_SSID', '', '발주내역_관리시트의 스프레드시트 ID (URL의 /d/ 뒤 문자열)'],
  ['PO_TAB', '입고내역', '입고 내역이 있는 탭 이름 (발주내역 탭이 아니라 입고내역 탭!)'],
  ['PO_COL_입고일', '입고일', '입고내역 탭에서 입고일자 헤더 이름'],
  ['PO_COL_상품코드', '품목코드', '입고내역 탭에서 SKU 코드 헤더 이름'],
  ['PO_COL_정상입고수량', '정상입고수량', '실제 반영할 입고 수량 헤더 이름'],
  ['PO_COL_발주단가', '발주단가', '입고 단가 헤더 이름'],
  ['PO_COL_입고금액', '입고금액', '입고 금액 헤더 이름 (단가×수량 검증용, 없으면 비워둠)'],
  ['PO_COL_입고창고', '입고창고', '입고된 창고명 헤더 이름 — 창고마스터 창고명과 매칭'],
  ['PO_COL_검수결과', '검수결과', '검수결과 헤더 이름'],
  ['PO_COL_마감여부', '마감여부', '마감 확정 여부 헤더 이름 — 이 값이 "마감"인 행만 반영'],
  ['PO_통화_열', '', '발주 통화 헤더 이름 (있으면). KRW 아닌 값은 별도 표시하고 이동평균 계산에서 제외'],
  ['SKU_SSID', '', 'SKU 매핑 시트의 스프레드시트 ID'],
  ['SKU_TAB', 'SKU Master', 'SKU 매핑이 있는 탭 이름'],
  ['SKU_COL_상품코드', '상품코드', 'SKU 코드 헤더 이름'],
  ['SKU_COL_상품명', '국문명', 'SKU 이름으로 쓸 헤더 이름'],
  ['SKU_COL_소유법인', '법인명', '소유법인 헤더 이름 — 값은 법인마스터의 법인코드/법인명과 매칭'],
  ['SKU_COL_구분', '', '상제품/부자재 구분 헤더 이름 (없으면 비워둠 → 전부 상제품으로 취급)'],
];

function getScriptProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
function setScriptProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/** 이 저장소 스프레드시트 자체의 ID. 바인딩된 스크립트라면 활성 스프레드시트를, 아니면 스크립트 속성 LEDGER_SSID를 쓴다. */
function getLedgerSpreadsheet_() {
  var bound = SpreadsheetApp.getActiveSpreadsheet ? SpreadsheetApp.getActiveSpreadsheet() : null;
  if (bound) return bound;
  var id = getScriptProp_('LEDGER_SSID');
  if (!id) throw new Error('LEDGER_SSID 스크립트 속성이 설정되어 있지 않습니다.');
  return SpreadsheetApp.openById(id);
}
