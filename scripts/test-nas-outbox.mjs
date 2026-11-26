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
// failWith: null=성공, 'network'=fetch TypeError 모사, 숫자=해당 status의 AuthApiError,
//           'lost'=**서버는 기록했는데 응답이 끊긴 경우**(302, 재전송 멱등성 ⑩~⑫)
let failWith = null;
// 302(GAP P-4): 서버 쪽 행을 흉내 내는 저장소 — PUT 은 (collection,id) 로 덮어쓰고(upsert) PATCH 는 칸을 합친다.
// **이 모양이 실제 SQL 과 같다는 것**은 server/src/dataRouteIdempotency.test.js 가 배포 코드를 읽어 지킨다
// (`ON CONFLICT (branch_id, collection, id) DO UPDATE`·`data || $1::jsonb`). 여기서는 클라이언트 쪽 절반,
// "재전송이 **같은 id** 로 가서 행이 늘지 않는다" 를 본다. store=null 이면 ①~⑨ 의 옛 동작 그대로.
let store = null;
const storeKey = (collection, id) => `${collection}:${id}`;
function applyToStore(path, method, body) {
  const m = /^\/api\/data\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (!m) return;
  const [, collection, id] = m;
  const parsed = body ? JSON.parse(body) : {};
  if (method === 'PUT') for (const row of parsed.rows || []) store.set(storeKey(collection, row.id), { ...row });
  if (method === 'PATCH' && store.has(storeKey(collection, id))) {
    store.set(storeKey(collection, id), { ...store.get(storeKey(collection, id)), ...parsed.updates });
  }
}
globalThis.__nasTestApiRequest = async (path, init = {}) => {
  const method = init.method || 'GET';
  calls.push({ path, method, body: init.body });
  const mode = typeof failWith === 'function' ? failWith(path, method) : failWith;
  if (store && (mode === null || mode === 'lost')) applyToStore(path, method, init.body);
  if (mode === 'lost') throw new TypeError('Failed to fetch'); // 서버에는 남았고 클라이언트만 모른다
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

// ⑦ 일시 오류(5xx·네트워크)는 transient 이벤트로 알린다 — 전에는 무음이라 배너가 "대기 중"만 보였다 (16차 #M7)
const events = [];
globalThis.window.dispatchEvent = e => { events.push(e); };
failWith = 503;
calls.length = 0;
await silent(async () => { nasData.nasUpsert('customers', { id: 'c7' }); await settle(); });
const transient = events.find(e => e.type === 'crm:nas-outbox-error' && e.detail?.transient);
assert.ok(transient, '5xx 는 transient 이벤트를 보내야 한다.');
assert.equal(transient.detail.status, 503);
assert.ok(typeof transient.detail.since === 'string' && transient.detail.since.length > 0, 'since(가장 오래된 대기 항목 시각)를 실어야 한다.');
assert.equal(queueLength(), 1, '일시 오류는 큐를 보존한다.');
events.length = 0;
failWith = 401;
await silent(() => outbox.flushNasOutbox().catch(() => {})); // 401 은 reject(큐 보존)
assert.ok(events.some(e => e.detail?.auth && e.detail.status === 401), '401 은 auth 이벤트에 status 를 싣는다.');
assert.ok(!events.some(e => e.detail?.transient), '401 은 transient 로 중복 보고하지 않는다.');
failWith = null;
await outbox.flushNasOutbox();
assert.equal(queueLength(), 0);

// ⑧ 거부분 [다시 시도]는 큐 앞(원래 순서)으로 — 뒤에 넣으면 그 사이의 같은 기록 PATCH 뒤에 옛 PUT 이 가서 덮었다 (16차 #L4)
localStorage.removeItem('troiareuke_nas_outbox_rejected_branch-a');
failWith = (path, method) => (method === 'PUT' ? 400 : null);
await silent(async () => { nasData.nasUpsert('customers', { id: 'c8', name: '옛 이름' }); await settle(); });
assert.equal(outbox.listRejectedNasOutbox().length, 1, 'PUT 400 은 거부 목록으로 간다.');
failWith = 'network';
await silent(async () => { nasData.nasUpdate('customers', 'c8', { name: '새 이름' }); await settle(); });
assert.equal(queueLength(), 1, 'PATCH 는 큐에 남는다.');
failWith = null;
calls.length = 0;
assert.equal(outbox.retryRejectedNasOutbox(), 1);
await settle();
await outbox.flushNasOutbox();
const order = calls.filter(c => c.path.includes('customers')).map(c => c.method);
assert.deepEqual(order.slice(0, 2), ['PUT', 'PATCH'], '거부됐던 PUT 이 나중 PATCH 보다 먼저 가야 새 이름이 남는다.');
assert.equal(queueLength(), 0);

// ⑨ 동기화 시각은 실제 전송 성공 때만 — 영구 거부(400)로 치워 큐가 빈 경우는 "동기화됨"이 아니다 (127~130 리뷰 #L2)
localStorage.removeItem('troiareuke_nas_outbox_rejected_branch-a');
localStorage.setItem('crm_last_sync_at', '1');
failWith = 400;
await silent(async () => { nasData.nasUpsert('customers', { id: 'c9' }); await settle(); });
assert.equal(queueLength(), 0);
assert.equal(localStorage.getItem('crm_last_sync_at'), '1', '거부로 비운 큐는 동기화 시각을 갱신하면 안 된다.');
failWith = null;
await silent(async () => { nasData.nasUpsert('customers', { id: 'c10' }); await settle(); });
await outbox.flushNasOutbox();
assert.notEqual(localStorage.getItem('crm_last_sync_at'), '1', '실제 전송 성공은 동기화 시각을 갱신한다.');

// ⑩ 응답이 끊긴 PUT 의 재전송은 **같은 id** 로 간다 — 오프라인에서 받은 결제가 두 건이 되지 않는다 (302, GAP P-4)
store = new Map();
localStorage.removeItem(outboxKey);
failWith = 'lost';
calls.length = 0;
await silent(async () => { nasData.nasUpsert('payments', { id: 'pay-1', amount: 50000 }); await settle(); });
assert.equal(store.size, 1, '서버는 받아서 기록했다(응답만 끊겼다).');
assert.equal(queueLength(), 1, '클라이언트는 성공을 못 봤으니 대기분으로 남긴다.');
failWith = null;
await outbox.flushNasOutbox();
assert.equal(queueLength(), 0);
const resentIds = calls.filter(c => c.method === 'PUT').map(c => JSON.parse(c.body).rows[0].id);
assert.deepEqual(resentIds, ['pay-1', 'pay-1'], '재전송이 새 id 를 만들면 그것이 곧 중복 결제다.');
assert.equal(store.size, 1, '재전송해도 결제는 한 건이어야 한다.');
assert.deepEqual([...store.values()], [{ id: 'pay-1', amount: 50000 }]);

// ⑪ PATCH 재전송도 결과가 같다 — 칸 합치기는 몇 번 보내도 같은 값이다
failWith = 'lost';
await silent(async () => { nasData.nasUpdate('payments', 'pay-1', { method: '카드' }); await settle(); });
assert.deepEqual(store.get('payments:pay-1'), { id: 'pay-1', amount: 50000, method: '카드' });
assert.equal(queueLength(), 1);
failWith = null;
await outbox.flushNasOutbox();
assert.deepEqual(store.get('payments:pay-1'), { id: 'pay-1', amount: 50000, method: '카드' },
  'PATCH 재전송은 같은 결과여야 한다(금액을 더하는 식이면 두 번 더해진다).');
assert.equal(queueLength(), 0);

// ⑫ **한계를 그대로 적어 둔다**: 멱등성은 "행이 늘지 않는다" 까지다. 응답이 끊긴 PUT 을 다시 보내는 사이
//    다른 기기가 그 행을 바꿨다면 재전송이 그 변경을 **되돌린다**(last-writer-wins, GAP Q-1).
//    고치려면 서버 쪽 버전 비교가 필요해 지금 구조에서는 할 수 없다 — 사실을 시험으로 고정해 둔다.
failWith = 'lost';
await silent(async () => { nasData.nasUpsert('payments', { id: 'pay-2', amount: 10000 }); await settle(); });
store.set('payments:pay-2', { id: 'pay-2', amount: 10000, memo: '다른 기기가 적은 메모' });
failWith = null;
await outbox.flushNasOutbox();
assert.deepEqual(store.get('payments:pay-2'), { id: 'pay-2', amount: 10000 },
  '지금 동작: 재전송이 그 사이 다른 기기의 변경을 되돌린다(GAP Q-1).');
assert.equal(queueLength(), 0);
store = null;

console.log('NAS outbox tests: 12/12 OK');
