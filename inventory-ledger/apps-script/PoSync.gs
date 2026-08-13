/**
 * 발주내역_관리시트 연동 (읽기 전용).
 *
 * 중요: 원본은 "발주내역" 탭이 아니라 "입고내역" 탭이다 — 실제로 어느 창고에 며칠에
 * 얼마나 들어왔는지는 입고내역에만 있다(설계 문서 §09 FINDING 참고). 발주내역 탭은
 * 건드리지 않는다.
 *
 * 마감여부가 "마감"인 행만 가져온다 — 검수결과가 아직 입력되지 않은 분할입고 행은
 * 다음 동기화 때 자동으로 포함된다.
 */

/**
 * 요청 1건 동안은 메모리에, 그 이후에는 CacheService에 2분간 캐시한다 — 외부
 * 스프레드시트를 매번 새로 여는 게 눈에 띄게 느리기 때문이다. 발주내역_관리시트를
 * 방금 고쳤는데 바로 반영하고 싶으면 설정 화면의 "캐시 지우기"를 쓰면 된다.
 */
var _poRowsCache = null;
var PO_CACHE_KEY_ = 'poInboundCacheV1';
var PO_CACHE_TTL_SEC_ = 120;

function fetchPurchaseInbound_() {
  if (_poRowsCache) return _poRowsCache;
  _poRowsCache = cachedJson_(PO_CACHE_KEY_, PO_CACHE_TTL_SEC_, fetchPurchaseInboundLive_);
  return _poRowsCache;
}

function fetchPurchaseInboundLive_() {
  var cfg = linkConfigMap_();
  var ssid = cfg['PO_SSID'];
  if (!ssid) throw new Error('[연동설정] 탭의 PO_SSID 값이 비어있습니다. 발주내역_관리시트 ID를 채워주세요.');
  var tabName = cfg['PO_TAB'] || '입고내역';
  var colDate = cfg['PO_COL_입고일'] || '입고일';
  var colCode = cfg['PO_COL_상품코드'] || '품목코드';
  var colQty = cfg['PO_COL_정상입고수량'] || '정상입고수량';
  var colPrice = cfg['PO_COL_발주단가'] || '발주단가';
  var colWarehouse = cfg['PO_COL_입고창고'] || '입고창고';
  var colClosed = cfg['PO_COL_마감여부'] || '마감여부';
  var colCurrency = cfg['PO_통화_열']; // 없을 수 있음

  var ss = SpreadsheetApp.openById(ssid);
  var sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error('발주내역_관리시트에서 탭을 찾을 수 없습니다: ' + tabName);

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var idx = {
    date: headers.indexOf(colDate),
    code: headers.indexOf(colCode),
    qty: headers.indexOf(colQty),
    price: headers.indexOf(colPrice),
    warehouse: headers.indexOf(colWarehouse),
    closed: headers.indexOf(colClosed),
    currency: colCurrency ? headers.indexOf(colCurrency) : -1,
  };
  ['date', 'code', 'qty', 'price', 'warehouse', 'closed'].forEach(function (k) {
    if (idx[k] === -1) throw new Error('입고내역 탭에서 헤더를 찾을 수 없습니다: ' + cfg['PO_COL_' + k]);
  });

  var out = [];
  if (lastRow >= 2) {
    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    values.forEach(function (row) {
      if (String(row[idx.closed]).trim() !== '마감') return;
      var code = String(row[idx.code] || '').trim();
      if (!code) return;
      var warehouseName = String(row[idx.warehouse] || '').trim();
      if (!warehouseName) return;
      var qty = Number(row[idx.qty]) || 0;
      if (qty <= 0) return;
      var currency = idx.currency !== -1 ? String(row[idx.currency] || 'KRW').trim() : 'KRW';
      var wh = ensureWarehouseExists_(warehouseName);
      var sku = skuInfo_(code);
      out.push({
        일자: row[idx.date],
        연월: toYm_(row[idx.date]),
        상품코드: code,
        법인코드: sku ? sku.법인코드 : null,
        창고코드: wh['창고코드'],
        수량: qty,
        단가: Number(row[idx.price]) || 0,
        발주통화: currency,
        통화불일치: currency !== 'KRW',
      });
    });
  }
  return out;
}

/** 대시보드 상단 경고용 — 법인 매핑 실패 / 외화 발주 건을 모아서 반환. */
function poSyncWarnings_() {
  var rows = fetchPurchaseInbound_();
  var noEntity = rows.filter(function (r) { return !r.법인코드; });
  var fx = rows.filter(function (r) { return r.통화불일치; });
  return { 법인미매핑건수: noEntity.length, 외화입고건수: fx.length, 외화입고목록: fx.slice(0, 50) };
}
