#!/usr/bin/env node
/**
 * 입력칸 가로 넘침 가드 — `flex-1` 을 준 폼 요소는 `min-w-0` 도 받아야 한다 (362, 355~359 리뷰 M-1).
 *
 * 왜: `flex-1` 만 준 `<input>` 은 **최소 너비가 내용 기준**(`min-width: auto`)이라 글꼴이 넓어지면
 * 줄어들지 못한다. 그래서 입력칸 + 고정폭 단추가 한 줄에 있는 창은 **글꼴에 따라** 창 밖으로 넘친다.
 * 358 에서 깃허브 리눅스 러너의 글꼴로 "태그 목록 관리" 창이 **420 > 412** 로 넘치는 것이 드러났고,
 * 그때는 **검사가 실제로 열어 재는 창 둘만** 고쳤다. 리뷰가 같은 모양 12곳이 남은 것을 찾아
 * 360 에서 전부 고쳤다 — 지점 PC 글꼴이 바뀌면 거기서도 보일 수 있는 결함이다.
 *
 * 왜 가드로 만들 수 있나(352 가 받아들인 경계선): 비교 대상이 **코드가 정본인 집합**이다 —
 * "`flex-1` 을 가진 폼 요소" 라는 집합에 "`min-w-0` 을 가졌는가" 를 묻는다. 말의 뜻을 해석하지 않고,
 * 면제 목록도 두지 않는다. 세로 배치처럼 꼭 필요하지 않은 자리에서도 `min-w-0` 은 **무해한 무동작**
 * 이므로 "전부 준다" 는 규칙이 성립한다 — 그래서 사람의 판단이 들어갈 틈이 없다.
 *
 * 한계: 한 줄 정규식으로는 `onChange={e => …}` 의 `>` 때문에 여는 태그가 끊겨 거의 다 놓친다.
 * 그래서 **중괄호 깊이**를 세며 여는 태그의 끝(`>`)을 찾는다. 주석 안의 태그는 세지 않는다
 * (`scripts/lib/blank-comments.mjs` — 331 에서 네 가드가 공용으로 쓰기 시작한 그 구현).
 *
 * 사용: node scripts/check-flex-inputs.mjs [--selftest]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from './lib/blank-comments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAGS = ['input', 'select', 'textarea'];

/** 여는 태그들을 돌려준다 — 중괄호 깊이를 세어 `>` 를 찾는다 */
export function openTags(text) {
  const out = [];
  for (const tag of TAGS) {
    let from = 0;
    for (;;) {
      const re = new RegExp('<' + tag + '[\\s>]');
      const rel = text.slice(from).search(re);
      if (rel < 0) break;
      const start = from + rel;
      let i = start + tag.length + 1;
      let depth = 0;
      for (; i < text.length; i += 1) {
        const c = text[i];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '>' && depth === 0) break;
      }
      out.push({ tag, start, open: text.slice(start, i) });
      from = i;
    }
  }
  return out;
}

/** `flex-1` 은 있고 `min-w-0` 이 없는 자리 */
export function violations(text) {
  return openTags(blankComments(text))
    .filter(t => /\bflex-1\b/.test(t.open) && !/\bmin-w-0\b/.test(t.open))
    .map(t => ({ tag: t.tag, line: text.slice(0, t.start).split('\n').length }));
}

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

function selftest() {
  let trapCount = 0;
  const ok = (name, cond) => { trapCount += 1; if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };

  ok('flex-1 만 있으면 잡는다', violations('<input className="flex-1 px-3" />').length === 1);
  ok('min-w-0 이 있으면 통과', violations('<input className="flex-1 min-w-0 px-3" />').length === 0);
  ok('flex-1 이 없으면 보지 않는다', violations('<input className="w-full px-3" />').length === 0);
  // 한 줄 정규식이 놓치던 모양 — 화살표 함수의 `>` 가 여는 태그를 끊는다
  ok('화살표 함수가 끼어도 찾는다', violations('<input value={v} onChange={e => set(e.target.value)}\n  className="flex-1 px-3" />').length === 1);
  ok('화살표 함수가 끼어도 통과는 통과', violations('<input value={v} onChange={e => set(e.target.value)}\n  className="flex-1 min-w-0" />').length === 0);
  // select·textarea 도 같은 규칙
  ok('select 도 본다', violations('<select className="flex-1" />').length === 1);
  ok('textarea 도 본다', violations('<textarea className="flex-1" />').length === 1);
  // 주석 안의 태그는 세지 않는다(331 의 공용 구현)
  ok('줄 주석 안은 세지 않는다', violations('// <input className="flex-1" />\n<input className="flex-1 min-w-0" />').length === 0);
  ok('블록 주석 안은 세지 않는다', violations('/* <input className="flex-1" /> */\n<input className="flex-1 min-w-0" />').length === 0);
  // `flex-1` 과 비슷한 다른 낱말에 속지 않는다
  ok('flex-10 같은 말에 속지 않는다', violations('<input className="flex-100 px-3" />').length === 0);
  ok('min-w-00 을 min-w-0 로 보지 않는다', violations('<input className="flex-1 min-w-01" />').length === 1);
  // 줄 번호를 사실대로 돌려준다
  ok('줄 번호', violations('첫 줄\n둘째 줄\n<input className="flex-1" />')[0].line === 3);

  console.log(`[check-flex-inputs] selftest OK — 덫 ${trapCount}종 통과(flex-1·min-w-0·화살표 함수·세 태그·주석 2종·비슷한 낱말 2종·줄 번호). **이 수는 세어서 찍는다** — 손으로 적지 말 것(352~354 리뷰 M-2)`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }
selftest();

const problems = [];
for (const full of listFiles(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  for (const v of violations(fs.readFileSync(full, 'utf8'))) {
    problems.push(`${rel}:${v.line} <${v.tag}> 에 \`flex-1\` 은 있고 \`min-w-0\` 이 없다 — 글꼴이 넓어지면 줄어들지 못해 창 밖으로 넘친다(358 에서 실제로 420 > 412)`);
  }
}

if (problems.length > 0) {
  console.error(`[check-flex-inputs] ${problems.length}건:`);
  for (const p of problems) console.error('  - ' + p);
  console.error('  → `flex-1` 뒤에 `min-w-0` 을 더하세요(세로 배치에서는 무해한 무동작입니다).');
  process.exit(1);
}
console.log('[check-flex-inputs] OK — `flex-1` 을 가진 입력칸·선택칸·여러줄칸 전부가 `min-w-0` 도 가집니다');
