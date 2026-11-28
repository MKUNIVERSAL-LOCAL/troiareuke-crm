// 서버 코드 지문 테스트 (229, 리뷰 H-1)
// 지문이 흔들리면 배포 확인이 거짓 경보를 내고, 테스트 파일에 반응하면 배포본(테스트 제외)과 영원히 어긋난다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeCodeHash, CODE_HASH } from './buildInfo.js';

function dirWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'codehash-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

test('코드 지문 — 같은 내용이면 같은 값, 12자 16진수', () => {
  const a = dirWith({ 'server.js': 'export const x = 1;\n' });
  const b = dirWith({ 'server.js': 'export const x = 1;\n' });
  try {
    assert.match(computeCodeHash(a), /^[0-9a-f]{12}$/);
    assert.equal(computeCodeHash(a), computeCodeHash(b));
  } finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
});

test('코드 지문 — 줄바꿈(CRLF/LF)에는 반응하지 않는다(Windows 작업 사본 = NAS 배포본)', () => {
  const lf = dirWith({ 'server.js': 'const a = 1;\nconst b = 2;\n' });
  const crlf = dirWith({ 'server.js': 'const a = 1;\r\nconst b = 2;\r\n' });
  try {
    assert.equal(computeCodeHash(lf), computeCodeHash(crlf));
  } finally { rmSync(lf, { recursive: true, force: true }); rmSync(crlf, { recursive: true, force: true }); }
});

test('코드 지문 — 실행 코드가 바뀌면 달라지고, 테스트 파일은 세지 않는다(배포본에는 테스트가 없다)', () => {
  const base = dirWith({ 'server.js': 'const a = 1;\n' });
  const changed = dirWith({ 'server.js': 'const a = 2;\n' });
  const withTest = dirWith({ 'server.js': 'const a = 1;\n', 'server.test.js': 'test stuff\n' });
  try {
    assert.notEqual(computeCodeHash(base), computeCodeHash(changed));
    assert.equal(computeCodeHash(base), computeCodeHash(withTest));
  } finally { for (const d of [base, changed, withTest]) rmSync(d, { recursive: true, force: true }); }
});

test('코드 지문 — 파일 이름도 센다(내용만 옮겨 담아도 달라진다)', () => {
  const one = dirWith({ 'a.js': 'x\n' });
  const two = dirWith({ 'b.js': 'x\n' });
  try {
    assert.notEqual(computeCodeHash(one), computeCodeHash(two));
  } finally { rmSync(one, { recursive: true, force: true }); rmSync(two, { recursive: true, force: true }); }
});

test('CODE_HASH — 이 저장소의 server/src 지문이 모듈 로드 시 계산된다', () => {
  assert.match(CODE_HASH, /^[0-9a-f]{12}$/);
});
