#!/usr/bin/env node
/**
 * 장식 UI 가드 (314) — `npm run check:decorative`
 *
 * 왜: CLAUDE.md 2절이 금지하는 것 중 하나가 **"동작하는 척" 하는 요소**다 — onClick 없는 단추,
 *     저장되지 않는 입력칸, 상태와 무관한 배지. 지점 직원은 눌러 보고 "아무 일도 안 일어났다" 를
 *     고장으로 읽거나, 더 나쁘게는 **눌렀으니 됐다고 믿는다**.
 *     **316(312~315 리뷰 M-1) 정정**: 314 는 이 자리에 "117~119 리뷰 #H4 가 실제로 그 길이었다" 고
 *     적었는데 **이 가드가 잡을 수 있는 종류가 아니다** — #H4 의 단추들은 onClick 이 **있었고**
 *     이동한 경로가 권한 밖이라 막다른 길이었다. 그 종류는 역할 게이트와 스펙이 본다.
 *     이 가드의 동기는 CLAUDE.md 2절 자체로 충분하다.
 *     284~312 는 "화면이 사실이 아닌 말을 하는 것" 을 저장 판정·기록·배너 쪽에서 기계에 맡겼다.
 *     이 가드는 같은 원칙을 **입력 요소**에 적용한다.
 *
 * 하는 일: src 의 .tsx 파일에서 `<button`·`<input` 여는 태그를 모아
 *   - 단추: `onClick`·`onPointerDown`·`onMouseDown`·`onKeyDown`·`type="submit"`·`disabled`·`{...props}` 중 하나가 있어야 한다.
 *   - 입력칸: `onChange`·`readOnly`·`disabled`·`ref=`·`defaultValue`·`type="file"`·`type="hidden"`·`{...` 중 하나가 있어야 한다.
 *   주석은 먼저 지운다 — 설명문에 적힌 `<input type="date">` 를 코드로 세면 거짓 경보가 된다
 *   (305·306·311 에서 같은 함정을 세 번 만났다).
 *
 * 한계(정직하게): **있는지**만 본다. `onClick={() => {}}` 처럼 빈 함수를 넣으면 통과한다 —
 *   그 종류는 스펙(화면 칸 커버리지 `check:testids`)과 리뷰가 본다. 또 `<div onClick>` 같은
 *   단추 아닌 요소는 보지 않는다 — **318 까지 그쪽을 보는 가드가 없었다**(창만 보는 `check:modal-a11y`
 *   뿐이었는데 이 줄은 "접근성 가드가 그쪽을 본다" 고 적고 있었다). 지금은 `check:keyboard`(318)가 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** 동작이 없어도 되는 자리 — 이유가 사실이어야 하고, 자리가 사라지면 이 목록도 지워야 한다 */
const ALLOWED = [];

// 321: 중괄호는 escape 한다 — `{0}` 같은 모양이면 **수량자**로 읽혀 엉뚱한 것을 찾는다
// (키보드 경로 가드에서 실제로 그 버그가 있었다). `{'submit'}` 는 지금도 리터럴로 읽히지만 같은 함정의 이웃이다.
const BUTTON_OK = /onClick|onPointerDown|onMouseDown|onKeyDown|type="submit"|type=\{'submit'\}|disabled|\{\.\.\./;
const INPUT_OK = /onChange|onInput|readOnly|disabled|ref=|defaultValue|type="file"|type="hidden"|\{\.\.\./;

/** 주석을 같은 길이의 공백으로 (줄 번호가 흔들리지 않게). 따옴표는 줄을 넘지 않는다(JSX 아포스트로피 대비) */
function blankComments(text) {
  // 316(312~315 리뷰 M-4): 전에는 따옴표만 보아 **정규식 안의 따옴표**(`/['"]/g`)나 JSX 아포스트로피에
  // 속았고, 그 뒤 같은 줄의 `// <button>…` 주석이 지워지지 않아 **주석 속 단추를 실물로 신고**했다
  // (거짓 경보 — 가드를 끄게 만드는 종류다). **줄 주석을 먼저, 줄 단위로** 지운다:
  // 문자열 안의 `//` 는 대개 URL 이고, 장식 판정은 여는 태그의 속성만 보므로 지워도 판정이 바뀌지 않는다.
  // 그 다음 블록 주석을 상태로 지운다(문자열·템플릿은 그대로 둔다 — 속성 값을 봐야 한다).
  const noLine = text.split('\n').map(line => {
    const at = line.indexOf('//');
    if (at < 0) return line;
    // `http://`·`https://` 처럼 바로 앞이 `:` 인 것은 주석이 아니다
    if (at > 0 && line[at - 1] === ':') return line;
    return line.slice(0, at) + ' '.repeat(line.length - at);
  }).join('\n');

  const out = noLine.split('');
  let inBlock = false;
  for (let i = 0; i < noLine.length; i += 1) {
    const c = noLine[i];
    const n = noLine[i + 1];
    if (!inBlock) {
      if (c === '/' && n === '*') { inBlock = true; out[i] = ' '; out[i + 1] = ' '; i += 1; }
      continue;
    }
    if (c === '*' && n === '/') { out[i] = ' '; out[i + 1] = ' '; i += 1; inBlock = false; continue; }
    if (c !== '\n') out[i] = ' ';
  }
  return out.join('');
}

/** 여는 태그 하나를 꺼낸다 — 중괄호 안의 `>`(화살표 함수)는 끝이 아니다 */
function openTags(text, tag) {
  const out = [];
  let at = text.indexOf(`<${tag}`);
  while (at >= 0) {
    // `<buttonish` 같은 다른 이름은 건너뛴다
    const after = text[at + tag.length + 1];
    if (after && /[A-Za-z0-9_]/.test(after)) { at = text.indexOf(`<${tag}`, at + 1); continue; }
    // 317(312~315 리뷰 L-8): 속성 **문자열 안의 중괄호**(`<button title="}">`)에 중괄호 깊이가 음수로
    // 내려가 여는 태그가 다음 요소까지 삼켜졌다 — 그러면 그 안의 다른 핸들러를 보고 **장식 단추를
    // 통과시킨다**. 문자열 안은 세지 않는다.
    let depth = 0;
    let quote = '';
    let end = text.length - 1;
    for (let i = at; i < text.length; i += 1) {
      const c = text[i];
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth += 1;
      else if (c === '}') depth = Math.max(0, depth - 1);
      else if (c === '>' && depth === 0) { end = i; break; }
    }
    out.push({ line: text.slice(0, at).split('\n').length, src: text.slice(at, end + 1) });
    at = text.indexOf(`<${tag}`, end + 1);
  }
  return out;
}

function decorativeProblems(files) {
  const problems = [];
  for (const { file, text } of files) {
    const code = blankComments(text);
    for (const t of openTags(code, 'button')) {
      if (BUTTON_OK.test(t.src)) continue;
      problems.push({ kind: '단추', file, line: t.line, src: t.src.replace(/\s+/g, ' ').slice(0, 80) });
    }
    // 317(리뷰 L-8): `select`·`textarea` 도 "써도 저장되지 않는" 자리가 될 수 있는데 가드 밖이었다
    for (const tag of ['input', 'select', 'textarea']) {
      for (const t of openTags(code, tag)) {
        if (INPUT_OK.test(t.src)) continue;
        problems.push({ kind: tag === 'input' ? '입력칸' : tag, file, line: t.line, src: t.src.replace(/\s+/g, ' ').slice(0, 80) });
      }
    }
  }
  return problems;
}

function listFiles(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? listFiles(full) : (name.endsWith('.tsx') ? [full] : []);
  });
}

function selftest() {
  const ok = (name, cond) => { if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };
  const run = text => decorativeProblems([{ file: 'x.tsx', text }]);

  ok('동작 없는 단추를 잡는다', run('<button className="x">저장</button>').length === 1);
  ok('onClick 이 있으면 통과', run('<button onClick={save}>저장</button>').length === 0);
  ok('화살표 함수의 > 에 속지 않는다', run('<button onClick={() => save(1)} className="x">저장</button>').length === 0);
  ok('submit 단추는 통과', run('<button type="submit">저장</button>').length === 0);
  ok('spread 로 받은 동작도 통과', run('<button {...props}>저장</button>').length === 0);
  ok('주석 속 단추는 코드가 아니다', run('// 예전에는 <button>저장</button> 이었다\n<button onClick={x}>저장</button>').length === 0);
  ok('onChange 없는 입력칸을 잡는다', run('<input value={v} />').length === 1);
  ok('onChange 가 있으면 통과', run('<input value={v} onChange={e => set(e.target.value)} />').length === 0);
  ok('읽기 전용·파일 입력은 통과', run('<input value={v} readOnly />\n<input type="file" />').length === 0);
  ok('주석 속 입력칸은 코드가 아니다', run('/* 네이티브 <input type="date"> 를 보조한다 */\n<input value={v} onChange={x} />').length === 0);
  ok('다른 이름 태그는 세지 않는다', run('<inputish value={v} />\n<buttonGroup />').length === 0);
  // 316(리뷰 M-4): 정규식 안의 따옴표 뒤에 오는 **같은 줄 주석**도 주석이다(전에는 거짓 경보였다)
  ok('정규식 뒤 같은 줄 주석', run("const re = /['\"]/g; // <button>장식</button>\n<button onClick={x}>저장</button>").length === 0);
  ok('JSX 아포스트로피 뒤 주석', run("<p>Let's go</p> // <button>장식</button>\n<button onClick={x}>저장</button>").length === 0);
  ok('URL 의 // 는 주석이 아니다', run('<button onClick={x} data-url="https://a/b">저장</button>').length === 0);
  // 317(리뷰 L-8): 속성 문자열 안의 중괄호에 속아 다음 요소까지 삼키면 **장식 단추를 통과**시킨다
  ok('속성 문자열 안의 중괄호', run('<button title="}">장식</button>\n<button onClick={x}>저장</button>').length === 1);
  ok('select·textarea 도 본다', run('<select value={v} />\n<textarea value={v} />').length === 2);
  ok('select·textarea 에 onChange 가 있으면 통과', run('<select value={v} onChange={x} />\n<textarea value={v} onChange={x} />').length === 0);

  console.log('[check-decorative] selftest OK — 덫(동작 없는 단추·onClick·화살표 함수·submit·spread·주석 속 단추·입력칸 onChange 2종·읽기 전용·주석 속 입력칸·다른 이름·정규식 뒤 주석·아포스트로피 뒤 주석·URL·속성 속 중괄호·select/textarea 2종) 통과');
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const files = listFiles(SRC).map(full => ({
  file: path.relative(ROOT, full).replace(/\\/g, '/'),
  text: fs.readFileSync(full, 'utf8'),
}));
const found = decorativeProblems(files);
const key = p => `${p.file}:${p.line}`;
const unexpected = found.filter(p => !ALLOWED.some(a => a.file === p.file && a.line === p.line));
const stale = ALLOWED.filter(a => !found.some(p => p.file === a.file && p.line === a.line));

if (unexpected.length > 0 || stale.length > 0) {
  if (unexpected.length > 0) {
    console.error(`[check-decorative] 동작이 없는 요소 ${unexpected.length}개:`);
    for (const p of unexpected) console.error(`  - ${p.kind} ${key(p)}  ${p.src}`);
    console.error('  → 동작을 붙이거나(onClick·onChange), 그 요소를 지우세요. 정말 동작이 없어야 하면 ALLOWED 에 이유를 적으세요.');
  }
  if (stale.length > 0) {
    console.error(`[check-decorative] ALLOWED 가 낡았다 — 이미 고쳐졌거나 사라진 자리 ${stale.length}개: ${stale.map(a => `${a.file}:${a.line}`).join(', ')}`);
  }
  process.exit(1);
}
const counts = files.reduce((acc, f) => {
  const code = blankComments(f.text);
  acc.b += openTags(code, 'button').length;
  acc.i += openTags(code, 'input').length;
  acc.s += openTags(code, 'select').length;
  acc.t += openTags(code, 'textarea').length;
  return acc;
}, { b: 0, i: 0, s: 0, t: 0 });
console.log(`[check-decorative] OK — 단추 ${counts.b}개·입력칸 ${counts.i}개·선택 ${counts.s}개·여러줄 ${counts.t}개 전부 동작이 붙어 있다(사유를 적어 둔 자리 ${ALLOWED.length}개)`);
