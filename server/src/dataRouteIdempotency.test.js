// 자료 저장 라우트의 멱등성 계약 (302, GAP P-4)
// 왜: P-4("결제 중복·Idempotency")의 근거가 **말로만** 있었다 — "클라이언트가 만든 id 로 PUT 하니
//     재전송해도 행이 늘지 않는다". 그 말이 사실인 이유는 전부 이 파일이 검사하는 SQL 한 줄
//     (`ON CONFLICT (branch_id, collection, id) DO UPDATE`)에 달려 있고, 누가 그것을 평범한
//     INSERT 로 바꾸면 **오프라인에서 받은 결제가 재전송 때마다 한 건씩 늘어난다**(되돌릴 수 없는 사고다).
//     클라이언트 쪽 절반(재전송이 같은 id 로 간다)은 `scripts/test-nas-outbox.mjs` ⑩~⑫ 가 본다.
// 방법: 배포되는 `server/src/server.js` 의 글을 읽어 라우트 본문을 꺼내고 계약을 검사한다.
//     실행 코드를 새로 만들지 않는다 — `server/src` 에 `.js` 를 하나 더 두면 `buildInfo.js` 의
//     코드 지문이 바뀌어 **아직 재배포되지 않은 서버가 구버전으로 보인다**. `*.test.js` 는 지문에서 빠진다.
// 한계(정직하게): 이것은 **SQL 의 모양**을 고정하는 검사다. 데이터베이스가 실제로 그렇게 동작하는지는
//     Postgres 가 보장하고, (branch_id, collection, id) 가 실제로 유일 키인지는 스키마가 보장한다.
//     그리고 멱등성은 "행이 늘지 않는다" 까지다 — 응답을 못 받은 PUT 을 다시 보내면 그 사이 다른 기기가
//     바꾼 값을 **되돌린다**(last-writer-wins, GAP Q-1). 그 사실은 outbox 테스트 ⑫ 가 적어 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVER_SRC_DIR } from './buildInfo.js';

const SOURCE = readFileSync(join(SERVER_SRC_DIR, 'server.js'), 'utf8');

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

/** 멱등성 계약 위반 목록(빈 배열 = 통과) */
export function checkIdempotency(source) {
  const problems = [];
  const put = handlerOf(source, 'put', '/api/data/:collection');
  const patch = handlerOf(source, 'patch', '/api/data/:collection/:id');
  if (!put) problems.push('PUT /api/data/:collection 라우트가 없다 — 오프라인 대기분이 갈 곳이 사라졌다');
  if (!patch) problems.push('PATCH /api/data/:collection/:id 라우트가 없다');

  if (put) {
    const squeezed = put.replace(/\s+/g, ' ');
    if (!/INSERT INTO crm_records/i.test(squeezed) ||
        !/ON CONFLICT \(branch_id, collection, id\) DO UPDATE/i.test(squeezed)) {
      problems.push('PUT 이 (branch_id, collection, id) 충돌을 UPDATE 로 접지 않는다 — 재전송마다 행이 늘어난다(오프라인 결제 중복)');
    }
    if (!/isValidId\(row\.id\)/.test(put)) {
      problems.push('PUT 이 행마다 id 를 확인하지 않는다 — 멱등 키가 없는 행이 들어오면 재전송이 중복이 된다');
    }
    if (!/BEGIN/.test(put) || !/COMMIT/.test(put) || !/ROLLBACK/.test(put)) {
      problems.push('PUT 이 한 트랜잭션이 아니다 — 청크 중간에 끊기면 일부만 저장되고 재전송 결과가 달라진다');
    }
    if (!/branchScopeOf\(req\.authUser\)/.test(put)) {
      problems.push('PUT 이 세션의 지점 범위를 쓰지 않는다 — 다른 지점 자료를 덮을 수 있다');
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

  return problems;
}

test('지금 배포되는 라우트는 멱등성 계약을 지킨다', () => {
  assert.deepEqual(checkIdempotency(SOURCE), []);
});

test('라우트 본문만 꺼낸다 — 다음 라우트가 섞이지 않는다', () => {
  const put = handlerOf(SOURCE, 'put', '/api/data/:collection');
  assert.ok(put && put.startsWith("app.put('/api/data/:collection'"));
  assert.ok(!put.includes("app.patch("), 'PUT 본문에 PATCH 라우트가 섞였다');
  assert.ok(put.includes('ON CONFLICT'));
});

// 덫 — 검사가 정말 무는지 본다. 하나라도 통과하면 이 파일은 장식이다.
// 덫은 **그 라우트 본문 안에서만** 바꾼다 — `server.js` 전체에 `replace` 를 걸면 같은 글이 있는
// 앞쪽 라우트(사진 저장의 `ON CONFLICT`·`BEGIN` 등)가 먼저 바뀌어 **자료 라우트는 멀쩡한 채
// 덫이 통과한 것처럼 보였다**(처음 짰을 때 덫 셋이 그렇게 침묵했다).
function mutateIn(source, method, route, fn) {
  const body = handlerOf(source, method, route);
  assert.ok(body, `${method.toUpperCase()} ${route} 본문을 찾지 못했다`);
  const changed = fn(body);
  assert.notEqual(changed, body, '덫이 라우트 본문을 바꾸지 못했다(코드가 바뀌어 덫이 낡았다)');
  return source.replace(body, changed);
}
const DATA_PUT = ['put', '/api/data/:collection'];
const DATA_PATCH = ['patch', '/api/data/:collection/:id'];
const TRAPS = [
  ['ON CONFLICT 제거(평범한 INSERT)', DATA_PUT,
   s => s.replace(/ON CONFLICT \(branch_id, collection, id\)\s*\n\s*DO UPDATE SET data = EXCLUDED\.data, updated_at = now\(\)/, ''),
   /재전송마다 행이 늘어난다/],
  ['충돌 키를 id 하나로 좁힘', DATA_PUT,
   s => s.replace('ON CONFLICT (branch_id, collection, id)', 'ON CONFLICT (id)'),
   /충돌을 UPDATE 로 접지 않는다/],
  ['행 id 검증 제거', DATA_PUT,
   s => s.replace('!isValidId(row.id)', 'false'),
   /멱등 키가 없는 행/],
  ['트랜잭션 제거', DATA_PUT,
   s => s.replace("await client.query('BEGIN');", ''),
   /한 트랜잭션이 아니다/],
  ['지점 범위 대신 요청 값을 믿음', DATA_PUT,
   s => s.replace('branchScopeOf(req.authUser)', 'req.body.branchId'),
   /지점 범위를 쓰지 않는다/],
  ['PATCH 를 덮어쓰기로 바꿈', DATA_PATCH,
   s => s.replace('SET data = data || $1::jsonb', 'SET data = $1::jsonb'),
   /칸 단위 합치기/],
  ['PATCH 대상을 id 하나로', DATA_PATCH,
   s => s.replace('WHERE branch_id = $2 AND collection = $3 AND id = $4', 'WHERE id = $4'),
   /세 가지로 대상을 집지 않는다/],
  ['PUT 라우트 삭제', DATA_PUT,
   s => s.replace("app.put('/api/data/:collection'", "app.put('/api/data-disabled'"),
   /갈 곳이 사라졌다/],
];

for (const [name, [method, route], mutate, expected] of TRAPS) {
  test(`덫 — ${name}`, () => {
    const broken = mutateIn(SOURCE, method, route, mutate);
    const problems = checkIdempotency(broken);
    assert.ok(problems.some(p => expected.test(p)),
      `덫을 놓쳤다: ${name} → ${problems.join(' / ') || '문제 0건'}`);
  });
}
