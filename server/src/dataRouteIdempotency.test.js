// 자료 저장 라우트의 멱등성 계약 (302, 305 보강 — GAP P-4)
// 왜: P-4("결제 중복·Idempotency")의 근거가 **말로만** 있었다 — "클라이언트가 만든 id 로 PUT 하니
//     재전송해도 행이 늘지 않는다". 그 말이 사실인 이유는 전부 이 파일이 검사하는 SQL 한 줄
//     (`ON CONFLICT (branch_id, collection, id) DO UPDATE SET data = EXCLUDED.data`)에 달려 있고,
//     누가 그것을 평범한 INSERT 로 바꾸면 **오프라인에서 받은 결제가 재전송 때마다 한 건씩 늘어난다**
//     (되돌릴 수 없는 사고다). 클라이언트 쪽 절반(재전송이 같은 id 로 간다)은 `scripts/test-nas-outbox.mjs` ⑩~⑫.
// 방법: 배포되는 `server/src/server.js` 의 글을 읽어 라우트 본문을 꺼내고 계약을 검사한다.
//     실행 코드를 새로 만들지 않는다 — `server/src` 에 `.js` 를 하나 더 두면 `buildInfo.js` 의
//     코드 지문이 바뀌어 **아직 재배포되지 않은 서버가 구버전으로 보인다**. `*.test.js` 는 지문에서 빠진다.
//
// 305(300~302 리뷰 M-1·M-2·M-3·LOW-3·LOW-4)에서 보강한 것 — 302 판은 "그 글자가 있으면 통과" 였다:
//   · **주석을 먼저 지운다**: 라우트를 통째로 `/* … */` 로 감싸도 302 판은 10/10 초록이었다(라우트가
//     없으면 오프라인 대기분 전부가 404 — 이 파일이 막겠다고 한 바로 그 사고).
//   · **모양을 본다**: 멱등 upsert 를 남긴 채 평범한 `INSERT` 를 하나 더 넣거나, `scope` 를 뒤에서
//     요청 값으로 바꿔치기하거나, `BEGIN/COMMIT` 을 **로그 문구로만** 남겨도 통과했다.
//   · **PG 결제 경로**(`recordPaidPayment`)를 함께 고정한다 — 서버가 직접 `payments` 행을 쓰는
//     유일한 자리이고, GAP P-4 가 "웹훅 중복은 서버 검증 있음" 이라고 **말로** 적은 그 자리다.
//   · `DO UPDATE SET data = EXCLUDED.data`(행 전체 교체)까지 고정한다 — outbox ⑫ 가 "재전송이 그 사이
//     다른 기기 변경을 되돌린다" 를 지금 동작으로 못 박았는데 그 근거가 어디에도 없었다.
// 한계(정직하게): 이것은 **SQL 의 모양**을 고정하는 검사다. 데이터베이스가 실제로 그렇게 동작하는지는
//     Postgres 가, (branch_id, collection, id) 가 유일 키인지는 스키마가 보장한다.
//     그리고 멱등성은 "행이 늘지 않는다" 까지다 — 응답을 못 받은 PUT 을 다시 보내면 그 사이 다른 기기가
//     바꾼 값을 **되돌린다**(last-writer-wins, GAP Q-1). 그 사실은 outbox 테스트 ⑫ 가 적어 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVER_SRC_DIR } from './buildInfo.js';

const RAW = readFileSync(join(SERVER_SRC_DIR, 'server.js'), 'utf8');

/**
 * 주석을 **같은 길이의 공백**으로 바꾼다(줄·열 번호가 흔들리지 않게).
 * 문자열·템플릿 안의 `//`·`/*` 는 주석이 아니다. 301 이 `scripts/check-modal-a11y.mjs` 에 만든
 * 스캐너와 같은 방식이지만, 서버 쪽은 실행 코드를 늘릴 수 없어(코드 지문) 여기에 둔다.
 */
export function blankComments(text) {
  const out = text.split('');
  let mode = 'code'; // code | line | block | sq | dq | tpl | regex
  let prev = ''; // 코드에서 마지막으로 본 뜻 있는 글자 — 정규식 자리인지 가린다
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; out[i] = ' '; out[i + 1] = ' '; i += 1; continue; }
      if (c === '/' && n === '*') { mode = 'block'; out[i] = ' '; out[i + 1] = ' '; i += 1; continue; }
      // 305(300~302 리뷰 LOW-1 과 같은 함정): `/[\\/:*?"<>|]/g` 처럼 **정규식 안에 따옴표**가 있으면
      // 그것을 문자열 시작으로 읽어, 그 뒤 1만 글자가 "문자열" 이 되고 진짜 주석이 지워지지 않았다
      // (server.js 의 sanitizeFolderName 이 실제로 그 모양이다 — 처음 짰을 때 주석 덫이 그래서 통과했다).
      if (c === '/' && '=(,:[!&|?{};+-*%~^<>'.includes(prev)) { mode = 'regex'; continue; }
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      if (!/\s/.test(c)) prev = c;
      continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; continue; }
      out[i] = ' ';
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && n === '/') { out[i] = ' '; out[i + 1] = ' '; i += 1; mode = 'code'; continue; }
      if (c !== '\n') out[i] = ' ';
      continue;
    }
    if (mode === 'regex') {
      if (c === '\\') { i += 1; continue; }
      if (c === '[') { // 문자 클래스 안의 / 는 끝이 아니다
        while (i < text.length && text[i] !== ']') { if (text[i] === '\\') i += 1; i += 1; }
        continue;
      }
      if (c === '/' || c === '\n') { mode = 'code'; prev = '/'; }
      continue;
    }
    // 문자열·템플릿 — 내용은 그대로 두고 닫는 따옴표만 찾는다
    if (c === '\\') { i += 1; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) { mode = 'code'; prev = c; }
  }
  // 끝에 코드가 아닌 상태로 남았다면 이 결과를 믿을 수 없다 — 조용히 틀린 답을 주는 쪽이 더 나쁘다
  if (mode !== 'code') throw new Error(`blankComments: 파일 끝에서 '${mode}' 상태로 남았다 — 따옴표·주석 짝이 맞지 않거나 스캐너가 못 보는 모양이 있다`);
  return out.join('');
}

const SOURCE = blankComments(RAW);

/** `app.put('/api/data/:collection', …)` 의 본문만 꺼낸다(괄호 짝을 세어 다음 라우트까지 섞이지 않게) */
export function handlerOf(source, method, route) {
  const head = `app.${method}('${route}'`;
  const at = source.indexOf(head);
  if (at < 0) return null;
  // `app.put(` 의 여는 괄호에서 세기 시작해야 한다 — 따옴표 뒤에서 시작하면 `async (req, res, next)` 의
  // 닫는 괄호에서 바로 끝나 본문이 머리말만 잡혔다(처음 짰을 때 그랬다).
  let depth = 0;
  for (let i = source.indexOf('(', at); i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  return null;
}

/** `async function recordPaidPayment(…) { … }` 의 본문 — 중괄호 짝으로 꺼낸다 */
export function functionBodyOf(source, name) {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) return null;
  const open = source.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  return null;
}

/** `{` 짝이 닫히는 자리 — 없으면 끝까지 (311) */
function closeBrace(code, openAt) {
  let depth = 0;
  for (let i = openAt; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') { depth -= 1; if (depth === 0) return i + 1; }
  }
  return code.length;
}

/** 멱등성 계약 위반 목록(빈 배열 = 통과) */
export function checkIdempotency(source) {
  const problems = [];
  const put = handlerOf(source, 'put', '/api/data/:collection');
  const patch = handlerOf(source, 'patch', '/api/data/:collection/:id');
  const pg = functionBodyOf(source, 'recordPaidPayment');
  if (!put) problems.push('PUT /api/data/:collection 라우트가 없다(주석 처리됐거나 이름이 바뀌었다) — 오프라인 대기분이 갈 곳이 사라졌다');
  if (!patch) problems.push('PATCH /api/data/:collection/:id 라우트가 없다 — 칸 단위 수정이 갈 곳이 사라졌다');
  if (!pg) problems.push('recordPaidPayment 가 없다 — PG 결제 웹훅이 결제 행을 쓰는 자리다');

  if (put) {
    const squeezed = put.replace(/\s+/g, ' ');
    const inserts = (squeezed.match(/INSERT INTO crm_records/gi) || []).length;
    const upserts = (squeezed.match(/ON CONFLICT \(branch_id, collection, id\) DO UPDATE SET data = EXCLUDED\.data/gi) || []).length;
    if (inserts === 0) {
      problems.push('PUT 이 crm_records 에 쓰지 않는다 — 대기분이 저장되지 않는다');
    } else if (inserts !== upserts) {
      // 305(리뷰 M-2): 개수를 맞춘다 — 멱등 upsert 를 남긴 채 평범한 INSERT 를 하나 더 넣으면
      // 302 판은 통과했다(그 한 줄로 재전송마다 행이 늘어난다).
      problems.push(`PUT 의 INSERT ${inserts}개 중 (branch_id, collection, id) 충돌을 "SET data = EXCLUDED.data" 로 접는 것이 ${upserts}개다 — 나머지는 재전송마다 행을 늘린다`);
    }
    if (!/isValidId\(row\.id\)/.test(put)) {
      problems.push('PUT 이 행마다 id 를 확인하지 않는다 — 멱등 키가 없는 행이 들어오면 재전송이 중복이 된다');
    }
    const begins = (squeezed.match(/client\.query\('BEGIN'\)/g) || []).length;
    const commits = (squeezed.match(/client\.query\('COMMIT'\)/g) || []).length;
    const rollbacks = (squeezed.match(/client\.query\('ROLLBACK'\)/g) || []).length;
    if (begins !== 1 || commits !== 1 || rollbacks !== 1) {
      // 305(리뷰 M-2): `/BEGIN/` 존재만 보던 탓에 **로그 문구로만** 남겨도 통과했다
      problems.push(`PUT 의 트랜잭션이 BEGIN ${begins}·COMMIT ${commits}·ROLLBACK ${rollbacks} 이다 — 각각 한 번씩 실제 쿼리로 있어야 한다(청크 중간에 끊기면 일부만 저장되고 재전송 결과가 달라진다)`);
    }
    // 305(300~302 리뷰 M-2)는 반복문 끝을 `indexOf('}')` 로 찾아 **중첩 블록이 하나만 있어도** 그 블록
    // 끝으로 줄어들어 뒤의 COMMIT 을 못 봤다(311, 303~308 리뷰 M-3) — 중괄호 균형으로 센다.
    const loopAt = put.search(/for \(const row of rows\)/);
    const commitAt = put.indexOf("client.query('COMMIT')");
    const loopEnd = loopAt >= 0 ? closeBrace(put, put.indexOf('{', loopAt)) : -1;
    if (loopAt >= 0 && commitAt >= 0 && commitAt < loopEnd) {
      problems.push('PUT 이 행 반복 안에서 COMMIT 한다 — 중간에 끊기면 일부만 커밋돼 한 트랜잭션이 아니다');
    }
    if (!/const scope = branchScopeOf\(req\.authUser\)/.test(put)) {
      problems.push('PUT 이 세션의 지점 범위를 const 로 고정하지 않는다 — 다른 지점 자료를 덮을 수 있다');
    }
    if (/\bscope\s*=[^=]/.test(put.replace(/const scope\s*=/, 'const scope:'))) {
      // 305(리뷰 M-2): `scope` 재대입(`scope = req.body.branchId`)이 조용히 통과했다
      problems.push('PUT 에서 scope 를 다시 대입한다 — 세션 범위를 요청 값으로 바꿔치기할 수 있다');
    }
    // 311(리뷰 M-3): 선언만 고정하던 탓에 **쿼리 인자**를 `req.body.branchId || scope` 로 바꾸면 통과했다 —
    // upsert 의 첫 파라미터가 그 `scope` 인지까지 본다.
    if (!/\[scope, req\.params\.collection, id, row\]/.test(squeezed)) {
      problems.push('PUT 의 upsert 첫 인자가 세션 scope 가 아니다 — 다른 지점 자료를 덮을 수 있다');
    }
  }

  if (patch) {
    const squeezed = patch.replace(/\s+/g, ' ');
    if (!/SET data = data \|\| \$1::jsonb/.test(squeezed)) {
      problems.push('PATCH 가 칸 단위 합치기(data || jsonb)가 아니다 — 같은 PATCH 를 다시 보내면 결과가 달라질 수 있다');
    }
    if (!/WHERE branch_id = \$2 AND collection = \$3 AND id = \$4/.test(squeezed)) {
      problems.push('PATCH 가 지점·컬렉션·id 세 가지로 대상을 집지 않는다');
    }
  }

  if (pg) {
    const squeezed = pg.replace(/\s+/g, ' ');
    // 305(리뷰 M-3): 결제 중복의 **서버 쪽 핵심 경로**. 멱등 키는 결제 요청 id 에서 나온다 —
    // 난수로 바꾸면 같은 웹훅이 두 번 와서 결제가 두 건이 된다.
    if (!/id: `pg_\$\{request\.id\}`/.test(squeezed)) {
      problems.push('recordPaidPayment 의 결제 행 id 가 `pg_${request.id}` 가 아니다 — 같은 웹훅이 두 번 오면 결제가 두 건이 된다');
    }
    if (!/INSERT INTO crm_records/i.test(squeezed) ||
        !/ON CONFLICT \(branch_id, collection, id\) DO UPDATE SET data = EXCLUDED\.data/i.test(squeezed)) {
      problems.push('recordPaidPayment 가 (branch_id, collection, id) 충돌을 UPDATE 로 접지 않는다 — 웹훅 재시도가 결제 행을 늘린다');
    }
  }

  return problems;
}

test('지금 배포되는 라우트는 멱등성 계약을 지킨다', () => {
  assert.deepEqual(checkIdempotency(SOURCE), []);
});

test('라우트 본문만 꺼낸다 — 다음 라우트가 섞이지 않는다', () => {
  const put = handlerOf(SOURCE, 'put', '/api/data/:collection');
  assert.ok(put && put.startsWith("app.put('/api/data/:collection'"));
  assert.ok(!put.includes('app.patch('), 'PUT 본문에 PATCH 라우트가 섞였다');
  assert.ok(put.includes('ON CONFLICT'));
});

test('주석은 코드로 세지 않는다 — 문자열 안의 주석 기호는 그대로 둔다', () => {
  const input = `const a = 1; // ON CONFLICT (branch_id, collection, id)\nconst s = "/* 가짜 */";\n/* 진짜\n주석 */ const b = 2;`;
  const blanked = blankComments(input);
  assert.ok(!blanked.includes('ON CONFLICT'), '줄 주석 속 글자가 남았다');
  assert.ok(blanked.includes('"/* 가짜 */"'), '문자열 안의 주석 기호를 지웠다');
  assert.ok(!blanked.includes('진짜'), '블록 주석이 남았다');
  assert.equal(blanked.length, input.length, '길이가 달라지면 줄 번호가 흔들린다');
  assert.equal(blanked.split('\n').length, input.split('\n').length, '줄 수가 달라지면 줄 번호가 흔들린다');
});

// 덫 — 검사가 정말 무는지 본다. 하나라도 통과하면 이 파일은 장식이다.
// 덫은 **그 라우트·함수 본문 안에서만** 바꾼다 — `server.js` 전체에 `replace` 를 걸면 같은 글이 있는
// 앞쪽 라우트(사진 저장의 `ON CONFLICT`·`BEGIN` 등)가 먼저 바뀌어 **자료 라우트는 멀쩡한 채
// 덫이 통과한 것처럼 보였다**(302 에서 덫 셋이 그렇게 침묵했다).
function mutateIn(source, kind, name, fn) {
  const body = kind === 'route' ? handlerOf(source, name[0], name[1]) : functionBodyOf(source, name);
  assert.ok(body, `${kind} ${name} 본문을 찾지 못했다`);
  const changed = fn(body);
  assert.notEqual(changed, body,
    '덫이 본문을 바꾸지 못했다 — 배포 코드가 바뀌어 이 덫이 낡았다. 계약 검사를 다시 읽고 덫을 지금 코드에 맞추세요.');
  return source.replace(body, changed);
}
const DATA_PUT = ['route', ['put', '/api/data/:collection']];
const DATA_PATCH = ['route', ['patch', '/api/data/:collection/:id']];
const PG_FN = ['fn', 'recordPaidPayment'];

const TRAPS = [
  ['ON CONFLICT 제거(평범한 INSERT)', DATA_PUT,
   s => s.replace(/ON CONFLICT \(branch_id, collection, id\)\s*\n\s*DO UPDATE SET data = EXCLUDED\.data, updated_at = now\(\)/, ''),
   /충돌을 "SET data = EXCLUDED.data" 로 접는 것이 0개/],
  ['충돌 키를 id 하나로 좁힘', DATA_PUT,
   s => s.replace('ON CONFLICT (branch_id, collection, id)', 'ON CONFLICT (id)'),
   /접는 것이 0개/],
  ['SET 절을 합치기로 바꿈(outbox ⑫ 의 근거)', DATA_PUT,
   s => s.replace('DO UPDATE SET data = EXCLUDED.data', 'DO UPDATE SET data = crm_records.data || EXCLUDED.data'),
   /접는 것이 0개/],
  ['멱등 upsert 를 남긴 채 평범한 INSERT 를 하나 더', DATA_PUT,
   s => s.replace("      await client.query('COMMIT');",
     "      await client.query(`INSERT INTO crm_records (branch_id, collection, id, data, updated_at) VALUES ($1,$2,$3,$4,now())`, [scope, req.params.collection, 'x', {}]);\n      await client.query('COMMIT');"),
   /INSERT 2개 중 .* 1개다/],
  ['행 id 검증 제거', DATA_PUT,
   s => s.replace('!isValidId(row.id)', 'false'),
   /멱등 키가 없는 행/],
  ['트랜잭션 제거', DATA_PUT,
   s => s.replace("await client.query('BEGIN');", ''),
   /BEGIN 0·COMMIT 1·ROLLBACK 1/],
  ['BEGIN/COMMIT 을 로그 문구로만 남김', DATA_PUT,
   s => s.replace("await client.query('BEGIN');", "log('info', 'BEGIN');").replace("await client.query('COMMIT');", "log('info', 'COMMIT');"),
   /BEGIN 0·COMMIT 0/],
  ['COMMIT 을 행 반복 안으로', DATA_PUT,
   s => s.replace("        `, [scope, req.params.collection, id, row]);", "        `, [scope, req.params.collection, id, row]);\n        await client.query('COMMIT');").replace("      await client.query('COMMIT');\n    } catch (error) {", "    } catch (error) {"),
   /행 반복 안에서 COMMIT/],
  ['지점 범위 대신 요청 값을 믿음', DATA_PUT,
   s => s.replace('const scope = branchScopeOf(req.authUser);', 'const scope = req.body.branchId;'),
   /지점 범위를 const 로 고정하지 않는다/],
  ['지점 범위를 뒤에서 바꿔치기', DATA_PUT,
   s => s.replace('const scope = branchScopeOf(req.authUser);', 'let scope = branchScopeOf(req.authUser);\n    if (req.body.branchId) scope = req.body.branchId;'),
   /scope 를 다시 대입한다/],
  ['PATCH 를 덮어쓰기로 바꿈', DATA_PATCH,
   s => s.replace('SET data = data || $1::jsonb', 'SET data = $1::jsonb'),
   /칸 단위 합치기/],
  ['PATCH 대상을 id 하나로', DATA_PATCH,
   s => s.replace('WHERE branch_id = $2 AND collection = $3 AND id = $4', 'WHERE id = $4'),
   /세 가지로 대상을 집지 않는다/],
  ['PUT 라우트 이름 바꿈', DATA_PUT,
   s => s.replace("app.put('/api/data/:collection'", "app.put('/api/data-disabled'"),
   /PUT \/api\/data\/:collection 라우트가 없다/],
  ['PATCH 라우트 이름 바꿈', DATA_PATCH,
   s => s.replace("app.patch('/api/data/:collection/:id'", "app.patch('/api/data-disabled/:id'"),
   /PATCH \/api\/data\/:collection\/:id 라우트가 없다/],
  ['PG 결제 행 id 를 난수로', PG_FN,
   s => s.replace('id: `pg_${request.id}`', 'id: `pg_${Math.random()}`'),
   /결제 행 id 가 .* 아니다/],
  ['PG 결제를 평범한 INSERT 로', PG_FN,
   s => s.replace(/\s*ON CONFLICT \(branch_id, collection, id\) DO UPDATE SET data = EXCLUDED\.data, updated_at = now\(\)/, ''),
   /웹훅 재시도가 결제 행을 늘린다/],
];

for (const [name, [kind, target], mutate, expected] of TRAPS) {
  test(`덫 — ${name}`, () => {
    const broken = mutateIn(SOURCE, kind, target, mutate);
    const problems = checkIdempotency(broken);
    assert.ok(problems.some(p => expected.test(p)),
      `덫을 놓쳤다: ${name} → ${problems.join(' / ') || '문제 0건'}`);
  });
}

test('덫 — 반복 안 중첩 블록 뒤의 COMMIT(311, 리뷰 M-3)', () => {
  // 305 판은 반복문 끝을 첫 `}` 로 봐서 중첩 블록이 하나 있으면 뒤의 COMMIT 을 못 봤다
  const broken = mutateIn(SOURCE, 'route', ['put', '/api/data/:collection'], s => s
    .replace("        `, [scope, req.params.collection, id, row]);", "        `, [scope, req.params.collection, id, row]);\n        if (row.x) { await client.query('SELECT 1'); }\n        await client.query('COMMIT');")
    .replace("      await client.query('COMMIT');\n    } catch (error) {", "    } catch (error) {"));
  const problems = checkIdempotency(broken);
  assert.ok(problems.some(p => /행 반복 안에서 COMMIT/.test(p)), `놓쳤다 → ${problems.join(' / ') || '문제 0건'}`);
});

test('덫 — scope 를 쿼리 인자에서 바꿔치기(311, 리뷰 M-3)', () => {
  const broken = mutateIn(SOURCE, 'route', ['put', '/api/data/:collection'],
    s => s.replace('[scope, req.params.collection, id, row]', '[req.body.branchId || scope, req.params.collection, id, row]'));
  const problems = checkIdempotency(broken);
  assert.ok(problems.some(p => /upsert 첫 인자가 세션 scope 가 아니다/.test(p)), `놓쳤다 → ${problems.join(' / ') || '문제 0건'}`);
});

test('덫 — 라우트를 통째로 주석 처리(305, 리뷰 M-1)', () => {
  // 302 판은 생 텍스트를 봐서 **주석 처리된 라우트도 "지켜지고 있다"** 고 했다.
  const put = handlerOf(SOURCE, 'put', '/api/data/:collection');
  assert.ok(put);
  // 이미 주석이 지워진 SOURCE 에서 라우트를 감싼다 — RAW 를 쓰면 그 안의 주석·문자열이 섞여
  // 무엇을 검사하는지 흐려진다(처음 짰을 때 그렇게 해서 덫이 통과했다).
  const commented = SOURCE.replace(put, `/*\n${put}\n*/`);
  const problems = checkIdempotency(blankComments(commented));
  assert.ok(problems.some(p => /PUT \/api\/data\/:collection 라우트가 없다/.test(p)),
    `주석 처리된 라우트를 놓쳤다 → ${problems.join(' / ') || '문제 0건'}`);
});
