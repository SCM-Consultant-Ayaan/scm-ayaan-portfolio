/**
 * 최초 1회 실행용 세팅 스크립트.
 *
 * 사용법:
 *   1. 이 저장소 스프레드시트를 열고 확장 프로그램 > Apps Script 로 들어간다.
 *   2. 이 프로젝트의 모든 .gs 파일 내용을 그대로 붙여넣는다.
 *   3. 함수 선택 드롭다운에서 setupAll 을 고르고 ▶ 실행 (첫 실행은 권한 승인 필요).
 *   4. 실행 후 이 스프레드시트에 모든 탭·헤더·기본 마스터 데이터가 생성된다.
 *   5. 관리자 비밀번호는 메뉴 [재고수불부 > 관리자 비밀번호 설정]에서 설정한다.
 *   6. 배포 > 새 배포 > 웹앱으로 배포, "실행 계정: 나", "액세스 권한: 모든 사용자"로 배포한다.
 */
function setupAll() {
  var ss = getLedgerSpreadsheet_();
  setScriptProp_('LEDGER_SSID', ss.getId());

  ensureTabWithHeaders_(ss, TABS.ENTITY, HEADERS[TABS.ENTITY]);
  ensureTabWithHeaders_(ss, TABS.WAREHOUSE, HEADERS[TABS.WAREHOUSE]);
  ensureTabWithHeaders_(ss, TABS.FX, HEADERS[TABS.FX]);
  ensureTabWithHeaders_(ss, TABS.LINK_CONFIG, HEADERS[TABS.LINK_CONFIG]);
  ensureTabWithHeaders_(ss, TABS.SEED_STOCK, HEADERS[TABS.SEED_STOCK]);
  ensureTabWithHeaders_(ss, TABS.IN_MANUAL, HEADERS[TABS.IN_MANUAL]);
  ensureTabWithHeaders_(ss, TABS.OUT, HEADERS[TABS.OUT]);
  ensureTabWithHeaders_(ss, TABS.DISPOSAL, HEADERS[TABS.DISPOSAL]);
  ensureTabWithHeaders_(ss, TABS.DONATION, HEADERS[TABS.DONATION]);
  ensureTabWithHeaders_(ss, TABS.INTERCO, HEADERS[TABS.INTERCO]);
  ensureTabWithHeaders_(ss, TABS.TRANSFER, HEADERS[TABS.TRANSFER]);
  ensureTabWithHeaders_(ss, TABS.ADJUST, HEADERS[TABS.ADJUST]);
  ensureTabWithHeaders_(ss, TABS.ENDING_ACTUAL, HEADERS[TABS.ENDING_ACTUAL]);
  ensureTabWithHeaders_(ss, TABS.UPLOAD_BATCH, HEADERS[TABS.UPLOAD_BATCH]);
  ensureTabWithHeaders_(ss, TABS.UPLOAD_MAP, HEADERS[TABS.UPLOAD_MAP]);

  seedLinkConfigDefaults_();
  seedEntitiesIfEmpty_();
  seedFxIfEmpty_();

  // 기본 시트(Sheet1)가 남아있으면 정리
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  buildAdminMenu_();
  SpreadsheetApp.getUi().alert(
    '세팅 완료',
    '모든 탭이 생성됐습니다.\n\n다음 순서로 진행해주세요:\n' +
      '1) [연동설정] 탭에서 PO_SSID, SKU_SSID 값을 채워주세요.\n' +
      '2) [법인마스터] 탭에서 실제 법인 정보를 확인/수정해주세요.\n' +
      '3) 메뉴 [재고수불부 > 관리자 비밀번호 설정] 으로 비밀번호를 설정해주세요.\n' +
      '4) 배포 > 새 배포 > 웹앱으로 배포해주세요.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function seedLinkConfigDefaults_() {
  var sh = getTab_(TABS.LINK_CONFIG);
  var existing = readAllRows_(sh);
  var existingKeys = {};
  existing.forEach(function (r) { existingKeys[r['항목']] = true; });
  LINK_CONFIG_DEFAULTS.forEach(function (row) {
    if (!existingKeys[row[0]]) sh.appendRow(row);
  });
}

function seedEntitiesIfEmpty_() {
  var sh = getTab_(TABS.ENTITY);
  if (readAllRows_(sh).length > 0) return;
  var now = nowIso_();
  var rows = [
    ['IB', '아이리스브라이트', ENUM.DOMESTIC, 'KRW', 'Y', 1, now, 'setup'],
    ['KB', '케이빅스', ENUM.DOMESTIC, 'KRW', 'Y', 2, now, 'setup'],
    ['ML', '말러', ENUM.DOMESTIC, 'KRW', 'Y', 3, now, 'setup'],
  ];
  rows.forEach(function (r) { sh.appendRow(r); });
}

function seedFxIfEmpty_() {
  var sh = getTab_(TABS.FX);
  if (readAllRows_(sh).length > 0) return;
  var now = nowIso_();
  // 참고용 예시 환율 — 실제 값으로 갱신 필요
  sh.appendRow(['KRW', 1, now.slice(0, 10), now]);
  sh.appendRow(['USD', 1380, now.slice(0, 10), now]);
  sh.appendRow(['TWD', 43, now.slice(0, 10), now]);
  sh.appendRow(['HKD', 177, now.slice(0, 10), now]);
  sh.appendRow(['CNY', 190, now.slice(0, 10), now]);
}

function buildAdminMenu_() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('재고수불부')
      .addItem('관리자 비밀번호 설정', 'promptSetAdminPassword_')
      .addItem('설정 다시 실행 (setupAll)', 'setupAll')
      .addToUi();
  } catch (e) {
    // 트리거로 실행 중이면 UI 없음 — 무시
  }
}

function onOpen() {
  buildAdminMenu_();
}

function promptSetAdminPassword_() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('관리자 비밀번호 설정', '새 관리자 비밀번호를 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pw = res.getResponseText().trim();
  if (!pw) {
    ui.alert('비밀번호가 비어있어 저장하지 않았습니다.');
    return;
  }
  setScriptProp_('ADMIN_PASSWORD', pw);
  ui.alert('저장 완료', '관리자 비밀번호가 설정됐습니다.', ui.ButtonSet.OK);
}
