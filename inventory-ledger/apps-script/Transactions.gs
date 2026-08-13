/**
 * 6개 거래유형(+ 입고의 무상/반품 보정)에 대한 CRUD.
 *
 * "입고" 입력은 화면 하나지만 성격에 따라 실제로는 다른 탭에 기록된다 (설계 문서 §09):
 *   구매입고        -> 기록 불가 (발주내역_관리시트 자동 전용)
 *   무상입고/반품입고 -> 거래_입고
 *   창고이동입고     -> 거래_창고이동 (출발 창고 필요, 저장 한 번으로 양쪽에 반영)
 *   사간거래입고     -> 거래_사간거래 (출발 법인 필요, 저장 한 번으로 양쪽에 반영)
 */

function listTx_(tab, filters) {
  var rows = readAllRows_(tab);
  if (!filters) return rows;
  return rows.filter(function (r) {
    for (var k in filters) {
      if (!filters[k]) continue;
      if (String(r[k]) !== String(filters[k])) return false;
    }
    return true;
  });
}

function validateCommon_(payload) {
  if (!payload['일자']) throw new Error('일자는 필수입니다.');
  if (!payload['상품코드']) throw new Error('상품코드는 필수입니다.');
  var qty = Number(payload['수량']);
  if (!qty || qty <= 0) throw new Error('수량은 0보다 커야 합니다.');
}

/** 입고 화면의 단일 진입점 — 성격에 따라 라우팅한다. */
function createInboundEntry_(payload, user) {
  var kind = payload['성격'];
  if (kind === '구매입고') {
    throw new Error('구매입고는 발주내역_관리시트에서 자동으로 반영됩니다. 이 화면에서 직접 입력할 수 없습니다.');
  }
  if (kind === '무상입고' || kind === '반품입고') {
    return upsertManualInbound_(
      Object.assign({}, payload, { 세부구분: kind }),
      user
    );
  }
  if (kind === '창고이동입고') {
    if (!payload['출발창고코드']) throw new Error('창고이동입고는 출발 창고가 필요합니다.');
    return upsertTransfer_(
      {
        일자: payload['일자'], 법인코드: payload['법인코드'], 상품코드: payload['상품코드'], 수량: payload['수량'],
        from창고코드: payload['출발창고코드'], to창고코드: payload['창고코드'], 메모: payload['메모'],
      },
      user
    );
  }
  if (kind === '사간거래입고') {
    if (!payload['출발법인코드']) throw new Error('사간거래입고는 출발 법인이 필요합니다.');
    return upsertInterco_(
      {
        일자: payload['일자'], from법인코드: payload['출발법인코드'], to법인코드: payload['법인코드'],
        창고코드: payload['창고코드'], 상품코드: payload['상품코드'], 수량: payload['수량'], 메모: payload['메모'],
      },
      user
    );
  }
  throw new Error('알 수 없는 입고 성격입니다: ' + kind);
}

function upsertManualInbound_(payload, user) {
  validateCommon_(payload);
  if (ENUM.IN_REASON.indexOf(payload['세부구분']) === -1) {
    throw new Error('입고 세부구분은 ' + ENUM.IN_REASON.join('/') + ' 중 하나여야 합니다.');
  }
  var headers = HEADERS[TABS.IN_MANUAL];
  var id = payload['id'] || newId_();
  var obj = {
    id: id, 일자: payload['일자'], 법인코드: payload['법인코드'], 창고코드: payload['창고코드'],
    상품코드: payload['상품코드'], 세부구분: payload['세부구분'], 수량: Number(payload['수량']),
    메모: payload['메모'] || '', updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = payload['id'] && updateRowById_(TABS.IN_MANUAL, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.IN_MANUAL, headers, obj);
  return obj;
}

function upsertOut_(payload, user) {
  validateCommon_(payload);
  if (ENUM.OUT_REASON.indexOf(payload['세부구분']) === -1) {
    throw new Error('출고 세부구분은 ' + ENUM.OUT_REASON.join('/') + ' 중 하나여야 합니다.');
  }
  var headers = HEADERS[TABS.OUT];
  var id = payload['id'] || newId_();
  var obj = {
    id: id, 일자: payload['일자'], 법인코드: payload['법인코드'], 창고코드: payload['창고코드'],
    상품코드: payload['상품코드'], 세부구분: payload['세부구분'], 수량: Number(payload['수량']),
    출처: payload['출처'] || ENUM.SOURCE_ACTUAL, 메모: payload['메모'] || '',
    updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = payload['id'] && updateRowById_(TABS.OUT, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.OUT, headers, obj);
  return obj;
}

function upsertDisposal_(payload, user) {
  validateCommon_(payload);
  var headers = HEADERS[TABS.DISPOSAL];
  var id = payload['id'] || newId_();
  var obj = {
    id: id, 일자: payload['일자'], 법인코드: payload['법인코드'], 창고코드: payload['창고코드'],
    상품코드: payload['상품코드'], 수량: Number(payload['수량']), 사유: payload['사유'] || '',
    updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = payload['id'] && updateRowById_(TABS.DISPOSAL, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.DISPOSAL, headers, obj);
  return obj;
}

function upsertDonation_(payload, user) {
  validateCommon_(payload);
  var headers = HEADERS[TABS.DONATION];
  var id = payload['id'] || newId_();
  var obj = {
    id: id, 일자: payload['일자'], 법인코드: payload['법인코드'], 창고코드: payload['창고코드'],
    상품코드: payload['상품코드'], 수량: Number(payload['수량']), 수혜처: payload['수혜처'] || '',
    updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = payload['id'] && updateRowById_(TABS.DONATION, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.DONATION, headers, obj);
  return obj;
}

/** 법인 간 재고 이동은 예외 없이 이 함수를 통해서만 기록된다 (설계 문서 §09-3). */
function upsertInterco_(payload, user) {
  if (!payload['일자']) throw new Error('일자는 필수입니다.');
  if (!payload['from법인코드'] || !payload['to법인코드']) throw new Error('출발/도착 법인이 모두 필요합니다.');
  if (payload['from법인코드'] === payload['to법인코드']) throw new Error('출발 법인과 도착 법인이 같을 수 없습니다.');
  if (!payload['상품코드']) throw new Error('상품코드는 필수입니다.');
  var qty = Number(payload['수량']);
  if (!qty || qty <= 0) throw new Error('수량은 0보다 커야 합니다.');

  var headers = HEADERS[TABS.INTERCO];
  var id = payload['id'] || newId_();
  var obj = {
    id: id, 일자: payload['일자'], from법인코드: payload['from법인코드'], to법인코드: payload['to법인코드'],
    창고코드: payload['창고코드'], 상품코드: payload['상품코드'], 수량: qty, 메모: payload['메모'] || '',
    updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = payload['id'] && updateRowById_(TABS.INTERCO, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.INTERCO, headers, obj);
  return obj;
}

/** 창고 간 이동은 1건 입력으로 출발/도착 양쪽에 자동 반영된다 (Ledger.gs 계산 시점에 처리). */
function upsertTransfer_(payload, user) {
  if (!payload['일자']) throw new Error('일자는 필수입니다.');
  if (!payload['from창고코드'] || !payload['to창고코드']) throw new Error('출발/도착 창고가 모두 필요합니다.');
  if (payload['from창고코드'] === payload['to창고코드']) throw new Error('출발 창고와 도착 창고가 같을 수 없습니다.');
  if (!payload['상품코드']) throw new Error('상품코드는 필수입니다.');
  var qty = Number(payload['수량']);
  if (!qty || qty <= 0) throw new Error('수량은 0보다 커야 합니다.');

  var headers = HEADERS[TABS.TRANSFER];
  var id = payload['id'] || newId_();
  var obj = {
    id: id, 일자: payload['일자'], 법인코드: payload['법인코드'], from창고코드: payload['from창고코드'],
    to창고코드: payload['to창고코드'], 상품코드: payload['상품코드'], 수량: qty, 메모: payload['메모'] || '',
    updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = payload['id'] && updateRowById_(TABS.TRANSFER, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.TRANSFER, headers, obj);
  return obj;
}

function upsertAdjust_(payload, user) {
  if (!payload['일자']) throw new Error('일자는 필수입니다.');
  if (!payload['상품코드']) throw new Error('상품코드는 필수입니다.');
  if (ENUM.ADJUST_REASON.indexOf(payload['구분']) === -1) {
    throw new Error('재고조정 구분은 ' + ENUM.ADJUST_REASON.join('/') + ' 중 하나여야 합니다.');
  }
  if (!payload['사유']) throw new Error('재고조정은 사유 입력이 필수입니다.');
  var delta = Number(payload['증감수량']);
  if (!delta) throw new Error('증감수량은 0이 아니어야 합니다.');

  var headers = HEADERS[TABS.ADJUST];
  var id = payload['id'] || newId_();
  var obj = {
    id: id, 일자: payload['일자'], 법인코드: payload['법인코드'], 창고코드: payload['창고코드'],
    상품코드: payload['상품코드'], 구분: payload['구분'], 증감수량: delta, 사유: payload['사유'],
    updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = payload['id'] && updateRowById_(TABS.ADJUST, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.ADJUST, headers, obj);
  return obj;
}

function upsertEndingActual_(payload, user) {
  if (!payload['연월'] || !payload['상품코드'] || !payload['창고코드'] || !payload['법인코드']) {
    throw new Error('법인/창고/상품코드/연월은 모두 필수입니다.');
  }
  var headers = HEADERS[TABS.ENDING_ACTUAL];
  var id = payload['id'] || newId_();
  var obj = {
    id: id, 법인코드: payload['법인코드'], 창고코드: payload['창고코드'], 상품코드: payload['상품코드'],
    연월: payload['연월'], 실측수량: Number(payload['실측수량']), 출처: payload['출처'] || '',
    updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = payload['id'] && updateRowById_(TABS.ENDING_ACTUAL, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.ENDING_ACTUAL, headers, obj);
  return obj;
}

var TAB_BY_TXTYPE = {
  입고: TABS.IN_MANUAL,
  출고: TABS.OUT,
  폐기: TABS.DISPOSAL,
  기부: TABS.DONATION,
  사간거래: TABS.INTERCO,
  창고이동: TABS.TRANSFER,
  재고조정: TABS.ADJUST,
  기말재고실측: TABS.ENDING_ACTUAL,
};

function deleteTx_(txType, id) {
  var tab = TAB_BY_TXTYPE[txType];
  if (!tab) throw new Error('알 수 없는 거래유형입니다: ' + txType);
  var ok = deleteRowById_(tab, HEADERS[tab], id);
  if (!ok) throw new Error('삭제할 행을 찾지 못했습니다.');
  return { deleted: true };
}
