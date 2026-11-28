#!/usr/bin/env node
/**
 * 초점 표시 가드 (333) — `npm run check:focus`
 *
 * 왜: 키보드로 Tab 을 눌러 **어디에 와 있는지 보이지 않으면** 그 화면은 키보드로 쓸 수 없다(WCAG 2.4.7).
 *     이 저장소는 `outline-none` 을 200자리 넘게 쓰는데, 그것은 **마우스 클릭 때 생기는 윤곽선을 지우려고**
 *     쓰는 것이고 키보드 초점은 `src/index.css` 의 **전역 규칙**이 되살린다:
 *       `:where(button, a, [role="button"], [role="menuitem"], [tabindex]):focus-visible { outline: 2px solid … }`
 *       `input:focus, select:focus, textarea:focus { box-shadow: 0 0 0 2px … }`
 *     **334 실측**(리뷰 H-1 로 다시 셌다): `outline-none` 215자리 = **평범한 모양 40 + `focus:`·
 *     `focus-visible:` 접두 175**. 둘은 성질이 다르다 —
 *      · 평범한 40 은 특정도 (0,1,0) 이라 전역 링(`:where`+`:focus-visible` = 0,1,0)이 **순서로** 이긴다.
 *        그 40 중 링 사정거리는 8자리(전부 `tabIndex` 가 붙은 패널·창 루트)이고 **Tab 으로 실제 멈추는
 *        자리는 4개**(예약표 셋·직원 성과 카드), 29자리는 입력칸으로 **별개 규칙**(`input:focus{box-shadow}`)이
 *        지킨다(선택자 목록에 input 이 없다 — 링이 아니라 그 규칙이다).
 *      · 접두 175 는 `.focus\:outline-none:focus` = 특정도 **(0,2,0)** 이라 **순서와 무관하게 전역 링을
 *        이긴다**. 그래서 그 자리는 **자기 className 의 대체**(ring·border·shadow·underline…)가 유일한
 *        보장이고, 333 의 "순서를 보면 된다" 는 그 175자리에 대해 **거짓 안심**이었다.
 *     333 이 적은 "200자리가 한꺼번에 표시를 잃는다" 는 그래서 **과장**이다(링 순서에 걸린 Tab 정지점 4 +
 *     입력칸 규칙 29). 화면은 아무 말도 하지 않고 axe 도 `:focus` 를 평가하지 못하므로 기계가 지킨다.
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
 *  ② 빌드된 CSS(`dist/assets/*.css`)에서 전역 `:focus-visible` 규칙이 **평범한** `.outline-none` 뒤에
 *     오는가(상태 변형은 특정도로 이기므로 순서로 가려지지 않는다 — ③ 가 본다).
 *  ③ 초점 표시를 지웠는데 **아무것도 덮지 못하는** 자리가 있는가:
 *     · `focus:`·`focus-visible:` 접두로 지웠으면 **태그가 무엇이든** 자체 대체가 있어야 한다
 *       (입력칸만 예외 — `input:focus{box-shadow}` 는 속성이 달라 충돌하지 않는다).
 *     · 평범하게 지웠으면 전역 링 사정거리(`button`·`a`·`Link`·`role="button"`·`role="menuitem"`·
 *       `tabIndex`)거나 자체 대체가 있어야 한다.
 *
 * 한계: 전역 CSS 의 **다른** 규칙이 초점 표시를 덮어쓰는 경우는 보지 않는다(순서·특정도를 전부 풀지는
 *     않는다 — ② 는 이 한 쌍만 본다). 인라인 `style` 도 보지 않는다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from './lib/blank-comments.mjs';

// 370(366~368 리뷰 L-4): 364·366 이 이 넷을 `export` 했는데 **아무 모듈도 import 하지 않는다**
//      (셀프테스트가 같은 파일 안에서 쓴다) — 미사용 export 는 §2 가 금지한 데드코드다.
//      `check:dead-export` 는 `src` 만 훑어 `scripts/**` 는 사정거리 밖이라 기계가 막지 못했다.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** ① 전역 규칙이 있어야 하는 모양 */
const GLOBAL_RULES = [
  { name: '키보드 초점 링(button·a·role·tabindex)', re: /:where\([^)]*\btabindex\b[^)]*\):focus-visible\s*\{[^}]*outline:\s*\d+px/ },
  { name: '입력칸 초점 링(input·select·textarea)', re: /input:focus[^{]*\{[^}]*box-shadow:/ },
];

/**
 * ② 빌드된 CSS 에서 **초점 윤곽선을 지우는 세 모양**과 전역 링의 관계 (334, 331~333 리뷰 H-1).
 *
 * 333 은 평범한 `.outline-none{` 하나만 보고 "전역 링이 뒤에 오니 이긴다" 고 했는데, 그것은
 * **평범한 모양에만** 맞는 말이었다. Tailwind 의 상태 변형은 셀렉터가 다르다:
 *   `.outline-none{`                               → 특정도 (0,1,0)   · 실측 50073
 *   `:where(…):focus-visible{`(전역 링)             → 특정도 (0,1,0)   · 실측 55284  ← 순서로 이긴다
 *   `.focus\:outline-none:focus{`                   → 특정도 **(0,2,0)** · 실측 70865 ← **특정도로 이긴다**
 *   `.focus-visible\:outline-none:focus-visible{`   → 특정도 **(0,2,0)** · 실측 71709 ← **특정도로 이긴다**
 * 즉 `focus:outline-none` 을 쓴 자리에서는 **순서를 어떻게 해도 전역 링이 지므로**, 그 자리는
 * 자기 className 에 **보이는 대체**가 있어야 한다(③ 가 그것을 본다). 이 저장소의 `outline-none`
 * 215자리 중 **175자리가 그 모양**이다 — 333 의 ② 는 그 175자리에 대해 **거짓 안심**이었다.
 */
function orderInBuiltCss(css) {
  const bs = String.fromCharCode(92); // 셸을 거치며 깨지지 않게 코드로 만든다
  const plain = css.indexOf('.outline-none{');
  const ring = css.search(/:where\([^)]*\btabindex\b[^)]*\):focus-visible\{outline:/);
  const variants = [
    { name: 'focus:outline-none', at: css.indexOf('.focus' + bs + ':outline-none:focus{') },
    { name: 'focus-visible:outline-none', at: css.indexOf('.focus-visible' + bs + ':outline-none:focus-visible{') },
  ].filter(v => v.at >= 0);
  return {
    plain,
    ring,
    variants,
    // 평범한 모양만 순서로 가려진다. 상태 변형은 특정도로 이기므로 순서 판정 대상이 아니다.
    ok: plain < 0 || ring > plain,
  };
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
function uncoveredProblems(files) {
  const problems = [];
  for (const { file, text } of files) {
    const src = blankComments(text);
    for (let i = 0; i < src.length; i += 1) {
      if (src[i] !== '<') continue;
      const m = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(src.slice(i, i + 40));
      if (!m) continue;
      const end = openTagEnd(src, i);
      if (end < 0) {
        // 334(리뷰 M-6): 전에는 한 줄 적고 **종료 코드 0** 으로 "0자리" 를 찍었다 — 가짜 성공이다.
        problems.push({ file, line: src.slice(0, i).split('\n').length, tag: '스캐너', scanner: true });
        break;
      }
      const tag = src.slice(i, end + 1);
      const name = m[1];
      i = end;

      const raw = tagClassName(tag);
      if (raw === null || !KILLS_OUTLINE.test(raw)) continue;
      if (REPLACEMENT.test(raw)) continue;                            // 자기 대체가 있다
      // 334(리뷰 H-1): **어떤 모양으로 지웠는지**에 따라 전역 규칙이 덮는지가 갈린다.
      //  - 평범한 `outline-none`(0,1,0): 전역 링이 순서로 이긴다 → 전역 사정거리면 면제.
      //  - `focus:outline-none`·`focus-visible:outline-none`(0,2,0): **특정도로 전역을 이긴다** →
      //    단추·링크·role·tabIndex 라도 전역 링이 덮지 못하므로 면제하지 않는다. 다만
      //    입력칸은 링이 아니라 별개 규칙(`input:focus{box-shadow}`)이 지키고 그쪽은 **속성이 달라**
      //    윤곽선 유틸과 충돌하지 않으므로 면제한다.
      const variantKill = /(?:focus|focus-visible):outline-none(?:\s|$)/.test(raw);
      const inputTag = name === 'input' || name === 'select' || name === 'textarea';
      if (variantKill) {
        if (inputTag) continue;                                       // box-shadow 규칙이 지킨다
      } else if (COVERED_TAGS.has(name) || COVERED_ATTR.test(tag)) {
        continue;                                                     // 전역 링이 순서로 덮는다
      }
      // 창 루트는 **Tab 으로 가는 자리가 아니다** — 초점 트랩이 프로그램으로 초점을 주고, 배경 클릭은
      // 마우스 편의다(키보드는 Esc). 거기에 링을 그리면 마우스로 열었을 때도 테두리가 생겨 거짓이 된다.
      // `check:keyboard` 가 창·배경 덮개를 모양으로 면제하는 것과 같은 이유다(333, PhotoLightbox).
      if (/role=["']dialog["']|aria-modal/.test(tag)) continue;
      // 키보드로 갈 수 없는 자리면 초점 표시도 필요 없다(그쪽은 check:keyboard 가 본다).
      // 334: 단, **네이티브 조작부와 role·tabIndex 가 붙은 자리**는 onClick 이 없어도 키보드에 닿는다 —
      // 전에는 그것까지 건너뛰어 `<button className="focus:outline-none">` 를 놓쳤다(덫이 잡았다).
      const reachable = COVERED_TAGS.has(name) || COVERED_ATTR.test(tag) || /onClick=|onKeyDown=/.test(tag);
      if (!reachable) continue;
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

  // 334(리뷰 H-1): 상태 변형은 **특정도로 전역 링을 이긴다** — 태그가 무엇이든 자체 대체가 있어야 한다
  ok('focus:outline-none 단추는 대체가 없으면 잡는다', run('<button className="px-2 focus:outline-none">x</button>').length === 1);
  ok('focus-visible:outline-none 링크도 같다', run('<a href="/x" className="focus-visible:outline-none">x</a>').length === 1);
  ok('role=button + 상태 변형도 잡는다', run('<div role="button" onClick={go} className="focus-visible:outline-none">x</div>').length === 1);
  ok('상태 변형이라도 대체가 있으면 통과', run('<button className="focus:outline-none focus:ring-2">x</button>').length === 0);
  ok('입력칸의 상태 변형은 box-shadow 규칙이 지킨다', run('<input className="focus:outline-none" /><select className="focus:outline-none" /><textarea className="focus:outline-none" />').length === 0);
  ok('평범한 outline-none 은 전역 링이 순서로 덮는다', run('<button className="outline-none">x</button>').length === 0);
  // 364: 빌드 CSS 가 소스보다 낡았으면 신고한다 — 낡은 CSS 에 녹색을 주면 없어진 구조를 통과시킨다
  ok('소스가 더 새로우면 신고', staleMessage(2000, 1000, 'src/x.tsx') !== null);
  ok('낡음 분 수를 적는다', /2분 낡았습니다/.test(staleMessage(1000 + 120000, 1000, 'src/x.tsx')));
  ok('빌드가 더 새로우면 통과', staleMessage(1000, 2000, 'src/x.tsx') === null);
  ok('같은 시각이면 통과', staleMessage(1000, 1000, 'src/x.tsx') === null);
  ok('빌드 CSS 가 없으면 ② 에 맡긴다', staleMessage(2000, 0, 'src/x.tsx') === null);
  // 366(363~365 리뷰 H-1): 여기까지는 **순수 비교기**만 찔렀다 — 리뷰가 ②-2 를 통째로 지워도
  // 셀프테스트가 "통과" 를 찍는 것을 변이 6종으로 보였다. 아래는 **파일을 찾는 쪽과 배선**을 찌른다.
  ok('1분 미만은 분 수를 적지 않는다', /1분 미만/.test(staleMessage(1000 + 29000, 1000, 'src/x.tsx')));
  {
    // 임시 폴더에 하위 폴더·대상 외 확장자를 섞어 두고 newestFile 이 **가장 새 대상 파일**을 고르는지 본다
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'focus-trap-'));
    fs.mkdirSync(path.join(tmp, 'deep'));
    const write = (rel, ms) => {
      const p = path.join(tmp, rel);
      fs.writeFileSync(p, 'x');
      fs.utimesSync(p, new Date(ms), new Date(ms));
      return p;
    };
    write('a.ts', 1_000_000);
    const deep = write(path.join('deep', 'b.tsx'), 3_000_000); // 하위 폴더가 가장 새 것
    write('c.md', 9_000_000); // 대상 외 확장자 — 골라서는 안 된다
    const got = newestFile(tmp, ['.ts', '.tsx', '.css']);
    ok('하위 폴더까지 내려간다', got.f === deep);
    ok('가장 새 대상 파일의 시각을 돌려준다', got.t === 3_000_000);
    ok('대상 외 확장자는 보지 않는다', got.t !== 9_000_000);
    const empty = newestFile(path.join(tmp, '없는폴더'), ['.ts']);
    ok('없는 폴더면 0', empty.t === 0);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  {
    // 366: src 에 있는 확장자를 세는 함수 — 훑는 목록이 이것을 덮는지 본검사가 비교한다
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'focus-ext-'));
    fs.mkdirSync(path.join(tmp2, 'sub'));
    fs.writeFileSync(path.join(tmp2, 'a.ts'), 'x');
    fs.writeFileSync(path.join(tmp2, 'sub', 'b.tsx'), 'x');
    fs.writeFileSync(path.join(tmp2, 'sub', 'c.json'), 'x');
    const exts = extensionsUnder(tmp2);
    ok('확장자를 하위 폴더까지 모은다', exts.has('.ts') && exts.has('.tsx') && exts.has('.json'));
    ok('확장자 집합 크기', exts.size === 3);
    ok('없는 폴더면 빈 집합', extensionsUnder(path.join(tmp2, '없음')).size === 0);
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
  {
    // 배선: 여러 입력 중 가장 새 것을 고르고, **가장 낡은** CSS 와 비교한다
    const srcLike = [{ t: 1000, f: 'src/a.tsx' }, { t: 5000, f: 'tailwind.config.js' }];
    ok('추가 입력이 더 새면 그 이름을 적는다', /tailwind\.config\.js/.test(staleCheck(srcLike, [2000])));
    ok('가장 낡은 CSS 와 비교한다', staleCheck([{ t: 3000, f: 'src/a.tsx' }], [2000, 9000]) !== null);
    ok('CSS 가 전부 더 새면 통과', staleCheck([{ t: 1000, f: 'src/a.tsx' }], [2000, 9000]) === null);
    ok('CSS 가 없으면 ② 에 맡긴다', staleCheck([{ t: 9000, f: 'src/a.tsx' }], []) === null);
  }
  console.log(`[check-focus] selftest OK — 덫 ${trapCount}종 통과(전역 규칙 2종·사라짐 2종·순서 3종·덮임 4종·대체 3종·창 루트 2종·상태 변형 6종·낡은 빌드 5종·그 외 4종)`);
}

/**
 * 364: 빌드 CSS 가 **소스보다 낡았는가** — 낡았으면 ② 는 지난 빌드를 보고 녹색을 준다.
 * 360~362 리뷰가 "빌드 없이 이 단계만 돌리면 낡은 CSS 를 본다" 고 적어 둔 자리이고, 실제로 그
 * 상태였다(dist 09:33 vs 소스 10:18 — 363 의 수정이 빌드에 들어가지 않았다). 게이트는 B(빌드) 뒤에
 * F 를 두어 막지만 **개별 실행**에서는 막히지 않는다. 시각 비교라 사람의 판단이 들어가지 않는다.
 */
function staleMessage(srcMs, cssMs, srcName) {
  if (cssMs === 0) return null; // 빌드 CSS 가 없는 경우는 ② 가 따로 신고한다
  if (srcMs <= cssMs) return null;
  // 366(리뷰 L-1): `Math.round` 는 30초 미만을 **"0분 낡았습니다"** 로 적어 실패 문장이 자기를 부정했다.
  // 1분 미만은 "1분 미만" 으로 적는다.
  const diff = srcMs - cssMs;
  if (diff < 60000) {
    return 'dist/assets 의 빌드 CSS 가 소스보다 낡았습니다(1분 미만, 가장 새 소스: ' + srcName + ') — '
      + '`npm run build` 를 먼저 돌리세요. 낡은 CSS 로는 **이미 없어진 구조에 녹색을 줍니다**(360~362 리뷰).';
  }
  const min = Math.round(diff / 60000);
  return 'dist/assets 의 빌드 CSS 가 소스보다 ' + min + '분 낡았습니다(가장 새 소스: ' + srcName + ') — '
    + '`npm run build` 를 먼저 돌리세요. 낡은 CSS 로는 **이미 없어진 구조에 녹색을 줍니다**(360~362 리뷰).';
}

/**
 * 366: src 아래 **실제로 있는 확장자 집합** — 훑는 목록이 이것을 다 덮어야 한다.
 * 왜: 호출부의 확장자 목록에서 `.tsx` 를 빼는 변이는 셀프테스트가 볼 수 없었다(함수 안이 아니다).
 * 그래서 **본검사가 스스로 입력을 검사**한다. 코드가 정본인 집합 비교라 판단이 들어가지 않는다.
 */
function extensionsUnder(dir) {
  const out = new Set();
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const i = e.name.lastIndexOf('.');
        if (i > 0) out.add(e.name.slice(i));
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/**
 * 366(363~365 리뷰 H-1): ②-2 의 **배선**을 순수 함수로 떼어낸다 — 전에는 비교기에만 덫이 있어
 * 블록을 통째로 지워도 셀프테스트가 "통과" 를 찍었다(리뷰가 변이 6종으로 보였다. 다섯 번째다).
 * 이제 "어느 파일이 가장 새 것인지" 와 "어느 CSS 와 비교하는지" 까지 덫이 찌른다.
 *
 * @param srcLike  {t, f} 꼴 목록 — src 트리와 추가 입력들
 * @param cssTimes 빌드 CSS 들의 수정 시각(ms)
 */
function staleCheck(srcLike, cssTimes) {
  let newest = { t: 0, f: '' };
  for (const x of srcLike) if (x.t > newest.t) newest = x;
  // 366(리뷰 L-5): ② 는 **모든** CSS 를 읽으므로, 비교는 **가장 낡은** 것과 해야 보수적이다
  // (낡은 CSS 가 하나라도 남아 있으면 ② 가 그것을 읽는다. 지금은 `emptyOutDir` 때문에 하나뿐이다).
  const oldest = cssTimes.length === 0 ? 0 : Math.min(...cssTimes);
  return staleMessage(newest.t, oldest, newest.f);
}

/**
 * 가장 새 파일의 시각과 경로 (364)
 *
 * 한계(366, 리뷰 L-4): **파일 삭제는 보이지 않는다** — 소스를 지우고 빌드하지 않으면 남은 파일이
 * 모두 빌드보다 오래되어 통과한다. mtime 으로 알 수 있는 것의 한계다.
 */
function newestFile(dir, exts) {
  let t = 0;
  let f = '';
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.some(x => e.name.endsWith(x))) {
        const m = fs.statSync(p).mtimeMs;
        if (m > t) { t = m; f = p; }
      }
    }
  };
  if (!fs.existsSync(dir)) return { t: 0, f: '' };
  walk(dir);
  return { t, f };
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
      fail.push(`dist/assets/${f}: 전역 초점 링이 .outline-none 보다 **앞**에 옵니다(${order.ring} < ${order.plain}) — 같은 특정도라 나중 것이 이기므로 키보드 초점 표시가 사라집니다`);
    }
  }
}

// ②-2 빌드 CSS 가 소스보다 낡았는가 (364)
{
  // 364: 빌드 CSS 를 바꾸는 입력은 src 만이 아니다 — 팔레트 설정(328 의 교훈)과 틀 문서도 본다.
  // 366(리뷰 M-2): `postcss.config.js`(타일윈드를 켜는 파일)·`vite.config.ts`(출력 설정)도 같은 이유로 넣는다.
  // 366: 훑는 확장자는 **한 곳에만** 적는다 — 두 곳에 적었더니 한쪽만 바꾸는 변이를 못 잡았다
  const SCANNED = ['.ts', '.tsx', '.css'];
  const srcLike = [newestFile(SRC, SCANNED)];
  for (const extra of ['tailwind.config.js', 'index.html', 'postcss.config.js', 'vite.config.ts']) {
    const p = path.join(ROOT, extra);
    if (fs.existsSync(p)) srcLike.push({ t: fs.statSync(p).mtimeMs, f: p });
  }
  // 366: 훑는 확장자 목록이 src 에 **실제로 있는 것**을 다 덮는가(호출부 인자를 본검사가 검사한다)
  for (const ext of extensionsUnder(SRC)) {
    if (!SCANNED.includes(ext)) fail.push(`②-2 가 훑지 않는 확장자가 src 에 있습니다: ${ext} — 그 파일을 고치고 빌드하지 않으면 낡음을 못 봅니다`);
  }
  // 366: 추가 입력이 하나도 없으면 목록이 비어 버린 것이다(팔레트 설정·틀 문서가 빠지면 낡음을 못 본다)
  if (srcLike.length < 2) fail.push('②-2 의 추가 입력(tailwind·postcss·vite·index.html)이 하나도 없습니다 — 목록이 비었는지 보세요');
  const cssTimes = built.map(f => fs.statSync(path.join(assets, f)).mtimeMs);
  const msg = staleCheck(
    srcLike.map(x => ({ t: x.t, f: path.relative(ROOT, x.f).replace(/\\/g, '/') })),
    cssTimes,
  );
  // 366: **무엇을 봤는지 찍는다** — 배선을 지우면 이 줄이 사라져 로그에서 보인다(셀프테스트로는 막을 수 없다)
  process.stdout.write(`[check-focus] ②-2 입력 ${srcLike.length}개 · 빌드 CSS ${cssTimes.length}개 — ${msg === null ? '낡지 않음' : '낡음'}\n`);
  if (msg !== null) fail.push(msg);
}

// ③ 전역이 못 덮는 자리
const files = listFiles(SRC).map(full => ({
  file: path.relative(ROOT, full).replace(/\\/g, '/'),
  text: fs.readFileSync(full, 'utf8'),
}));
const uncovered = uncoveredProblems(files);
for (const p of uncovered) {
  if (p.scanner) {
    fail.push(`${p.file}:${p.line} 여는 태그가 닫히지 않아 **이 파일의 나머지를 보지 못했습니다** — 스캐너를 고쳐야 합니다(조용히 넘기지 않습니다)`);
    continue;
  }
  fail.push(`${p.file}:${p.line} <${p.tag}> 가 초점 표시를 지웠는데 전역 규칙이 덮지 못합니다 — ${'`focus:ring-2`'} 처럼 보이는 대체를 더하세요(상태 변형 ${'`focus:outline-none`'} 은 특정도로 전역 링을 이깁니다)`);
}

if (fail.length > 0) {
  console.error(`[check-focus] 초점 표시 문제 ${fail.length}건:`);
  for (const f of fail) console.error(`  - ${f}`);
  console.error('  → WCAG 2.4.7: 키보드로 간 자리는 보여야 합니다.');
  process.exit(1);
}
console.log(`[check-focus] OK — 전역 초점 규칙 2종 존재·평범한 outline-none 보다 전역 링이 뒤(순서로 이긴다)·상태 변형(특정도로 전역을 이기는 모양) 자리까지 대체 확인·덮이지 않는 자리 0개(.tsx ${files.length}개). 전역 CSS 의 다른 규칙과의 충돌·인라인 style 은 보지 않습니다 — 머리말의 한계를 보세요`);
