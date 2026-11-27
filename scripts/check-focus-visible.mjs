#!/usr/bin/env node
/**
 * 초점 표시 가드 (333) — `npm run check:focus`
 *
 * 왜: 키보드로 Tab 을 눌러 **어디에 와 있는지 보이지 않으면** 그 화면은 키보드로 쓸 수 없다(WCAG 2.4.7).
 *     이 저장소는 `outline-none` 을 200자리 넘게 쓰는데, 그것은 **마우스 클릭 때 생기는 윤곽선을 지우려고**
 *     쓰는 것이고 키보드 초점은 `src/index.css` 의 **전역 규칙**이 되살린다:
 *       `:where(button, a, [role="button"], [role="menuitem"], [tabindex]):focus-visible { outline: 2px solid … }`
 *       `input:focus, select:focus, textarea:focus { box-shadow: 0 0 0 2px … }`
 *     그 구조는 **두 가지에 기대고 있다** — ① 그 규칙이 존재한다 ② 빌드된 CSS 에서 Tailwind 의
 *     `.outline-none` **뒤에** 온다(`:where()` 는 특정도가 0 이라 둘이 같은 0,1,0 이고, 같으면 **나중 것이**
 *     이긴다). 둘 중 하나가 깨지면 **200자리가 한꺼번에** 키보드 초점 표시를 잃는데, 화면은 아무 말도
 *     하지 않고 접근성 쓸이(axe)도 `:focus` 스타일은 평가하지 못한다. 그래서 **기계가 그 구조를 지킨다**.
 *
 * 333 에서 겪은 것(기록): 처음에는 "className 에 `outline-none` 이 있는데 `focus:ring` 이 없으면 신고" 로
 *     만들었는데 **21자리가 전부 거짓 경보**였다 — 전역 규칙이 이미 덮고 있었고(빌드된 CSS 에서 순서로
 *     확인), 어떤 자리는 `focus-visible:underline` 처럼 **다른 모양의 표시**를 쓰고 있었다. 거짓 경보를
 *     내는 가드는 사람이 가드를 끄게 만들므로 그 판을 버리고 **구조를 지키는 검사**로 바꿨다.
 *     바꾼 뒤에도 한 자리가 남았는데(`PhotoLightbox` 의 창 루트) 그것도 거짓이었다 — 창 루트는
 *     **Tab 으로 가는 자리가 아니라** 초점 트랩이 프로그램으로 초점을 주는 자리다. 그래서 세 번
 *     좁혔다: className 판 버리기 → 전역이 덮는 자리 빼기 → 창 루트 빼기.
 *
 * 보는 것
 *  ① `src/index.css` 에 전역 초점 규칙 둘이 그대로 있는가.
 *  ② 빌드된 CSS(`dist/assets/*.css`)에서 전역 `:focus-visible` 규칙이 `.outline-none` **뒤에** 오는가.
 *  ③ 전역 선택자가 **덮지 못하는** 자리에서 초점 표시를 지우지 않았는가 — 즉 `button`·`a`·`input`·
 *     `select`·`textarea`·`Link` 도 아니고 `role="button"`·`role="menuitem"`·`tabIndex` 도 없는 태그가
 *     `outline-none` 을 쓰면서 보이는 대체(ring·border·shadow·bg·underline·outline)도 없는 경우.
 *
 * 한계: 전역 CSS 의 **다른** 규칙이 초점 표시를 덮어쓰는 경우는 보지 않는다(순서·특정도를 전부 풀지는
 *     않는다 — ② 는 이 한 쌍만 본다). 인라인 `style` 도 보지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from './lib/blank-comments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** ① 전역 규칙이 있어야 하는 모양 */
const GLOBAL_RULES = [
  { name: '키보드 초점 링(button·a·role·tabindex)', re: /:where\([^)]*\btabindex\b[^)]*\):focus-visible\s*\{[^}]*outline:\s*\d+px/ },
  { name: '입력칸 초점 링(input·select·textarea)', re: /input:focus[^{]*\{[^}]*box-shadow:/ },
];

/** ② 빌드된 CSS 에서 순서 — 전역 링이 유틸보다 뒤에 와야 이긴다 */
export function orderInBuiltCss(css) {
  const util = css.indexOf('.outline-none{');
  const ring = css.search(/:where\([^)]*\btabindex\b[^)]*\):focus-visible\{outline:/);
  return { util, ring, ok: util < 0 || (ring > util) };
}

/** ③ 전역 선택자가 덮는 자리인가 */
const COVERED_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'Link']);
const COVERED_ATTR = /role=["']button["']|role=\{'button'\}|role=["']menuitem["']|tabIndex=/;
const KILLS_OUTLINE = /(?:^|\s)(?:focus:|focus-visible:)?outline-none(?:\s|$)/;
const REPLACEMENT = /(?:focus|focus-visible|focus-within):(?:ring|border|shadow|bg|underline|outline-(?!none))/;

function openTagEnd(text, from) {
  let depth = 0;
  let quote = '';
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

function tagClassName(tag) {
  const at = tag.indexOf('className=');
  if (at < 0) return null;
  const i = at + 'className='.length;
  if (tag[i] === '"' || tag[i] === "'") {
    const end = tag.indexOf(tag[i], i + 1);
    return end < 0 ? null : tag.slice(i + 1, end);
  }
  if (tag[i] !== '{') return null;
  let depth = 0;
  let quote = '';
  for (let j = i; j < tag.length; j += 1) {
    const c = tag[j];
    if (quote) { if (c === quote && tag[j - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return tag.slice(i + 1, j); }
  }
  return null;
}

/** 전역 규칙도, 자기 대체도 없는 자리 */
export function uncoveredProblems(files) {
  const problems = [];
  for (const { file, text } of files) {
    const src = blankComments(text);
    for (let i = 0; i < src.length; i += 1) {
      if (src[i] !== '<') continue;
      const m = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(src.slice(i, i + 40));
      if (!m) continue;
      const end = openTagEnd(src, i);
      if (end < 0) {
        console.error(`[check-focus] ${file}:${src.slice(0, i).split('\n').length} 여는 태그가 닫히지 않아 이 파일의 나머지를 보지 못했다`);
        break;
      }
      const tag = src.slice(i, end + 1);
      const name = m[1];
      i = end;

      const raw = tagClassName(tag);
      if (raw === null || !KILLS_OUTLINE.test(raw)) continue;
      if (COVERED_TAGS.has(name) || COVERED_ATTR.test(tag)) continue; // 전역 규칙이 덮는다
      if (REPLACEMENT.test(raw)) continue;                            // 자기 대체가 있다
      // 창 루트는 **Tab 으로 가는 자리가 아니다** — 초점 트랩이 프로그램으로 초점을 주고, 배경 클릭은
      // 마우스 편의다(키보드는 Esc). 거기에 링을 그리면 마우스로 열었을 때도 테두리가 생겨 거짓이 된다.
      // `check:keyboard` 가 창·배경 덮개를 모양으로 면제하는 것과 같은 이유다(333, PhotoLightbox).
      if (/role=["']dialog["']|aria-modal/.test(tag)) continue;
      // 키보드로 갈 수 없는 자리면 초점 표시도 필요 없다(그쪽은 check:keyboard 가 본다)
      if (!/onClick=|onKeyDown=/.test(tag)) continue;
      problems.push({ file, line: src.slice(0, i).split('\n').length, tag: name });
    }
  }
  return problems;
}

function listFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) listFiles(full, out);
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function selftest() {
  let trapCount = 0;
  const ok = (name, cond) => { trapCount += 1; if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };
  const run = text => uncoveredProblems([{ file: 'x.tsx', text }]);

  // ① 전역 규칙 찾기
  const realCss = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
  for (const rule of GLOBAL_RULES) ok(`전역 규칙을 찾는다(${rule.name})`, rule.re.test(realCss));
  ok('전역 링이 사라지면 잡는다', !GLOBAL_RULES[0].re.test(realCss.replace(/:where\([^)]*\):focus-visible/, '.nope')));
  ok('입력칸 링이 사라지면 잡는다', !GLOBAL_RULES[1].re.test(realCss.replace(/input:focus/, '.nope')));

  // ② 순서
  ok('유틸 뒤에 전역 링이면 통과', orderInBuiltCss('.outline-none{outline:2px solid transparent}:where(button,[tabindex]):focus-visible{outline:2px solid #1a3a8f}').ok);
  ok('전역 링이 먼저면 잡는다', !orderInBuiltCss(':where(button,[tabindex]):focus-visible{outline:2px solid #1a3a8f}.outline-none{outline:2px solid transparent}').ok);
  ok('유틸이 없으면 순서는 상관없다', orderInBuiltCss(':where(button,[tabindex]):focus-visible{outline:2px solid #1a3a8f}').ok);

  // ③ 전역이 못 덮는 자리
  ok('덮이지 않는 div 를 잡는다', run('<div onClick={go} className="outline-none">x</div>').length === 1);
  ok('tabIndex 가 있으면 전역이 덮는다', run('<div onClick={go} tabIndex={0} className="outline-none">x</div>').length === 0);
  ok('role=button 도 전역이 덮는다', run('<div onClick={go} role="button" className="outline-none">x</div>').length === 0);
  ok('단추·입력칸은 전역이 덮는다', run('<button className="outline-none">x</button><input className="outline-none" /><select className="outline-none" />').length === 0);
  ok('자기 대체가 있으면 통과', run('<div onClick={go} className="outline-none focus:ring-2">x</div>').length === 0);
  ok('밑줄 대체도 인정한다', run('<div onClick={go} className="outline-none focus-visible:underline">x</div>').length === 0);
  ok('초점 윤곽선을 다시 그리면 통과', run('<div onClick={go} className="focus-visible:outline-none focus-visible:outline-2">x</div>').length === 0);
  ok('누를 수 없는 자리는 보지 않는다', run('<div className="outline-none">x</div>').length === 0);
  ok('창 루트는 면제(초점 트랩이 준다)', run('<div role="dialog" aria-modal="true" onClick={close} className="outline-none">x</div>').length === 0);
  ok('창이 아니면 여전히 잡는다', run('<div onClick={close} className="fixed inset-0 outline-none">x</div>').length === 1);
  ok('outline-none 이 없으면 보지 않는다', run('<div onClick={go} className="px-2">x</div>').length === 0);
  ok('주석 속 마크업은 세지 않는다', run('{/* <div onClick={go} className="outline-none">x</div> */}').length === 0);
  ok('화살표 뒤 속성도 읽는다', run('<div onClick={() => go()} className="outline-none">x</div>').length === 1);

  console.log(`[check-focus] selftest OK — 덫 ${trapCount}종 통과(전역 규칙 2종·사라짐 2종·순서 3종·덮임 4종·대체 3종·창 루트 2종·그 외 4종)`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const fail = [];

// ① 전역 규칙
const cssPath = path.join(SRC, 'index.css');
const css = fs.readFileSync(cssPath, 'utf8');
for (const rule of GLOBAL_RULES) {
  if (!rule.re.test(css)) fail.push(`src/index.css 에 ${rule.name} 규칙이 없습니다 — ${'`outline-none`'} 을 쓴 자리들이 키보드 초점 표시를 잃습니다`);
}

// ② 빌드된 CSS 순서
const assets = path.join(ROOT, 'dist', 'assets');
const built = fs.existsSync(assets) ? fs.readdirSync(assets).filter(f => f.endsWith('.css')) : [];
if (built.length === 0) {
  fail.push('dist/assets 에 빌드된 CSS 가 없습니다 — `npm run build` 뒤에 돌리세요(순서를 눈으로 확인해야 합니다)');
} else {
  for (const f of built) {
    const order = orderInBuiltCss(fs.readFileSync(path.join(assets, f), 'utf8'));
    if (!order.ok) {
      fail.push(`dist/assets/${f}: 전역 초점 링이 .outline-none 보다 **앞**에 옵니다(${order.ring} < ${order.util}) — 같은 특정도라 나중 것이 이기므로 키보드 초점 표시가 사라집니다`);
    }
  }
}

// ③ 전역이 못 덮는 자리
const files = listFiles(SRC).map(full => ({
  file: path.relative(ROOT, full).replace(/\\/g, '/'),
  text: fs.readFileSync(full, 'utf8'),
}));
const uncovered = uncoveredProblems(files);
for (const p of uncovered) {
  fail.push(`${p.file}:${p.line} <${p.tag}> 가 초점 표시를 지웠는데 전역 규칙도 덮지 못합니다(전역은 button·a·input·select·textarea·role=button·tabindex 만) — ${'`focus:ring-2`'} 를 더하거나 ${'`tabIndex`'} 를 주세요`);
}

if (fail.length > 0) {
  console.error(`[check-focus] 초점 표시 문제 ${fail.length}건:`);
  for (const f of fail) console.error(`  - ${f}`);
  console.error('  → WCAG 2.4.7: 키보드로 간 자리는 보여야 합니다.');
  process.exit(1);
}
console.log(`[check-focus] OK — 전역 초점 규칙 2종 존재·빌드 CSS 에서 유틸보다 뒤(이긴다)·전역이 못 덮는 자리 0개(.tsx ${files.length}개). 전역 CSS 의 다른 규칙과의 충돌은 보지 않습니다 — 머리말의 한계를 보세요`);
