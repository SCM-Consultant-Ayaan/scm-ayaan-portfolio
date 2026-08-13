/**
 * 업로드 열 매핑 프로필 CRUD.
 *
 * 실제 파싱·열 지정 UI는 프론트에서 처리한다(SheetJS로 파일을 읽고, 사용자가 열마다
 * 필드를 지정). 여기서는 그 결과(거래유형 + 매핑이름 + 헤더행 + 필드->열문자 매핑)를
 * 저장하고 불러오는 역할만 한다 — 같은 이름으로 다시 저장하면 갱신, 아니면 새로 생성.
 */

function listUploadMaps_(txType) {
  var rows = readAllRows_(TABS.UPLOAD_MAP);
  if (txType) rows = rows.filter(function (r) { return r['거래유형'] === txType; });
  return rows.map(function (r) {
    var mapping = {};
    try { mapping = JSON.parse(r['매핑JSON'] || '{}'); } catch (e) { mapping = {}; }
    return { id: r['id'], 거래유형: r['거래유형'], 매핑이름: r['매핑이름'], 헤더행: Number(r['헤더행']) || 1, 매핑: mapping };
  });
}

function upsertUploadMap_(payload, user) {
  if (!payload['거래유형'] || !String(payload['매핑이름'] || '').trim()) {
    throw new Error('거래유형과 매핑이름은 필수입니다.');
  }
  var headers = HEADERS[TABS.UPLOAD_MAP];
  var rows = readAllRows_(TABS.UPLOAD_MAP);
  var name = String(payload['매핑이름']).trim();
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['거래유형']) === String(payload['거래유형']) && String(rows[i]['매핑이름']) === name) { found = rows[i]; break; }
  }
  var id = found ? found['id'] : newId_();
  var obj = {
    id: id, 거래유형: payload['거래유형'], 매핑이름: name,
    헤더행: Number(payload['헤더행']) || 1, 매핑JSON: JSON.stringify(payload['매핑'] || {}),
    updatedAt: nowIso_(), updatedBy: user || 'admin',
  };
  var updated = updateRowById_(TABS.UPLOAD_MAP, headers, id, obj);
  if (!updated) appendRowByHeaders_(TABS.UPLOAD_MAP, headers, obj);
  return { id: id, 거래유형: obj['거래유형'], 매핑이름: obj['매핑이름'], 헤더행: obj['헤더행'], 매핑: payload['매핑'] || {} };
}

function deleteUploadMap_(id) {
  var ok = deleteRowById_(TABS.UPLOAD_MAP, HEADERS[TABS.UPLOAD_MAP], id);
  if (!ok) throw new Error('매핑을 찾을 수 없습니다.');
  return { deleted: true };
}
