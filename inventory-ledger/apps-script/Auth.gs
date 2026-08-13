/**
 * 관리자 인증 — 공유 비밀번호 방식.
 * 비밀번호는 스크립트 속성(서버쪽)에만 저장한다. 로그인 성공 시 임시 토큰을 발급하고,
 * 이후 입력/수정 요청은 그 토큰을 함께 보내야 한다. 토큰은 CacheService에 12시간 보관.
 */

var ADMIN_TOKEN_TTL_SEC = 12 * 60 * 60; // 12시간

function adminLogin_(password) {
  var real = getScriptProp_('ADMIN_PASSWORD');
  if (!real) {
    throw new Error('관리자 비밀번호가 아직 설정되지 않았습니다. 스프레드시트 메뉴에서 먼저 설정해주세요.');
  }
  if (String(password) !== String(real)) {
    throw new Error('비밀번호가 일치하지 않습니다.');
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('admintok_' + token, 'ok', ADMIN_TOKEN_TTL_SEC);
  return { token: token, expiresInSec: ADMIN_TOKEN_TTL_SEC };
}

function isAdminToken_(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get('admintok_' + token) === 'ok';
}

function requireAdmin_(token) {
  if (!isAdminToken_(token)) {
    throw new Error('관리자 인증이 필요합니다. 다시 로그인해주세요.');
  }
}
