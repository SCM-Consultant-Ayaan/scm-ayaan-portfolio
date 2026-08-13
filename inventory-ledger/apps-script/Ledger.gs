/**
 * 월별 수불부 계산 엔진.
 *
 * 계산 단위는 (법인, 창고, 상품코드) 조합이다 — 다법인 혼재 창고에서는 같은 SKU가
 * 여러 법인 소유로 동시에 존재할 수 있기 때문에(사간거래로 소유가 옮겨간 뒤) 이 세
 * 축을 다 묶어야만 재고가 맞아떨어진다.
 *
 * 이동평균단가 규칙 (원본 25년 양식 §01 FINDING 1을 계승 + 통화 확장):
 *   - 매입수량, 사간거래IN, 창고이동IN 만 단가 계산(분자/분모)에 영향을 준다.
 *   - 무상입고/반품입고/재고조정/폐기/기부/출고는 수량만 바뀌고 단가는 그대로 유지된다.
 *   - 사간거래IN의 원가는 "보내는 법인의 전월 말 이동평균단가"를 그 시점 환율로
 *     받는 법인 통화로 환산해서 사용한다(같은 달 순환참조를 피하기 위해 전월 값 사용).
 *   - 창고이동IN의 원가는 "보내는 창고의 전월 말 이동평균단가"를 그대로 쓴다
 *     (법인이 안 바뀌므로 통화도 그대로).
 */

function keyOf_(entity, wh, sku) {
  return entity + '|' + wh + '|' + sku;
}

function entityCurrency_(code, byCode) {
  var e = byCode ? byCode[code] : entityByCode_(code);
  return e ? e['통화코드'] : 'KRW';
}

function convertCurrency_(amount, fromCcy, toCcy) {
  if (!amount) return 0;
  if (fromCcy === toCcy) return { value: amount, ok: true };
  var fromRate = fxRateToKrw_(fromCcy);
  var toRate = fxRateToKrw_(toCcy);
  if (!fromRate || !toRate) return { value: 0, ok: false };
  return { value: (amount * fromRate) / toRate, ok: true };
}

function buildLedgerEvents_() {
  var events = [];
  var fxWarnings = [];

  fetchPurchaseInbound_().forEach(function (r) {
    if (!r.법인코드 || !r.창고코드) return; // 미매핑 SKU/창고는 제외 (poSyncWarnings_ 에서 별도로 보여줌)
    events.push({ 법인코드: r.법인코드, 창고코드: r.창고코드, 상품코드: r.상품코드, 연월: r.연월, 유형: '매입', 수량: r.수량, 단가: r.단가 });
  });

  readAllRows_(TABS.IN_MANUAL).forEach(function (r) {
    var type = r['세부구분'] === '무상입고' ? '무상매입' : '반품입고';
    events.push({ 법인코드: r['법인코드'], 창고코드: r['창고코드'], 상품코드: r['상품코드'], 연월: toYm_(r['일자']), 유형: type, 수량: Number(r['수량']) });
  });

  readAllRows_(TABS.OUT).forEach(function (r) {
    var type = r['세부구분'] === '판매출고' ? '판매출고' : '기타출고';
    events.push({ 법인코드: r['법인코드'], 창고코드: r['창고코드'], 상품코드: r['상품코드'], 연월: toYm_(r['일자']), 유형: type, 수량: Number(r['수량']) });
  });

  readAllRows_(TABS.DISPOSAL).forEach(function (r) {
    events.push({ 법인코드: r['법인코드'], 창고코드: r['창고코드'], 상품코드: r['상품코드'], 연월: toYm_(r['일자']), 유형: '폐기', 수량: Number(r['수량']) });
  });

  readAllRows_(TABS.DONATION).forEach(function (r) {
    events.push({ 법인코드: r['법인코드'], 창고코드: r['창고코드'], 상품코드: r['상품코드'], 연월: toYm_(r['일자']), 유형: '기부', 수량: Number(r['수량']) });
  });

  readAllRows_(TABS.INTERCO).forEach(function (r) {
    var ym = toYm_(r['일자']);
    var qty = Number(r['수량']);
    events.push({ 법인코드: r['from법인코드'], 창고코드: r['창고코드'], 상품코드: r['상품코드'], 연월: ym, 유형: '사간거래OUT', 수량: qty });
    events.push({
      법인코드: r['to법인코드'], 창고코드: r['창고코드'], 상품코드: r['상품코드'], 연월: ym, 유형: '사간거래IN', 수량: qty,
      sourceKey: keyOf_(r['from법인코드'], r['창고코드'], r['상품코드']),
    });
  });

  readAllRows_(TABS.TRANSFER).forEach(function (r) {
    var ym = toYm_(r['일자']);
    var qty = Number(r['수량']);
    events.push({ 법인코드: r['법인코드'], 창고코드: r['from창고코드'], 상품코드: r['상품코드'], 연월: ym, 유형: '창고이동OUT', 수량: qty });
    events.push({
      법인코드: r['법인코드'], 창고코드: r['to창고코드'], 상품코드: r['상품코드'], 연월: ym, 유형: '창고이동IN', 수량: qty,
      sourceKey: keyOf_(r['법인코드'], r['from창고코드'], r['상품코드']),
    });
  });

  readAllRows_(TABS.ADJUST).forEach(function (r) {
    events.push({ 법인코드: r['법인코드'], 창고코드: r['창고코드'], 상품코드: r['상품코드'], 연월: toYm_(r['일자']), 유형: '재고조정', 수량: Number(r['증감수량']) });
  });

  return { events: events, fxWarnings: fxWarnings };
}

/** 전체 (법인,창고,SKU) 조합에 대해 처음부터 endYm까지 월별로 굴려서 계산한다. */
function computeLedger_(opts) {
  opts = opts || {};
  var built = buildLedgerEvents_();
  var events = built.events;
  var seeds = readAllRows_(TABS.SEED_STOCK);

  var groups = {};
  function ensureGroup(entity, wh, sku) {
    var k = keyOf_(entity, wh, sku);
    if (!groups[k]) groups[k] = { key: k, 법인코드: entity, 창고코드: wh, 상품코드: sku, monthly: {}, events: [] };
    return groups[k];
  }

  events.forEach(function (e) {
    if (!e.법인코드 || !e.창고코드 || !e.상품코드 || !e.연월) return;
    ensureGroup(e.법인코드, e.창고코드, e.상품코드).events.push(e);
  });
  seeds.forEach(function (s) {
    if (!s['법인코드'] || !s['창고코드'] || !s['상품코드'] || !s['시작연월']) return;
    ensureGroup(s['법인코드'], s['창고코드'], s['상품코드']).seed = {
      ym: s['시작연월'], qty: Number(s['기초수량']) || 0, price: Number(s['기초단가']) || 0,
    };
  });

  var allYms = {};
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    if (g.seed) allYms[g.seed.ym] = true;
    g.events.forEach(function (e) { allYms[e.연월] = true; });
  });
  var ymList = Object.keys(allYms).sort();
  if (!ymList.length) return { rows: [], months: [], fxIssues: [] };

  var startYm = ymList[0];
  var endYm = opts.toYm || ymList[ymList.length - 1];
  var months = [];
  for (var ym = startYm; ymCompare_(ym, endYm) <= 0; ym = ymAddMonths_(ym, 1)) months.push(ym);

  var entities = listEntities_();
  var entityByCode = {};
  entities.forEach(function (e) { entityByCode[e['법인코드']] = e; });

  var fxIssues = [];
  var state = {};

  months.forEach(function (ym) {
    var prevState = state;
    var nextState = {};

    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      var prev = prevState[k] || (g.seed && g.seed.ym === ym ? { qty: g.seed.qty, price: g.seed.price } : { qty: 0, price: 0 });
      var monthEvents = g.events.filter(function (e) { return e.연월 === ym; });

      var m = {
        매입수량: 0, 매입금액: 0, 무상매입: 0, 반품입고: 0, 사간거래IN: 0, 사간거래OUT: 0,
        창고이동IN: 0, 창고이동OUT: 0, 판매출고: 0, 기타출고: 0, 폐기: 0, 기부: 0, 재고조정: 0,
      };
      var intercoInCostBasis = 0;
      var transferInCostBasis = 0;
      var myCcy = entityCurrency_(g.법인코드, entityByCode);

      monthEvents.forEach(function (e) {
        switch (e.유형) {
          case '매입': m.매입수량 += e.수량; m.매입금액 += e.수량 * (e.단가 || 0); break;
          case '무상매입': m.무상매입 += e.수량; break;
          case '반품입고': m.반품입고 += e.수량; break;
          case '판매출고': m.판매출고 += e.수량; break;
          case '기타출고': m.기타출고 += e.수량; break;
          case '폐기': m.폐기 += e.수량; break;
          case '기부': m.기부 += e.수량; break;
          case '재고조정': m.재고조정 += e.수량; break;
          case '사간거래OUT': m.사간거래OUT += e.수량; break;
          case '창고이동OUT': m.창고이동OUT += e.수량; break;
          case '사간거래IN': {
            m.사간거래IN += e.수량;
            var srcPrev = prevState[e.sourceKey] || { qty: 0, price: 0 };
            var srcEntity = groups[e.sourceKey] ? groups[e.sourceKey].법인코드 : null;
            var srcCcy = entityCurrency_(srcEntity, entityByCode);
            var conv = convertCurrency_(srcPrev.price, srcCcy, myCcy);
            if (!conv.ok) fxIssues.push({ 연월: ym, 그룹: k, 사유: '환율 없음: ' + srcCcy + ' -> ' + myCcy });
            intercoInCostBasis += e.수량 * conv.value;
            break;
          }
          case '창고이동IN': {
            m.창고이동IN += e.수량;
            var srcPrev2 = prevState[e.sourceKey] || { qty: 0, price: 0 };
            transferInCostBasis += e.수량 * srcPrev2.price;
            break;
          }
        }
      });

      var totalIn = m.매입수량 + m.무상매입 + m.반품입고 + m.사간거래IN + m.창고이동IN;
      var totalOut = m.판매출고 + m.기타출고 + m.폐기 + m.기부 + m.사간거래OUT + m.창고이동OUT;
      var endQty = prev.qty + totalIn - totalOut + m.재고조정;

      var costedQty = m.매입수량 + m.사간거래IN + m.창고이동IN;
      var costedAmount = m.매입금액 + intercoInCostBasis + transferInCostBasis;
      var denom = prev.qty + costedQty;
      var price = denom > 0 ? (prev.qty * prev.price + costedAmount) / denom : prev.price;
      if (!isFinite(price)) price = prev.price || 0;

      g.monthly[ym] = Object.assign({}, m, {
        기초수량: prev.qty, 기말수량: endQty, 단가: price, 기말금액: endQty * price, 통화코드: myCcy,
      });
      nextState[k] = { qty: endQty, price: price };
    });

    state = nextState;
  });

  return { rows: Object.values(groups), months: months, fxIssues: fxIssues };
}

var _ledgerCache = null;
function computeLedgerCached_(toYm) {
  var cacheKey = toYm || '__latest__';
  if (!_ledgerCache) _ledgerCache = {};
  if (!_ledgerCache[cacheKey]) _ledgerCache[cacheKey] = computeLedger_({ toYm: toYm });
  return _ledgerCache[cacheKey];
}

/**
 * 대시보드용 뷰. entityCode/warehouseCode 가 'ALL'이 아니면 그 값으로 필터링한다.
 * 계산 자체는 항상 전체 그룹을 대상으로 하고(사간거래/창고이동의 상대편 참조 때문),
 * 필터는 결과를 보여줄 때만 적용한다.
 */
function getLedgerView_(opts) {
  opts = opts || {};
  var result = computeLedgerCached_(opts.toYm);
  var sku = getSkuMap_();
  var entities = {};
  listEntities_().forEach(function (e) { entities[e['법인코드']] = e; });
  var warehouses = {};
  listWarehouses_().forEach(function (w) { warehouses[w['창고코드']] = w; });

  var rows = result.rows.filter(function (g) {
    if (opts.entityCode && opts.entityCode !== 'ALL' && g.법인코드 !== opts.entityCode) return false;
    if (opts.warehouseCode && opts.warehouseCode !== 'ALL' && g.창고코드 !== opts.warehouseCode) return false;
    if (opts.skuCode && g.상품코드 !== opts.skuCode) return false;
    return true;
  }).map(function (g) {
    var skuMeta = sku.map[g.상품코드] || {};
    return {
      법인코드: g.법인코드, 법인명: entities[g.법인코드] ? entities[g.법인코드]['법인명'] : g.법인코드,
      창고코드: g.창고코드, 창고명: warehouses[g.창고코드] ? warehouses[g.창고코드]['창고명'] : g.창고코드,
      상품코드: g.상품코드, 상품명: skuMeta.상품명 || '', 구분: skuMeta.구분 || '상제품',
      monthly: g.monthly,
    };
  });

  return { rows: rows, months: result.months, fxIssues: result.fxIssues };
}

/** §07 재고금액 검증 — 통화별 소계 + 창고별 소계, 요청한 연월 기준. */
function getStockValueCheck_(ym) {
  var view = getLedgerView_({ entityCode: 'ALL', warehouseCode: 'ALL', toYm: ym });
  var byWarehouseCcy = {}; // "창고코드|통화" -> amount
  var byCcy = {};
  view.rows.forEach(function (r) {
    var m = r.monthly[ym];
    if (!m) return;
    var wKey = r.창고코드 + '|' + m.통화코드;
    byWarehouseCcy[wKey] = (byWarehouseCcy[wKey] || 0) + m.기말금액;
    byCcy[m.통화코드] = (byCcy[m.통화코드] || 0) + m.기말금액;
  });

  var warehouseRows = Object.keys(byWarehouseCcy).map(function (k) {
    var parts = k.split('|');
    return { 창고코드: parts[0], 통화코드: parts[1], 금액: byWarehouseCcy[k] };
  });
  var currencyTotals = Object.keys(byCcy).map(function (c) { return { 통화코드: c, 금액: byCcy[c] }; });

  var krwTotal = 0, krwOk = true;
  currencyTotals.forEach(function (c) {
    var rate = fxRateToKrw_(c.통화코드);
    if (!rate) { krwOk = false; return; }
    krwTotal += c.금액 * rate;
  });

  return {
    연월: ym, 창고별: warehouseRows, 통화별합계: currencyTotals,
    전체KRW환산: krwOk ? krwTotal : null, fx경고: view.fxIssues,
  };
}
