// NAS outbox 스모크 테스트 — node scripts/test-nas-outbox.mjs
// nasOutbox.ts + nasData.ts를 authApi 목으로 치환 로드해 오프라인 유실 방지 계약을 검증한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

class MemoryStorage {
  #values = new Map();
  #failNextSet = false;
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) {
    if (this.#failNextSet) { this.#failNextSet = false; throw new Error('QuotaExceededError'); }
    this.#values.set(key, String(value));
  }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
  failNextSet() { this.#failNextSet = true; }
}

const storage = new MemoryStorage();
globalThis.localStorage = storage;
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

class MockAuthApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
globalThis.__NasTestAuthApiError = MockAuthApiError;

const calls = [];
// failWith: null=성공, 'network'=fetch TypeError 모사, 숫자=해당 status의 AuthApiError
let failWith = null;
globalThis.__nasTestApiRequest = async (path, init = {}) => {
  const method = init.method || 'GET';
  calls.push({ path, method, body: init.body });
  const mode = typeof failWith === 'function' ? failWith(path, method) : failWith;
  if (mode === 'network') throw new TypeError('Failed to fetch');
  if (typeof mode === 'number') throw new MockAuthApiError(`HTTP ${mode}`, mode);
  return path.startsWith('/api/data/') && !init.method ? { rows: [{ id: 'remote' }] } : {};
};

const AUTH_IMPORT = "import { apiRequest, isAuthApiConfigured, AuthApiError } from './authApi';";
const AUTH_MOCK = 'const apiRequest = (...a) => globalThis.__nasTestApiRequest(...a); const isAuthApiConfigured = true; const AuthApiError = globalThis.__NasTestAuthApiError;';

function loadModule(file, replacements) {
  let source = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) {
    assert.ok(source.includes(from), `${file}에 치환 대상이 없음: ${from}`);
    source = source.replace(from, to);
  }
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(out).toString('base64')}`);
}

const outbox = await loadModule('src/lib/nasOutbox.ts', [[AUTH_IMPORT, AUTH_MOCK]]);
globalThis.__nasTestOutbox = outbox;
const nasData = await loadModule('src/lib/nasData.ts', [
  ["import { apiRequest, isAuthApiConfigured } from './authApi';", AUTH_MOCK],
  ["import { enqueueNasMutation, flushNasOutbox } from './nasOutbox';",
   'const { enqueueNasMutation, flushNasOutbox } = globalThis.__nasTestOutbox;'],
]);

localStorage.setItem('troiareuke_auth_user', JSON.stringify({ id: 'u1', branchId: 'branch-a', role: 'admin' }));
const outboxKey = 'troiareuke_nas_outbox_branch-a';
const queueLength = () => JSON.parse(localStorage.getItem(outboxKey) || '[]').length;
const settle = () => new Promise(resolve => setImmediate(resolve));
const silent = async fn => {
  const orig = console.error; console.error = () => {};
  try { return await fn(); } finally { console.error = orig; }
};

// ① 오프라인(네트워크 오류) 실패 → 큐 잔존
failWith = 'network';
await silent(async () => { nasData.nasUpsert('customers', { id: 'c1', name: 'offline change' }); await settle(); });
assert.equal(queueLength(), 1, '오프라인 실패는 outbox에 남아야 한다.');

// ② nasLoad는 대기 변경을 먼저 전송(PUT→GET)하고 성공분을 큐에서 제거
failWith = null;
calls.length = 0;
const rows = await nasData.nasLoad('customers');
assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), ['PUT /api/data/customers', 'GET /api/data/customers'],
  '원격 조회 전에 대기 변경을 먼저 전송해야 한다.');
assert.deepEqual(rows, [{ id: 'remote' }]);
assert.equal(queueLength(), 0, '성공한 변경은 outbox에서 제거해야 한다.');

// ③ 영구 오류(404)는 해당 항목만 폐기하고 다음 항목을 계속 전송 — 큐 봉쇄 없음
failWith = 'network';
await silent(async () => {
  nasData.nasUpdate('customers', 'ghost', { name: 'x' }); await settle();
  nasData.nasUpsert('customers', { id: 'c2' }); await settle();
});
assert.equal(queueLength(), 2);
failWith = (path, method) => (method === 'PATCH' ? 404 : null);
calls.length = 0;
await silent(() => nasData.nasLoad('customers'));
assert.equal(queueLength(), 0, '404 항목은 폐기되고 나머지는 전송되어야 한다.');
assert.ok(calls.some(c => c.method === 'PUT'), '404 뒤의 항목도 전송되어야 한다.');
assert.ok(calls.some(c => c.method === 'GET'), '큐 소진 후 원격 로드가 진행되어야 한다.');

// ④ 일시 오류(5xx)는 큐를 보존하고 nasLoad가 원격을 읽지 않음(GET 미호출) → null 폴백
failWith = 'network';
await silent(async () => { nasData.nasUpsert('customers', { id: 'c3' }); await settle(); });
failWith = 503;
calls.length = 0;
const fallback = await silent(() => nasData.nasLoad('customers'));
assert.equal(fallback, null, '큐 잔존 시 nasLoad는 null(로컬 폴백)이어야 한다.');
assert.ok(!calls.some(c => c.method === 'GET'), '큐가 남아있으면 원격 GET을 호출하면 안 된다.');
assert.equal(queueLength(), 1, '일시 오류는 큐를 보존해야 한다.');
failWith = null;
await outbox.flushNasOutbox();
assert.equal(queueLength(), 0);

// ⑤ nasBulkUpsert는 500행 청크를 순서대로 enqueue (부분 실패 시 재시도 가능)
failWith = 'network';
calls.length = 0;
await silent(async () => { nasData.nasBulkUpsert('customers', Array.from({ length: 1100 }, (_, i) => ({ id: String(i) }))); await settle(); });
assert.equal(queueLength(), 3, '1,100행은 500·500·100 세 청크로 큐에 남아야 한다.');
failWith = null;
await outbox.flushNasOutbox();
assert.equal(queueLength(), 0, '재시도로 모든 청크가 전송되어야 한다.');
const chunkSizes = calls.filter(c => c.method === 'PUT').map(c => JSON.parse(c.body).rows.length);
assert.deepEqual(chunkSizes.slice(-3), [500, 500, 100], '청크 순서·크기가 유지되어야 한다.');

// ⑥ quota 초과 시 throw하지 않고 직접 전송으로 폴백
failWith = null;
calls.length = 0;
storage.failNextSet();
await silent(async () => {
  assert.doesNotThrow(() => nasData.nasUpsert('customers', { id: 'c4' }), 'quota 실패가 UI로 던져지면 안 된다.');
  await settle();
});
assert.equal(queueLength(), 0, 'quota 폴백은 큐에 남기지 않는다.');
assert.ok(calls.some(c => c.method === 'PUT'), 'quota 폴백은 직접 전송해야 한다.');

console.log('NAS outbox tests: 6/6 OK');
