#!/usr/bin/env node
/**
 * 키보드 경로 가드 (318) — `npm run check:keyboard`
 *
 * 왜: 314 의 장식 UI 가드는 머리말에 "`<div onClick>` 같은 단추 아닌 요소는 접근성 가드가 그쪽을 본다"
 *     고 적어 두었는데 **그 가드가 없었다** — 창(`check:modal-a11y`)만 보고 있었다. 적어 둔 말이
 *     사실이 아니었던 자리다(312·316 에서 두 번 만난 종류 — 기록이 가드보다 넓게 말한다).
 *     이 가드가 그 말을 사실로 만든다.
 *     실제로 318 에서 훑었을 때 **지점 직원이 쓰는 직원 카드**가 마우스로만 열렸다(Tab 으로 닿지 않았다).
 *
 * 하는 일: src 의 .tsx 에서 `onClick` 이 붙은 `div`·`span`·`li`·`tr`·`td` 여는 태그를 모아
 *     **키보드로 닿을 길이 하나라도 있는지** 본다. 다음 중 하나면 통과:
 *   ① 자기 자리가 제대로 된 단추다 — `role="button"` + `tabIndex` + `onKeyDown` (셋 다)
 *   ② 안쪽에 포커스를 받는 요소가 있다 — `<button>`·`<a>`·`<input>`·`<select>`·`<textarea>`·`role="button"`·`tabIndex={0}`
 *   ③ 배경 덮개다 — className 에 `inset-0` (배경을 눌러 닫는 자리. 키보드는 Esc 가 맡는다 — `useOverlayClose`)
 *   ④ 창 자체다 — `role="dialog"`·`aria-modal` (`check:modal-a11y` 가 본다)
 *   ⑤ 핸들러가 `e.stopPropagation()` 뿐이다 — 누르는 자리가 아니라 **부모의 닫기를 막는** 자리다
 *   주석은 먼저 지운다(305·306·311·316 에서 네 번 만난 거짓 경보의 원천).
 *
 * 한계(정직하게): ②는 **포커스를 받는 요소가 안에 있는지**만 본다 — 그 단추가 바깥 `onClick` 과
 *   **같은 동작**인지는 보지 않는다. 어드민 표 두 곳·직원 카드처럼 "진짜 단추를 첫 칸에 둔다" 가
 *   이 저장소의 방식이라(2026-11-20 리뷰가 고른 모양) 통과 조건으로 삼았고, 같은 동작인지는 사람·리뷰가 본다.
 *   318 측정: 훑은 18자리 중 ③④⑤가 15, ②가 2(어드민 표), 진짜 구멍이 1(직원 카드).
 *   그래서 ③④⑤를 **모양으로** 면제한다 — 면제하지 않으면 17/18 이 거짓 경보가 되고,
 *   거짓 경보를 내는 가드는 사람이 가드를 끄게 만들어 못 잡는 것보다 나쁘다(303 에서 정한 기준).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const TAGS = ['div', 'span', 'li', 'tr', 'td'];

/** 키보드 경로가 없어도 되는 자리 — 이유가 사실이어야 하고, 자리가 사라지면 이 줄도 지워야 한다 */
const ALLOWED = [];

const SELF_ROLE = /role="button"|role={'button'}/;
const SELF_KEY = /onKeyDown|onKeyUp|onKeyPress/;
const FOCUSABLE = /<(?:button|a|input|select|textarea)[\s>/]|role="button"|role={'button'}|tabIndex={0}/;
const BACKDROP = /inset-0/;
const DIALOG = /role="dialog"|role={'dialog'}|aria-modal/;
const ONLY_STOP = /onClick={\s*e\s*=>\s*e\.stopPropagation\(\)\s*}|onClick={\s*e\s*=>\s*{\s*e\.stopPropagation\(\);?\s*}\s*}/;

/** 주석을 같은 길이의 공백으로 (줄 번호가 흔들리지 않게) — check-decorative 와 같은 방식(316·317) */
function blankComments(text) {
  const noLine = text.split('\n').map(line => {
    const at = line.indexOf('//');
    if (at < 0) return line;
    // `http://` 처럼 바로 앞이 `:` 인 것은 주석이 아니다
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

/** 여는 태그의 끝 — 중괄호 안의 `>`(화살표 함수)는 끝이 아니고, 속성 문자열 안의 중괄호는 깊이가 아니다(317) */
function openTagEnd(text, at) {
  let depth = 0;
  let quote = '';
  for (let i = at; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (c === '>' && depth === 0) return i;
  }
  return text.length - 1;
}

/** 여는 태그부터 짝이 맞는 닫는 태그까지 — 같은 이름이 겹쳐도 깊이로 센다 */
function subtree(text, tag, openEnd) {
  const close = `</${tag}>`;
  const open = `<${tag}`;
  let depth = 1;
  const start = openEnd + 1;
  let i = start;
  while (i < text.length && depth > 0) {
    if (text.startsWith(close, i)) { depth -= 1; i += close.length; continue; }
    if (text.startsWith(open, i) && !/[A-Za-z0-9_]/.test(text[i + open.length] || '')) {
      const e = openTagEnd(text, i);
      if (text[e - 1] !== '/') depth += 1;
      i = e + 1;
      continue;
    }
    i += 1;
  }
  return text.slice(start, Math.max(start, i - close.length));
}

function problems(files) {
  const found = [];
  for (const { file, text } of files) {
    const code = blankComments(text);
    for (const tag of TAGS) {
      const open = `<${tag}`;
      let at = code.indexOf(open);
      while (at >= 0) {
        const after = code[at + open.length];
        if (after && /[A-Za-z0-9_]/.test(after)) { at = code.indexOf(open, at + 1); continue; }
        const end = openTagEnd(code, at);
        const src = code.slice(at, end + 1);
        const line = code.slice(0, at).split('\n').length;
        const selfClosing = code[end - 1] === '/';
        const inner = selfClosing ? '' : subtree(code, tag, end);
        at = code.indexOf(open, end + 1);

        if (!/onClick=/.test(src)) continue;
        if (ONLY_STOP.test(src)) continue;                                              // ⑤
        if (BACKDROP.test(src)) continue;                                               // ③
        if (DIALOG.test(src)) continue;                                                 // ④
        if (SELF_ROLE.test(src) && SELF_KEY.test(src) && /tabIndex=/.test(src)) continue; // ①
        if (!selfClosing && FOCUSABLE.test(inner)) continue;                            // ②
        found.push({ file, line, src: src.replace(/\s+/g, ' ').slice(0, 80) });
      }
    }
  }
  return found;
}

function listFiles(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? listFiles(full) : (name.endsWith('.tsx') ? [full] : []);
  });
}

function selftest() {
  const ok = (name, cond) => { if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };
  const run = text => problems([{ file: 'x.tsx', text }]);

  ok('마우스로만 열리는 카드를 잡는다', run('<div onClick={open} className="card"><p>이름</p></div>').length === 1);
  ok('안쪽 단추가 키보드 경로다', run('<div onClick={open} className="card"><button onClick={open}>이름</button></div>').length === 0);
  ok('제대로 된 역할·키보드는 통과', run('<div onClick={open} role="button" tabIndex={0} onKeyDown={k}>이름</div>').length === 0);
  ok('역할만 있고 키보드가 없으면 잡는다', run('<div onClick={open} role="button" tabIndex={0}>이름</div>').length === 1);
  ok('배경 덮개는 면제', run('<div className="fixed inset-0 bg-black/40" onClick={close} />').length === 0);
  ok('창 자체는 면제', run('<div role="dialog" aria-modal="true" onClick={x}><p>본문</p></div>').length === 0);
  ok('부모 닫기를 막는 자리는 면제', run('<div onClick={e => e.stopPropagation()}><p>본문</p></div>').length === 0);
  ok('중괄호형 stopPropagation 도 면제', run('<div onClick={e => { e.stopPropagation(); }}><p>본문</p></div>').length === 0);
  ok('안쪽이 없는 자기닫는 태그는 잡는다', run('<div onClick={open} className="card" />').length === 1);
  ok('표 행도 본다', run('<tr onClick={open}><td>값</td></tr>').length === 1);
  ok('표 행의 안쪽 단추는 경로다', run('<tr onClick={open}><td><button onClick={open}>값</button></td></tr>').length === 0);
  ok('onClick 이 없으면 보지 않는다', run('<div className="card"><p>이름</p></div>').length === 0);
  ok('주석 속 카드는 코드가 아니다', run('// 전에는 <div onClick={open}>이름</div> 였다\n<p>x</p>').length === 0);
  // 겹친 요소를 깊이로 세지 않으면 바깥 카드가 **자기 밖의 단추**를 경로로 쓴다(거짓 통과)
  ok('겹친 요소를 깊이로 센다', run('<div onClick={open} className="card"><div><p>이름</p></div></div>\n<div><button onClick={x}>밖</button></div>').length === 1);
  ok('다른 이름 태그는 세지 않는다', run('<divider onClick={open}>x</divider>').length === 0);
  ok('링크도 키보드 경로다', run('<li onClick={open}><a href="/x">이름</a></li>').length === 0);

  console.log('[check-keyboard] selftest OK — 덫(마우스 전용 카드·안쪽 단추·역할+키보드·역할만·배경 덮개·창·stopPropagation 2종·자기닫는 태그·표 행 2종·onClick 없음·주석·겹친 요소 깊이·다른 이름·링크) 통과');
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const files = listFiles(SRC).map(full => ({
  file: path.relative(ROOT, full).replace(/\\/g, '/'),
  text: fs.readFileSync(full, 'utf8'),
}));
const found = problems(files);
const unexpected = found.filter(p => !ALLOWED.some(a => a.file === p.file && a.line === p.line));
const stale = ALLOWED.filter(a => !found.some(p => p.file === a.file && p.line === a.line));

if (unexpected.length > 0 || stale.length > 0) {
  if (unexpected.length > 0) {
    console.error(`[check-keyboard] 마우스로만 쓸 수 있는 자리 ${unexpected.length}개:`);
    for (const p of unexpected) console.error(`  - ${p.file}:${p.line}  ${p.src}`);
    console.error('  → 안쪽 첫 칸에 진짜 <button> 을 두거나(이 저장소의 방식), role="button"+tabIndex={0}+onKeyDown 을 붙이세요.');
  }
  if (stale.length > 0) {
    console.error(`[check-keyboard] ALLOWED 가 낡았다 — 이미 고쳐졌거나 사라진 자리 ${stale.length}개: ${stale.map(a => `${a.file}:${a.line}`).join(', ')}`);
  }
  process.exit(1);
}
console.log(`[check-keyboard] OK — onClick 이 붙은 ${TAGS.join('·')} 전부 키보드로 닿을 길이 있다(사유를 적어 둔 자리 ${ALLOWED.length}개)`);
