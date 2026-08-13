/**
 * 법인마스터 / 창고마스터 / 환율마스터 CRUD.
 *
 * 법인·창고는 기본은 "사용여부=N" 비활성화를 권장하지만, 완전 삭제(하드 삭제)도
 * 지원한다 — 과거 거래나 SKU가 그 법인/창고를 참조하고 있으면 완전 삭제는 막고
 * 비활성화만 허용한다(지난 달 수불부가 깨지는 것을 막기 위해). 참조가 하나도 없으면
 * 완전 삭제할 수 있다.
 *
 * 모든 코드 비교는 String()으로 감싼다 — 시트 셀 서식이 아직 "일반 텍스트"로
 * 고정되기 전에 들어간 값이 숫자 타입으로 남아있어도(예: "0001" -> 1) 비교가
 * 깨지지 않도록 하기 위한 방어 코드다. 새로 쓰는 값은 SheetUtil.gs의
 * forceTextFormatForRow_ 가 텍스트로 고정한다.
 */

function listEntities_() {
  return readAllRows_(TABS.ENTITY).sort(function (a, b) {
    return (Number(a['정렬순서']) || 0) - (Number(b['정렬순서']) || 0);
  });
}

function listWarehouses_() {
  return readAllRows_(TABS.WAREHOUSE).sort(function (a, b) {
    return (Number(a['정렬순서']) || 0) - (Number(b['정렬순서']) || 0);
  });
}

function listFx_() {
  return readAllRows_(TABS.FX);
}

function fxRateToKrw_(currencyCode) {
  if (currencyCode === 'KRW') return 1;
  var rows = listFx_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['통화코드']) === String(currencyCode)) return Number(rows[i]['KRW환율']) || null;
  }
  return null;
}

function entityByCode_(code) {
  var rows = listEntities_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['법인코드']) === String(code)) return rows[i];
  }
  return null;
}

function warehouseByCode_(code) {
  var rows = listWarehouses_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['창고코드']) === String(code)) return rows[i];
  }
  return null;
}

/** found 행에 obj 값을 반영할 때 코드성 열은 텍스트 서식으로 고정하고 쓴다. */
function writeRowValues_(sh, rowNum, headers, obj) {
  var idxMap = headerIndexMap_(sh);
  headers.forEach(function (h) {
    if (idxMap[h] === undefined) return;
    if (FORCE_TEXT_HEADERS.indexOf(h) !== -1) {
      sh.getRange(rowNum, idxMap[h] + 1).setNumberFormat('@');
    }
    sh.getRange(rowNum, idxMap[h] + 1).setValue(obj[h]);
  });
}

/** 법인/창고 마스터는 id 컬럼이 없다 — 법인코드/창고코드 자체가 자연키이므로 직접 찾아 갱신한다. */
function upsertEntity_(payload, user) {
  var sh = getTab_(TABS.ENTITY);
  var rows = readAllRows_(sh);
  var code = String(payload['법인코드'] || '').trim();
  if (!code) throw new Error('법인코드는 필수입니다.');
  var currency = payload['국내외구분'] === ENUM.OVERSEAS ? String(payload['통화코드'] || '').trim() : 'KRW';
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['법인코드']) === code) { found = rows[i]; break; }
  }
  var obj = {
    '법인코드': code,
    '법인명': payload['법인명'],
    '국내외구분': payload['국내외구분'] === ENUM.OVERSEAS ? ENUM.OVERSEAS : ENUM.DOMESTIC,
    '통화코드': currency,
    '사용여부': payload['사용여부'] === 'N' ? 'N' : 'Y',
    '정렬순서': payload['정렬순서'] || (found ? found['정렬순서'] : 999),
    'updatedAt': nowIso_(),
    'updatedBy': user || 'admin',
  };
  if (found) {
    writeRowValues_(sh, found.__row, HEADERS[TABS.ENTITY], obj);
  } else {
    appendRowByHeaders_(sh, HEADERS[TABS.ENTITY], obj);
  }
  return obj;
}

function deactivateEntity_(code) {
  var sh = getTab_(TABS.ENTITY);
  var rows = readAllRows_(sh);
  var idxMap = headerIndexMap_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['법인코드']) === String(code)) {
      sh.getRange(rows[i].__row, idxMap['사용여부'] + 1).setValue('N');
      sh.getRange(rows[i].__row, idxMap['updatedAt'] + 1).setValue(nowIso_());
      return true;
    }
  }
  return false;
}

function deleteEntityHard_(code) {
  if (isEntityReferenced_(code)) {
    throw new Error('이 법인을 참조하는 거래 또는 SKU가 있어 완전 삭제할 수 없습니다. 대신 비활성화(사용여부=N)를 사용하세요.');
  }
  var sh = getTab_(TABS.ENTITY);
  var rows = readAllRows_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['법인코드']) === String(code)) { sh.deleteRow(rows[i].__row); return true; }
  }
  return false;
}

function isEntityReferenced_(code) {
  var c = String(code);
  var txTabs = [TABS.IN_MANUAL, TABS.OUT, TABS.DISPOSAL, TABS.DONATION, TABS.ADJUST];
  for (var i = 0; i < txTabs.length; i++) {
    var rows = readAllRows_(txTabs[i]);
    if (rows.some(function (r) { return String(r['법인코드']) === c; })) return true;
  }
  var interco = readAllRows_(TABS.INTERCO);
  if (interco.some(function (r) { return String(r['from법인코드']) === c || String(r['to법인코드']) === c; })) return true;
  var transfer = readAllRows_(TABS.TRANSFER);
  if (transfer.some(function (r) { return String(r['법인코드']) === c; })) return true;
  var seed = readAllRows_(TABS.SEED_STOCK);
  if (seed.some(function (r) { return String(r['법인코드']) === c; })) return true;
  var ending = readAllRows_(TABS.ENDING_ACTUAL);
  if (ending.some(function (r) { return String(r['법인코드']) === c; })) return true;
  return false;
}

function upsertWarehouse_(payload, user) {
  var sh = getTab_(TABS.WAREHOUSE);
  var rows = readAllRows_(sh);
  var code = String(payload['창고코드'] || '').trim();
  if (!code) throw new Error('창고코드는 필수입니다.');
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['창고코드']) === code) { found = rows[i]; break; }
  }
  var obj = {
    '창고코드': code,
    '창고명': payload['창고명'],
    '국내외구분': payload['국내외구분'] === ENUM.OVERSEAS ? ENUM.OVERSEAS : ENUM.DOMESTIC,
    '사용여부': payload['사용여부'] === 'N' ? 'N' : 'Y',
    '정렬순서': payload['정렬순서'] || (found ? found['정렬순서'] : 999),
    'updatedAt': nowIso_(),
    'updatedBy': user || 'admin',
  };
  if (found) {
    writeRowValues_(sh, found.__row, HEADERS[TABS.WAREHOUSE], obj);
  } else {
    appendRowByHeaders_(sh, HEADERS[TABS.WAREHOUSE], obj);
  }
  return obj;
}

function deactivateWarehouse_(code) {
  var sh = getTab_(TABS.WAREHOUSE);
  var rows = readAllRows_(sh);
  var idxMap = headerIndexMap_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['창고코드']) === String(code)) {
      sh.getRange(rows[i].__row, idxMap['사용여부'] + 1).setValue('N');
      sh.getRange(rows[i].__row, idxMap['updatedAt'] + 1).setValue(nowIso_());
      return true;
    }
  }
  return false;
}

function deleteWarehouseHard_(code) {
  if (isWarehouseReferenced_(code)) {
    throw new Error('이 창고를 참조하는 거래가 있어 완전 삭제할 수 없습니다. 대신 비활성화(사용여부=N)를 사용하세요.');
  }
  var sh = getTab_(TABS.WAREHOUSE);
  var rows = readAllRows_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['창고코드']) === String(code)) { sh.deleteRow(rows[i].__row); return true; }
  }
  return false;
}

function isWarehouseReferenced_(code) {
  var c = String(code);
  var straightTabs = [TABS.IN_MANUAL, TABS.OUT, TABS.DISPOSAL, TABS.DONATION, TABS.ADJUST, TABS.INTERCO, TABS.SEED_STOCK, TABS.ENDING_ACTUAL];
  for (var i = 0; i < straightTabs.length; i++) {
    var rows = readAllRows_(straightTabs[i]);
    if (rows.some(function (r) { return String(r['창고코드']) === c; })) return true;
  }
  var transfer = readAllRows_(TABS.TRANSFER);
  if (transfer.some(function (r) { return String(r['from창고코드']) === c || String(r['to창고코드']) === c; })) return true;
  return false;
}

/**
 * 발주내역 연동 등에서 낯선 창고명을 만났을 때 자동으로 창고마스터에 추가한다
 * (자유롭게 추가 가능해야 한다는 요구사항 + 새 창고가 조용히 누락되는 것을 방지).
 * 국내외구분은 미지정 상태로 만들어두고 관리자가 나중에 검토하도록 한다.
 */
function ensureWarehouseExists_(name) {
  if (!name) return null;
  var rows = listWarehouses_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['창고명']) === String(name)) return rows[i];
  }
  var sh = getTab_(TABS.WAREHOUSE);
  var obj = {
    '창고코드': name,
    '창고명': name,
    '국내외구분': '미지정',
    '사용여부': 'Y',
    '정렬순서': 999,
    'updatedAt': nowIso_(),
    'updatedBy': 'auto-sync',
  };
  appendRowByHeaders_(sh, HEADERS[TABS.WAREHOUSE], obj);
  return obj;
}

function upsertFx_(payload, user) {
  var sh = getTab_(TABS.FX);
  var rows = readAllRows_(sh);
  var code = String(payload['통화코드'] || '').trim();
  if (!code) throw new Error('통화코드는 필수입니다.');
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['통화코드']) === code) { found = rows[i]; break; }
  }
  var obj = {
    '통화코드': code,
    'KRW환율': Number(payload['KRW환율']),
    '기준일자': payload['기준일자'] || nowIso_().slice(0, 10),
    'updatedAt': nowIso_(),
  };
  if (found) {
    writeRowValues_(sh, found.__row, HEADERS[TABS.FX], obj);
  } else {
    appendRowByHeaders_(sh, HEADERS[TABS.FX], obj);
  }
  return obj;
}

function deleteFx_(code) {
  var sh = getTab_(TABS.FX);
  var rows = readAllRows_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['통화코드']) === String(code)) { sh.deleteRow(rows[i].__row); return true; }
  }
  throw new Error('해당 통화를 찾을 수 없습니다.');
}
