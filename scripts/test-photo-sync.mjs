import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
const requests = [];
globalThis.__photoTestApiRequest = (path, init) => new Promise((resolve, reject) => {
  requests.push({ path, body: JSON.parse(init.body), resolve, reject });
});

const source = fs.readFileSync('src/lib/photoStore.ts', 'utf8').replace(
  "import { apiRequest, isAuthApiConfigured } from './authApi';",
  'const apiRequest = globalThis.__photoTestApiRequest; const isAuthApiConfigured = true;',
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
const { setPhotos, flushPhotosToNas } = await import(moduleUrl);

const first = [{ id: 'p1', dataUrl: 'data:image/jpeg;base64,Zmlyc3Q=', takenAt: '2026-07-15' }];
const latest = [...first, { id: 'p2', dataUrl: 'data:image/jpeg;base64,bGF0ZXN0', takenAt: '2026-07-15' }];
setPhotos('treatment:t1', first);
setPhotos('treatment:t1', latest);
await new Promise(resolve => setImmediate(resolve));
assert.equal(requests.length, 1, '같은 사진 엔티티의 업로드는 동시에 실행하면 안 된다.');
assert.deepEqual(requests[0].body.photos, first);

requests[0].resolve({});
await new Promise(resolve => setImmediate(resolve));
assert.equal(requests.length, 2, '첫 업로드 완료 후 최신 업로드가 이어져야 한다.');
assert.deepEqual(requests[1].body.photos, latest);
requests[1].resolve({});
await flushPhotosToNas();
assert.equal(localStorage.getItem('troiareuke_photos_dirty'), '[]');

console.log('photo sync ordering tests: OK');
