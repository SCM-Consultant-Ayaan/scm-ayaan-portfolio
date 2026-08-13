/**
 * SKU 매핑 시트 연동 (읽기 전용, 외부 스프레드시트).
 *
 * 어떤 열이 상품코드/상품명/소유법인/구분인지는 [연동설정] 탭에 "헤더 이름"으로
 * 저장되어 있다 — 실제 시트에서 그 헤더 텍스트를 찾아 열 위치를 알아낸다. 즉 원본
 * 시트의 열 순서가 바뀌어도 헤더 텍스트만 같으면 그대로 동작한다.
 *
 * 소유법인 열의 값(예: "아이리스브라이트")은 법인마스터의 법인명과 대조해서
 * 법인코드로 변환한다. 대조에 실패하면 미매핑으로 표시하고 넘어간다(조용히 누락시키지 않음).
 */

function linkConfigMap_() {
  var rows = readAllRows_(TABS.LINK_CONFIG);
  var map = {};
  rows.forEach(function (r) { map[r['항목']] = r['값']; });
  return map;
}

/**
 * 요청 1건(=스크립트 실행 1회) 동안은 메모리에, 그 이후에는 CacheService에 3분간
 * 캐시한다 — 외부 스프레드시트를 매번 새로 여는 게 눈에 띄게 느리기 때문이다. SKU
 * 매핑 시트를 방금 고쳤는데 바로 반영하고 싶으면 설정 화면의 "캐시 지우기"를 쓰면 된다.
 */
var _skuMapCache = null;
var SKU_MAP_CACHE_KEY_ = 'skuMapCacheV1';
var SKU_MAP_CACHE_TTL_SEC_ = 180;

function getSkuMap_() {
  if (_skuMapCache) return _skuMapCache;
  _skuMapCache = cachedJson_(SKU_MAP_CACHE_KEY_, SKU_MAP_CACHE_TTL_SEC_, fetchSkuMapLive_);
  return _skuMapCache;
}

function fetchSkuMapLive_() {
  var cfg = linkConfigMap_();
  var ssid = cfg['SKU_SSID'];
  if (!ssid) throw new Error('[연동설정] 탭의 SKU_SSID 값이 비어있습니다. SKU 매핑 시트 ID를 채워주세요.');
  var tabName = cfg['SKU_TAB'] || 'SKU Master';
  var colCode = cfg['SKU_COL_상품코드'] || '상품코드';
  var colName = cfg['SKU_COL_상품명'] || '국문명';
  var colOwner = cfg['SKU_COL_소유법인'] || '법인명';
  var colKind = cfg['SKU_COL_구분']; // 없을 수 있음

  var ss = SpreadsheetApp.openById(ssid);
  var sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error('SKU 매핑 시트에서 탭을 찾을 수 없습니다: ' + tabName);

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var idxCode = headers.indexOf(colCode);
  var idxName = headers.indexOf(colName);
  var idxOwner = headers.indexOf(colOwner);
  var idxKind = colKind ? headers.indexOf(colKind) : -1;
  if (idxCode === -1) throw new Error('SKU 매핑 시트에서 "' + colCode + '" 헤더를 찾을 수 없습니다.');

  var entities = listEntities_();
  var byName = {};
  entities.forEach(function (e) { byName[e['법인명']] = e['법인코드']; byName[e['법인코드']] = e['법인코드']; });

  var map = {};
  var unmapped = [];
  if (lastRow >= 2) {
    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    values.forEach(function (row) {
      var code = String(row[idxCode] || '').trim();
      if (!code) return;
      var ownerRaw = idxOwner !== -1 ? String(row[idxOwner] || '').trim() : '';
      var entityCode = ownerRaw && byName[ownerRaw] ? byName[ownerRaw] : null;
      if (ownerRaw && !entityCode) unmapped.push({ 상품코드: code, 원본소유법인값: ownerRaw });
      map[code] = {
        상품코드: code,
        상품명: idxName !== -1 ? row[idxName] : '',
        소유법인원본값: ownerRaw,
        법인코드: entityCode,
        구분: idxKind !== -1 ? (row[idxKind] || '상제품') : '상제품',
      };
    });
  }
  return { map: map, unmapped: unmapped };
}

function skuInfo_(code) {
  var data = getSkuMap_();
  return data.map[code] || null;
}

function listUnmappedSkuOwners_() {
  return getSkuMap_().unmapped;
}
