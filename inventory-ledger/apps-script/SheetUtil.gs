/**
 * 헤더 이름 기반 범용 시트 read/write 헬퍼.
 *
 * 왜 헤더 이름 기반인가: 옛 수불부 파일이 COLUMN()-9 같은 상대 열 위치 수식으로
 * 다른 탭을 참조하다가 열 하나만 밀려도 깨지는 문제가 있었다(설계 문서 §01 FINDING 3).
 * 여기서는 절대 열 번호를 코드에 하드코딩하지 않고, 항상 1행 헤더 텍스트로 열을 찾는다.
 */

function getTab_(tabName) {
  var ss = getLedgerSpreadsheet_();
  var sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error('탭을 찾을 수 없습니다: ' + tabName);
  return sh;
}

function headerIndexMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h) map[h] = i; // 0-based
  }
  return map;
}

/** 시트 전체를 [{header: value}, ...] 배열로 읽는다. 빈 행(id/첫 열이 빈 값)은 건너뛴다. */
function readAllRows_(sheetOrName) {
  var sheet = typeof sheetOrName === 'string' ? getTab_(sheetOrName) : sheetOrName;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol === 0) return [];
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var isBlank = row.every(function (v) { return v === '' || v === null; });
    if (isBlank) continue;
    var obj = { __row: r + 2 };
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}

/** 표준 헤더 배열(HEADERS[tab])의 열 순서대로 obj 값을 뽑아 한 행을 append. */
function appendRowByHeaders_(sheetOrName, headers, obj) {
  var sheet = typeof sheetOrName === 'string' ? getTab_(sheetOrName) : sheetOrName;
  var row = headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? '' : v;
  });
  sheet.appendRow(row);
}

/** id 컬럼 값으로 행을 찾아 obj의 값들로 갱신. 없으면 false 리턴(호출부에서 append 처리). */
function updateRowById_(sheetOrName, headers, id, obj) {
  var sheet = typeof sheetOrName === 'string' ? getTab_(sheetOrName) : sheetOrName;
  var idCol = headers.indexOf('id');
  if (idCol === -1) throw new Error('id 헤더가 없는 탭에는 updateRowById_ 를 쓸 수 없습니다.');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0]) === String(id)) {
      var rowNum = r + 2;
      var newRow = headers.map(function (h) {
        var v = obj[h];
        return v === undefined || v === null ? '' : v;
      });
      sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
      return true;
    }
  }
  return false;
}

function deleteRowById_(sheetOrName, headers, id) {
  var sheet = typeof sheetOrName === 'string' ? getTab_(sheetOrName) : sheetOrName;
  var idCol = headers.indexOf('id');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0]) === String(id)) {
      sheet.deleteRow(r + 2);
      return true;
    }
  }
  return false;
}

function newId_() {
  return Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}

/** "YYYY-MM-DD" 또는 Date -> "YYYY-MM" */
function toYm_(dateVal) {
  var d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  return y + '-' + m;
}

function ymAddMonths_(ym, n) {
  var parts = ym.split('-');
  var y = Number(parts[0]);
  var m = Number(parts[1]) - 1 + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return y + '-' + ('0' + (m + 1)).slice(-2);
}

function ymCompare_(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 시트가 없으면 만들고 헤더를 쓴다. 이미 있으면 헤더만 확인(없는 헤더는 append). */
function ensureTabWithHeaders_(ss, tabName, headers) {
  var sh = ss.getSheetByName(tabName);
  if (!sh) {
    sh = ss.insertSheet(tabName);
  }
  var lastCol = sh.getLastColumn();
  var existing = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var existingSet = {};
  existing.forEach(function (h) { existingSet[String(h).trim()] = true; });
  var missing = headers.filter(function (h) { return !existingSet[h]; });
  if (existing.length === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (missing.length) {
    sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  sh.setFrozenRows(1);
  return sh;
}
