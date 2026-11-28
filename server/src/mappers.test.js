// 계정 응답 매퍼 테스트 (227, GAP Q-3) — node --test server/src/mappers.test.js
// 기본값이 바뀌면 지점 앱의 권한·사용기간 표시가 조용히 달라지므로 폴백을 못으로 박는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { publicUser } from './mappers.js';

const row = (over = {}) => ({
  id: 'u1', email: 'owner@shop.kr', name: '원장',
  trial_ends_at: '2026-12-31T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

test('publicUser — 역할 폴백은 staff(관리자 권한을 선물하지 않는다)', () => {
  assert.equal(publicUser(row()).role, 'staff');            // role 없으면 가장 좁은 권한
  assert.equal(publicUser(row({ role: 'admin' })).role, 'admin');
  assert.equal(publicUser(row({ role: 'superadmin' })).role, 'superadmin');
});

test('publicUser — 상태·활성 폴백', () => {
  assert.equal(publicUser(row()).status, 'approved');        // 옛 행(status 없음)은 이미 승인된 계정
  assert.equal(publicUser(row({ status: 'pending' })).status, 'pending');
  assert.equal(publicUser(row()).isActive, true);            // is_active 없으면 활성
  assert.equal(publicUser(row({ is_active: false })).isActive, false);
  assert.equal(publicUser(row({ is_active: null })).isActive, true); // null 은 "아직 안 정함" → 활성
  assert.equal(publicUser(row()).mustChangePassword, false); // true 일 때만 강제
  assert.equal(publicUser(row({ must_change_password: true })).mustChangePassword, true);
});

test('publicUser — 비어 있는 문자열·undefined 구분', () => {
  const u = publicUser(row());
  assert.equal(u.shopName, '');       // 화면에서 바로 쓰도록 빈 문자열
  assert.equal(u.shopType, '');
  assert.equal(u.phone, undefined);   // 없는 값은 undefined(키 자체를 비운다)
  assert.equal(u.branchId, undefined);
  assert.equal(u.plan, 'trial');      // 요금제 폴백
});

test('publicUser — 날짜: NOT NULL 컬럼은 ISO, nullable 은 null', () => {
  const u = publicUser(row({ service_ends_at: '2027-01-31T00:00:00.000Z', last_seen_at: '2026-11-25T10:00:00.000Z' }));
  assert.equal(u.trialEndsAt, '2026-12-31T00:00:00.000Z');
  assert.equal(u.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(u.serviceEndsAt, '2027-01-31T00:00:00.000Z');
  assert.equal(u.lastSeenAt, '2026-11-25T10:00:00.000Z');
  const bare = publicUser(row());
  assert.equal(bare.serviceEndsAt, null);  // 사용기간 미설정
  assert.equal(bare.lastSeenAt, null);     // 아직 접속 기록 없음
});

test('publicUser — 날짜: pg 가 돌려주는 Date 객체도 같은 ISO 로 (229 리뷰 L-2)', () => {
  // 운영에서 pg 는 timestamptz 를 JS Date 로 돌려준다 — 문자열만 테스트하면 그 경로가 비어 있다
  const u = publicUser(row({
    trial_ends_at: new Date('2026-12-31T00:00:00.000Z'),
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    service_ends_at: new Date('2027-01-31T00:00:00.000Z'),
    last_seen_at: new Date('2026-11-25T10:00:00.000Z'),
  }));
  assert.equal(u.trialEndsAt, '2026-12-31T00:00:00.000Z');
  assert.equal(u.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(u.serviceEndsAt, '2027-01-31T00:00:00.000Z');
  assert.equal(u.lastSeenAt, '2026-11-25T10:00:00.000Z');
});

test('publicUser — 버전 텔레메트리 폴백(구버전 지점을 본사가 찾는 근거)', () => {
  assert.equal(publicUser(row()).lastAppVersion, null);
  assert.equal(publicUser(row({ last_app_version: '1.0.63', last_app_mode: 'nas' })).lastAppVersion, '1.0.63');
  assert.equal(publicUser(row({ last_app_version: '1.0.63', last_app_mode: 'nas' })).lastAppMode, 'nas');
});

test('publicUser — 비밀번호 해시 같은 내부 값은 내보내지 않는다', () => {
  const u = publicUser(row({ password_hash: 'secret-hash', reject_reason: null }));
  assert.equal('password_hash' in u, false);
  assert.equal('passwordHash' in u, false);
  assert.equal(u.rejectReason, null);
});
