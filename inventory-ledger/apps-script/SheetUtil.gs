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

/**
 * FORCE_TEXT_HEADERS 에 있는 열은 값을 쓰기 전에 셀 서식을 "일반 텍스트"로 고정한다.
 * 서식을 먼저 지정하지 않으면 "0001"처럼 숫자로만 보이는 문자열을 Sheets가 자동으로
 * 숫자 1로 바꿔버려서 앞자리 0이 사라진다 — 이 경우 코드 비교(===)가 깨진다.
 * idxMap은 헤더 이름 -> 실제 열 인덱스(0-based) 맵(headerIndexMap_ 결과)이다.
 */
function forceTextFormatForRow_(sheet, rowNum, headers, idxMap) {
  headers.forEach(function (h) {
    if (FORCE_TEXT_HEADERS.indexOf(h) !== -1 && idxMap[h] !== undefined) {
      sheet.getRange(rowNum, idxMap[h] + 1).setNumberFormat('@');
    }
  });
}

/**
 * headers 배열 순서가 아니라, 시트에 실제로 있는 헤더 "이름"의 열 위치에 맞춰 값을 쓴다.
 * 왜 중요한가: 탭이 만들어진 뒤 새 헤더가 추가되면 ensureTabWithHeaders_ 가 그 헤더를
 * 맨 뒤에 붙이기 때문에, 코드의 HEADERS 배열 순서와 시트의 실제 열 순서가 달라질 수
 * 있다. 예전에는 항상 1번째 열부터 순서대로 썼는데, 그러면 이 두 순서가 어긋나는
 * 순간 값이 엉뚱한 열로 밀려 들어간다. 그래서 항상 실제 열 위치를 조회해서 그 위치에
 * 정확히 쓴다.
 */
function appendRowByHeaders_(sheetOrName, headers, obj) {
  var sheet = typeof sheetOrName === 'string' ? getTab_(sheetOrName) : sheetOrName;
  var idxMap = headerIndexMap_(sheet);
  var width = Math.max(sheet.getLastColumn(), headers.length);
  var rowNum = sheet.getLastRow() + 1;
  var rowArr = new Array(width).fill('');
  headers.forEach(function (h) {
    if (idxMap[h] === undefined) return; // ensureTabWithHeaders_ 를 안 돌렸으면 무시(호출부에서 미리 보장해야 함)
    var v = obj[h];
    rowArr[idxMap[h]] = v === undefined || v === null ? '' : v;
  });
  forceTextFormatForRow_(sheet, rowNum, headers, idxMap);
  sheet.getRange(rowNum, 1, 1, width).setValues([rowArr]);
}

/** id 컬럼 값으로 행을 찾아 obj의 값들로 갱신. 없으면 false 리턴(호출부에서 append 처리). */
function updateRowById_(sheetOrName, headers, id, obj) {
  var sheet = typeof sheetOrName === 'string' ? getTab_(sheetOrName) : sheetOrName;
  var idxMap = headerIndexMap_(sheet);
  var idCol = idxMap['id'];
  if (idCol === undefined) throw new Error('id 헤더가 없는 탭에는 updateRowById_ 를 쓸 수 없습니다.');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0]) === String(id)) {
      var rowNum = r + 2;
      var width = sheet.getLastColumn();
      var rowArr = sheet.getRange(rowNum, 1, 1, width).getValues()[0]; // 매핑 안 된 기존 값은 그대로 보존
      headers.forEach(function (h) {
        if (idxMap[h] === undefined) return;
        var v = obj[h];
        rowArr[idxMap[h]] = v === undefined || v === null ? '' : v;
      });
      forceTextFormatForRow_(sheet, rowNum, headers, idxMap);
      sheet.getRange(rowNum, 1, 1, width).setValues([rowArr]);
      return true;
    }
  }
  return false;
}

function deleteRowById_(sheetOrName, headers, id) {
  var sheet = typeof sheetOrName === 'string' ? getTab_(sheetOrName) : sheetOrName;
  var idxMap = headerIndexMap_(sheet);
  var idCol = idxMap['id'];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || idCol === undefined) return false;
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

  // 코드성 열은 전체 컬럼을 "일반 텍스트" 서식으로 고정해서, 앞으로 이 스크립트를 통해서든
  // 사람이 시트에 직접 입력해서든 "0001" 같은 값이 숫자로 바뀌지 않도록 한다.
  headers.forEach(function (h, i) {
    if (FORCE_TEXT_HEADERS.indexOf(h) !== -1) {
      sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    }
  });

  return sh;
}
