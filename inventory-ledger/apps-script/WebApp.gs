/**
 * doGet / doPost 라우팅. 프론트(정적 HTML/JS, 다른 도메인)에서 fetch로 호출한다.
 *
 * CORS 프리플라이트를 피하려고 POST 바디는 항상 text/plain 으로 보낸 JSON 문자열을
 * 기대한다 (프론트에서 fetch(..., {headers:{'Content-Type':'text/plain;charset=utf-8'}})
 * 로 보내면 브라우저가 preflight을 안 붙인다). 응답은 항상 JSON, 항상 HTTP 200이며
 * 성공 여부는 바디의 ok 필드로 판단한다.
 */

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function okOut_(data) {
  return jsonOut_({ ok: true, data: data });
}

function errOut_(err) {
  var msg = err && err.message ? err.message : String(err);
  return jsonOut_({ ok: false, error: msg });
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    var data;
    switch (action) {
      case 'ping':
        data = { pong: true, now: nowIso_() };
        break;
      case 'masters':
        data = { entities: listEntities_(), warehouses: listWarehouses_(), fx: listFx_() };
        break;
      case 'ledger':
        data = getLedgerView_({
          entityCode: e.parameter.entity || 'ALL',
          warehouseCode: e.parameter.warehouse || 'ALL',
          skuCode: e.parameter.sku || '',
          toYm: e.parameter.toYm || '',
        });
        break;
      case 'stockcheck':
        if (!e.parameter.ym) throw new Error('ym 파라미터(YYYY-MM)가 필요합니다.');
        data = getStockValueCheck_(e.parameter.ym);
        break;
      case 'tx':
        var tab = TAB_BY_TXTYPE[e.parameter.type];
        if (!tab) throw new Error('알 수 없는 거래유형입니다: ' + e.parameter.type);
        data = listTx_(tab, {
          법인코드: e.parameter.entity, 창고코드: e.parameter.warehouse, 상품코드: e.parameter.sku,
        });
        break;
      case 'warnings':
        data = { po: poSyncWarnings_(), skuUnmapped: listUnmappedSkuOwners_() };
        break;
      case 'uploads':
        data = listUploadBatches_();
        break;
      case 'skulookup':
        data = skuInfo_(e.parameter.code) || {};
        break;
      default:
        throw new Error('알 수 없는 action입니다: ' + action);
    }
    return okOut_(data);
  } catch (err) {
    return errOut_(err);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var payload = body.payload || {};
    var token = body.token;
    var user = body.user || 'admin';

    if (action === 'login') {
      return okOut_(adminLogin_(payload.password));
    }

    requireAdmin_(token);

    var data;
    switch (action) {
      case 'entity.upsert':
        data = upsertEntity_(payload, user); break;
      case 'entity.deactivate':
        data = { done: deactivateEntity_(payload.법인코드) }; break;
      case 'entity.deleteHard':
        data = { done: deleteEntityHard_(payload.법인코드) }; break;
      case 'warehouse.upsert':
        data = upsertWarehouse_(payload, user); break;
      case 'warehouse.deactivate':
        data = { done: deactivateWarehouse_(payload.창고코드) }; break;
      case 'warehouse.deleteHard':
        data = { done: deleteWarehouseHard_(payload.창고코드) }; break;
      case 'fx.upsert':
        data = upsertFx_(payload, user); break;
      case 'fx.delete':
        data = { done: deleteFx_(payload.통화코드) }; break;
      case 'tx.inbound.create':
        data = createInboundEntry_(payload, user); break;
      case 'tx.out.upsert':
        data = upsertOut_(payload, user); break;
      case 'tx.disposal.upsert':
        data = upsertDisposal_(payload, user); break;
      case 'tx.donation.upsert':
        data = upsertDonation_(payload, user); break;
      case 'tx.interco.upsert':
        data = upsertInterco_(payload, user); break;
      case 'tx.transfer.upsert':
        data = upsertTransfer_(payload, user); break;
      case 'tx.adjust.upsert':
        data = upsertAdjust_(payload, user); break;
      case 'tx.endingActual.upsert':
        data = upsertEndingActual_(payload, user); break;
      case 'tx.delete':
        data = deleteTx_(payload.txType, payload.id); break;
      case 'upload.bulk':
        data = bulkInsertTx_(payload.txType, payload.rows, payload.fileName, user); break;
      case 'upload.delete':
        data = deleteUploadBatch_(payload.배치ID, user); break;
      default:
        throw new Error('알 수 없는 action입니다: ' + action);
    }
    return okOut_(data);
  } catch (err) {
    return errOut_(err);
  }
}
