// 서버 입력 검증 테스트 (225, GAP Q-3) — 의존성 0, node 내장 러너.
//   node --test server/src        (= npm run test:server, release:checks 에 포함)
// 여기 있는 함수들이 가입·데이터 저장·어드민 라우트의 1차 방어선이라, 회귀가 생기면 조용히 잘못된 값이 DB 에 들어간다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TEXT_LENGTH, MAX_ID_LENGTH,
  maskEmail, normalizeEmail, isEmail, isStrongPassword, isUuid, isValidId, isValidBranchId, isValidText,
  FLAG_SCOPE_RE, FLAG_KEY_RE, validateFlagsInput,
} from './validate.js';

test('normalizeEmail — 공백 제거·소문자', () => {
  assert.equal(normalizeEmail('  Owner@Shop.KR '), 'owner@shop.kr');
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(123), '123');
});

test('isEmail — @ 와 점이 있는 형태만', () => {
  assert.ok(isEmail('owner@shop.kr'));
  assert.ok(!isEmail('owner@shop'));          // 점 없음
  assert.ok(!isEmail('owner shop@x.kr'));     // 공백
  assert.ok(!isEmail('@x.kr'));
  assert.ok(!isEmail(''));
});

test('isStrongPassword — 8~128자', () => {
  assert.ok(isStrongPassword('12345678'));
  assert.ok(!isStrongPassword('1234567'));
  assert.ok(isStrongPassword('a'.repeat(128)));
  assert.ok(!isStrongPassword('a'.repeat(129)));
  assert.ok(!isStrongPassword(12345678));     // 문자열만
});

test('isUuid — v1~v8, 대소문자 무관', () => {
  assert.ok(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301'));
  assert.ok(isUuid('3F2504E0-4F89-41D3-9A0C-0305E82C3301'));
  assert.ok(!isUuid('3f2504e0-4f89-01d3-9a0c-0305e82c3301')); // 버전 0
  assert.ok(!isUuid('not-a-uuid'));
  assert.ok(!isUuid(undefined));
});

test('isValidId — 빈 값·공백만·길이 초과 거부', () => {
  assert.ok(isValidId('cust_1'));
  assert.ok(!isValidId('   '));
  assert.ok(!isValidId(''));
  assert.ok(!isValidId(undefined));
  assert.ok(isValidId('a'.repeat(MAX_ID_LENGTH)));
  assert.ok(!isValidId('a'.repeat(MAX_ID_LENGTH + 1)));
});

test('isValidBranchId — 영숫자와 . _ : - 만', () => {
  assert.ok(isValidBranchId('arche-spa'));
  assert.ok(isValidBranchId('branch_1.2:3'));
  assert.ok(!isValidBranchId('지점1'));        // 한글 불가(스코프 키로 쓰인다)
  assert.ok(!isValidBranchId('a b'));
  assert.ok(!isValidBranchId(''));
});

test('isValidText — required·최대 길이·깨진 인코딩 문자 거부', () => {
  assert.ok(isValidText(undefined));                       // 선택 입력
  assert.ok(!isValidText(undefined, { required: true }));
  assert.ok(!isValidText(null, { required: true }));
  assert.ok(isValidText(''));                              // 선택 입력의 빈 문자열
  assert.ok(!isValidText('', { required: true }));
  assert.ok(!isValidText('   ', { required: true }));      // 공백만
  assert.ok(isValidText('메모'));
  assert.ok(!isValidText(123));                            // 문자열만
  assert.ok(isValidText('a'.repeat(MAX_TEXT_LENGTH)));
  assert.ok(!isValidText('a'.repeat(MAX_TEXT_LENGTH + 1)));
  assert.ok(!isValidText('a'.repeat(21), { max: 20 }));
  assert.ok(!isValidText('깨진�입력'));                // CP949 클라이언트 흔적 (2026-09-22 실측)
});

test('maskEmail — 앞 두 글자만 남긴다', () => {
  assert.equal(maskEmail('owner@shop.kr'), 'ow***@shop.kr');
  assert.equal(maskEmail('a@shop.kr'), 'a***@shop.kr');
  assert.equal(maskEmail('not-an-email'), 'not-an-email');  // @ 없으면 그대로
  assert.equal(maskEmail(''), null);
  assert.equal(maskEmail(undefined), null);
});

test('FLAG_SCOPE_RE — global·지점 id 만, 한글·공백·64자 초과 거부 (226)', () => {
  assert.ok(FLAG_SCOPE_RE.test('global'));
  assert.ok(FLAG_SCOPE_RE.test('arche-spa'));
  assert.ok(FLAG_SCOPE_RE.test('branch_1:2'));
  assert.ok(!FLAG_SCOPE_RE.test('지점1'));
  assert.ok(!FLAG_SCOPE_RE.test('a b'));
  assert.ok(!FLAG_SCOPE_RE.test(''));
  assert.ok(!FLAG_SCOPE_RE.test('a'.repeat(65)));
});

test('FLAG_KEY_RE — 기능 id 는 영숫자와 . _ - 만 (226)', () => {
  assert.ok(FLAG_KEY_RE.test('module.aiChat'));
  assert.ok(FLAG_KEY_RE.test('beacon_consultation'));
  assert.ok(!FLAG_KEY_RE.test('module aiChat'));
  assert.ok(!FLAG_KEY_RE.test('모듈'));
  assert.ok(!FLAG_KEY_RE.test(''));
});

test('validateFlagsInput — boolean 만 받고, 모양이 틀리면 사유를 돌려준다 (226)', () => {
  assert.deepEqual(validateFlagsInput({ flags: { 'module.sales': true, 'module.aiChat': false } }).value,
    { 'module.sales': true, 'module.aiChat': false });
  assert.deepEqual(validateFlagsInput({ flags: {} }).value, {}); // 빈 객체는 "오버라이드 없음"
  assert.match(validateFlagsInput({}).error, /flags 객체/);
  assert.match(validateFlagsInput({ flags: null }).error, /flags 객체/);
  assert.match(validateFlagsInput({ flags: [] }).error, /flags 객체/);       // 배열 거부
  assert.match(validateFlagsInput({ flags: { 'module.sales': 'true' } }).error, /true\/false/); // 문자열 거부
  assert.match(validateFlagsInput({ flags: { 'module.sales': 1 } }).error, /true\/false/);
  // 219 가 타임스탬프를 flags 에 섞지 않고 별도 컬럼을 쓴 이유 — 여기서 막힌다
  assert.match(validateFlagsInput({ flags: { appLockResetAt: '2026-11-25T00:00:00.000Z' } }).error, /true\/false/);
  assert.match(validateFlagsInput({ flags: { '나쁜 키': true } }).error, /기능 id 형식/);
  const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['k' + i, true]));
  assert.match(validateFlagsInput({ flags: many }).error, /너무 많습니다/);
});
