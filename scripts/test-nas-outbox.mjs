import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };

const source = fs.readFileSync('src/lib/nasData.ts', 'utf8').replace(
  "import { apiRequest, isAuthApiConfigured } from './authApi';",
  'const apiRequest = globalThis.__nasTestApiRequest; const isAuthApiConfigured = true;',
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const calls = [];
let shouldFail = true;
globalThis.__nasTestApiRequest = async (path, init = {}) => {
  calls.push({ path, method: init.method || 'GET', body: init.body });
  if (shouldFail) throw new Error('offline');
  return path.startsWith('/api/data/') && !init.method ? { rows: [{ id: 'remote' }] } : {};
};

localStorage.setItem('troiareuke_auth_user', JSON.stringify({ id: 'u1', branchId: 'branch-a', role: 'admin' }));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
const { nasUpsert, nasLoad, nasBulkUpsert, flushNasOutbox } = await import(moduleUrl);

const originalConsoleError = console.error;
console.error = () => {};
nasUpsert('customers', { id: 'c1', name: 'offline change' });
await new Promise(resolve => setImmediate(resolve));
console.error = originalConsoleError;
const outboxKey = 'troiareuke_nas_outbox_branch-a';
assert.equal(JSON.parse(localStorage.getItem(outboxKey)).length, 1, '오프라인 실패는 outbox에 남아야 한다.');

shouldFail = false;
calls.length = 0;
const rows = await nasLoad('customers');
assert.deepEqual(calls.map(call => `${call.method} ${call.path}`), [
  'PUT /api/data/customers',
  'GET /api/data/customers',
], '원격 조회 전에 대기 변경을 먼저 전송해야 한다.');
assert.deepEqual(rows, [{ id: 'remote' }]);
assert.equal(localStorage.getItem(outboxKey), null, '성공한 변경은 outbox에서 제거해야 한다.');

calls.length = 0;
await nasBulkUpsert('customers', [{ id: 'c1' }, { id: 'c2' }]);
assert.equal(calls.length, 1, '최초 이관은 부분 청크가 아닌 단일 트랜잭션 요청이어야 한다.');
assert.equal(JSON.parse(calls[0].body).rows.length, 2);
await assert.rejects(
  () => nasBulkUpsert('customers', Array.from({ length: 2001 }, (_, id) => ({ id: String(id) }))),
  /2,000/,
);

await flushNasOutbox();
console.log('NAS outbox tests: OK');
