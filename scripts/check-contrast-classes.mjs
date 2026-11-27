#!/usr/bin/env node
/**
 * 글자 대비 가드 (326·327, 328 팔레트·사정거리 전면 수정, 329 **부모·자식 물려받기**) — `npm run check:contrast`
 *
 * 왜: 325 가 **성공 토스트의 대비 3.77:1**(경고 토스트는 2.15:1)을 찾았는데, 그것이 잡힌 것은 **운이었다** —
 *     캠페인 창을 열 때 토스트가 떠 있었다. 접근성 쓸이(axe)는 **그 순간 화면에 있는 것만** 본다.
 *     토스트는 스캔 전에 치워지고(`dismissToasts`), 공지 띠는 서버 공지가, 업데이트 띠는 새 버전이 있어야 뜬다 —
 *     지점이 매일 보는 자리인데 **구조적으로 측정되지 않는다**. 그래서 화면을 그리지 않고 **소스에서** 센다.
 *
 * **328(325~327 리뷰 H-1) — 이 가드는 두 묶음 동안 거짓 수를 말했다.**
 *     `tailwindcss/colors`(=**기본** 팔레트)를 읽었는데, 이 프로젝트는 `tailwind.config.js` 에서
 *     `gray-400` 을 **`#6b7280`(= gray-500)** 으로 바꿔 둔다(캡션 대비를 토큰에서 고친 2026-11-18 조치).
 *     빌드된 CSS 도 `.text-gray-400,.text-gray-500{color:rgb(107 114 128)}` 로 **같은 색**을 낸다(직접 확인).
 *     그래서 `text-gray-400` 쪽에 2.54:1 같은 **없는 수**를 말했고, 327 은 그 수를 믿고
 *     `gray-400 → gray-500` 다섯 자리를 "고쳤다" — **화면이 1픽셀도 바뀌지 않는 no-op** 이었다.
 *     그 거짓 수는 커밋 제목·로드맵·오너 브리핑·**지점에 나가는 릴리스 노트**까지 실렸다(328 에서 전부 정정).
 *     지금은 `resolveConfig(tailwind.config.js)` 로 **이 프로젝트의 팔레트와 글자 크기**를 읽는다.
 *
 * 하는 일: 같은 className **가지**에서 상태(기본/hover/focus/active)별로 글자색 × 배경색을 짝지어
 *     대비를 계산하고, 보통 글자 4.5:1·**큰 글자**(프로젝트 글자 크기로 24px 이상, 또는 18.66px 이상 굵게)
 *     3:1 미만이면 실패한다. 그라디언트 배경(`from-`/`to-`)은 **양 끝 모두** 본다.
 *
 * 읽는 className 모양(328, 리뷰 H-2): `className="…"` · `className={`…`}` · `className={clsx(…)}` ·
 *     `{cn(…)}` · `{조건 ? "a" : "b"}` · `{'…'}`. 328 전에는 앞의 둘만 읽어 **161자리가 사정거리 밖**이었고,
 *     거기 실제 위반이 있었다(예약표의 구글 캘린더 일정 블록 — 흰 글자 on blue-500 3.68:1).
 *
 * 거짓 경보를 막는 네 가지:
 *  ① **가지 쪼개기**: `${on ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600'}` 는 **두 가지**다.
 *     한 문자열로 보면 **없는 조합**을 신고한다(326 첫 시도 68자리 중 50이 그 종류였다).
 *  ② **상태별 짝짓기**: `text-gray-300 hover:text-red-700 hover:bg-red-50` 은 호버에서 **둘 다** 바뀐다.
 *     기본 글자색을 호버 배경과 짝지으면 1.35:1 같은 없는 조합이 된다(327 에서 그 거짓 경보 넷을 만들었다).
 *  ③ **큰 글자 완화**: WCAG 1.4.3 의 완화를 **프로젝트 글자 크기로** 계산한다(`text-lg` 는 17px 라
 *     굵어도 큰 글자가 아니다 — 327 기록은 이것을 "WCAG 완화" 로 뭉갰다, 리뷰 L-1).
 *  ④ **꺼진 조작부 면제**: WCAG 1.4.3 은 "비활성 구성요소" 를 뺀다. `cursor-not-allowed` 또는
 *     `disabled:` 변형이 같은 가지에 있으면 보지 않는다 — 꺼진 단추를 진하게 만들면 **켜진 것처럼 보여**
 *     오히려 거짓이 된다. (328: 전에는 `t === 'disabled'`·`'aria-disabled'` 를 보았는데 className 에
 *     그런 토큰은 존재할 수 없어 **한 번도 발동하지 않는 죽은 조건**이었다 — 리뷰 L-2.)
 *
 * 한계(정직하게, 329 에서 다시 썼다):
 *  - **같은 파일 안**에서는 부모가 깐 배경을 물려받아 짝짓는다(329). 하지만 **다른 파일의 부모**가 깐
 *    배경은 모른다 — 이 저장소에서는 그게 더 흔하다(어드민의 어두운 테마가 그렇다). 그래서 329 는
 *    "조상에 배경이 없으면 흰 바닥" 이라는 가정을 **버렸다**: 그 가정으로 돌렸더니 거짓 경보 202건이
 *    나왔고 그 중 `text-white` 를 1.00:1 로 신고하는 것까지 있었다. 지금은 **선언된 배경만** 본다.
 *  - 투명도 표기(`text-white/70`·`bg-amber-500/80`)·인라인 `style`·CSS 변수·이미지 위의 글자는 보지 않는다.
 *  - `gray-400` 과 `gray-500` 은 이 프로젝트에서 **같은 색**이다(`tailwind.config.js:11`, 의도된 것) —
 *    둘 사이를 바꾸는 "수정" 은 화면을 바꾸지 않는다(327 이 그걸 다섯 번 했다).
 *  - 그래서 "**0자리**" 는 "**이 가드가 보는 범위에서** 0" 이라는 뜻이다. axe 쓸이가 나머지를 메우지만
 *    **서버·앱 상태가 필요한 화면은 둘 다 못 본다**(326 머리말의 "둘은 서로를 메운다" 는 과했다 — 리뷰 H-3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import resolveConfig from 'tailwindcss/resolveConfig.js';
import tailwindConfig from '../tailwind.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** 이 프로젝트의 팔레트·글자 크기 (328, 리뷰 H-1·L-1) */
const THEME = resolveConfig(tailwindConfig).theme;
const COLORS = THEME.colors;

/** 기준 미만이어도 되는 자리 — 이유가 사실이어야 하고, 자리가 사라지면 이 줄도 지워야 한다 */
const ALLOWED = [];

const MIN_NORMAL = 4.5;
const MIN_LARGE = 3;

function luminance(hex) {
  const v = parseInt(hex.slice(1), 16);
  const ch = x => { const c = x / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch((v >> 16) & 255) + 0.7152 * ch((v >> 8) & 255) + 0.0722 * ch(v & 255);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function paletteHex(family, shade) {
  const fam = COLORS[family];
  if (!fam) return null;
  const hex = typeof fam === 'string' ? fam : fam[shade];
  return typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null;
}
/** 글자 크기 토큰 → px (프로젝트 스케일) */
function fontPx(token) {
  const key = token.replace(/^text-/, '');
  const v = THEME.fontSize?.[key];
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== 'string') return null;
  const m = /^([\d.]+)(px|rem)$/.exec(raw);
  if (!m) return null;
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

/** className 값 조각을 모은다 — 문자열·템플릿·`clsx()`/`cn()`·삼항까지 (328, 리뷰 H-2) */
function classNameChunks(text) {
  const out = [];
  const needle = 'className=';
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    const line = text.slice(0, at).split('\n').length;
    const i = at + needle.length;
    let raw = '';
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i];
      const end = text.indexOf(q, i + 1);
      if (end < 0) continue;
      raw = text.slice(i + 1, end);
    } else if (text[i] === '{') {
      // 중괄호 깊이를 세어 표현식 전체를 꺼낸다(문자열 안의 괄호는 세지 않는다)
      let depth = 0;
      let quote = '';
      let end = -1;
      for (let j = i; j < text.length; j += 1) {
        const c = text[j];
        if (quote) { if (c === quote && text[j - 1] !== '\\') quote = ''; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '{') depth += 1;
        else if (c === '}') { depth -= 1; if (depth === 0) { end = j; break; } }
      }
      if (end < 0) continue;
      raw = text.slice(i + 1, end);
    } else continue;
    out.push({ line, raw });
  }
  return out;
}

/**
 * 한 className 값을 **가지**로 쪼갠다(①).
 * 328: 템플릿 문자열을 통째로 한 조각으로 보면 그 **안의 삼항 가지들**을 놓친다 — 따옴표·백틱 안으로
 * 한 단계씩 들어가며 모은다(바깥 조각에서는 보간과 문자열을 지워 가지를 섞지 않는다).
 */
const QUOTED = /(['"`])((?:(?!\1)[\s\S])*)\1/g;
function branches(raw) {
  const out = [];
  const visit = (s, depth) => {
    const plain = s.replace(/\$\{[\s\S]*?\}/g, ' ').replace(new RegExp(QUOTED.source, 'g'), ' ');
    if (/[a-z]/.test(plain)) out.push(plain);
    if (depth >= 4) return;
    for (const m of s.matchAll(new RegExp(QUOTED.source, 'g'))) visit(m[2], depth + 1);
  };
  visit(raw, 0);
  return out;
}


/** 토큰에서 상태·종류·색을 꺼낸다 — 팔레트·이름 색(white/black)·임의 값(`[#rrggbb]`)·그라디언트 끝 */
function colorToken(token) {
  const m = /^(?:(hover|focus|focus-visible|active):)?(bg|text|from|to)-(?:([a-z]+)-(\d{2,3})|(white|black)|\[(#[0-9a-fA-F]{6})\])$/.exec(token);
  if (!m) return null;
  const named = m[5] === 'white' ? '#ffffff' : (m[5] === 'black' ? '#000000' : null);
  return {
    state: m[1] || 'base',
    kind: m[2] === 'from' || m[2] === 'to' ? 'bg' : m[2],
    edge: m[2] === 'from' || m[2] === 'to' ? m[2] : null,
    family: m[3], shade: m[4], named: m[5] || null,
    literal: m[6] ? m[6].toLowerCase() : named,
  };
}
function tokenHex(c) { return c.literal ? c.literal : paletteHex(c.family, c.shade); }
function tokenName(c) {
  const prefix = c.state === 'base' ? '' : `${c.state}:`;
  const kind = c.edge || c.kind;
  const body = c.named ? c.named : (c.family ? `${c.family}-${c.shade}` : `[${c.literal}]`);
  return `${prefix}${kind}-${body}`;
}

const STATES = ['base', 'hover', 'focus', 'focus-visible', 'active'];

/** 이 가지의 글자가 WCAG 기준에서 "큰 글자" 인가(③ — 프로젝트 글자 크기로) */
function isLargeText(tokens) {
  const bold = tokens.some(t => t === 'font-bold' || t === 'font-extrabold' || t === 'font-black' || t === 'font-semibold');
  for (const t of tokens) {
    if (!/^text-(xs|sm|base|lg|xl|\dxl)$/.test(t)) continue;
    const px = fontPx(t);
    if (px === null) continue;
    if (px >= 24 || (bold && px >= 18.66)) return true;
  }
  return false;
}

/** 한 가지에서 상태마다 글자색·배경색을 짝짓는다(②). 그라디언트는 양 끝을 각각 본다 */
function statePairs(tokens) {
  const byState = new Map();
  for (const t of tokens) {
    const c = colorToken(t);
    if (!c) continue;
    const slot = byState.get(c.state) || { bgs: [] };
    if (c.kind === 'bg') slot.bgs.push(c);
    else slot.text = c;
    byState.set(c.state, slot);
  }
  const baseText = byState.get('base')?.text;
  const out = [];
  for (const state of STATES) {
    const slot = byState.get(state);
    if (!slot?.bgs?.length) continue;
    const fgTok = slot.text || baseText;
    if (!fgTok) continue;
    const fg = tokenHex(fgTok);
    if (!fg) continue;
    for (const bgTok of slot.bgs) {
      const bg = tokenHex(bgTok);
      if (!bg) continue;
      out.push({ fg, fgName: tokenName(fgTok), bg, bgName: tokenName(bgTok) });
    }
  }
  return out;
}

/** 줄·블록 주석을 공백으로 지운다 — 주석 속 마크업을 실물로 세지 않는다(check-decorative 와 같은 방식) */
function blankComments(text) {
  const noLine = text.split('\n').map(line => {
    const at = line.indexOf('//');
    if (at < 0) return line;
    if (at > 0 && line[at - 1] === ':') return line; // http:// 는 주석이 아니다
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

/** 여는 태그의 끝 — 중괄호 안의 화살표(=>)와 문자열 안의 꺾쇠는 끝이 아니다 */
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

/** 이 여는 태그의 className 값(없으면 null) — classNameChunks 와 같은 모양들을 읽는다 */
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

/**
 * **조건 없이 늘 붙는** 토큰만 꺼낸다(329).
 * 조건부 색(삼항·논리곱)은 "무엇이 깔릴지 모른다" 는 뜻이라 물려주지 않는다 — 모르는 것을
 * 흰색이라고 가정하면 거짓 경보가 된다(326~328 이 세 번 겪은 종류다).
 */
function fixedTokens(raw) {
  if (raw === null) return [];
  const plain = raw.replace(/\$\{[\s\S]*?\}/g, ' ').replace(new RegExp(QUOTED.source, 'g'), ' ');
  return plain.split(/\s+/).filter(Boolean);
}

/** 조건부로 배경이 바뀔 수 있는 자리인가 — 그렇다면 물려받기를 멈춘다 */
function hasConditionalBg(raw) {
  if (raw === null) return false;
  const fixed = new Set(fixedTokens(raw));
  return branches(raw).some(chunk => chunk.split(/\s+/).some(t => {
    if (fixed.has(t)) return false;
    const c = colorToken(t);
    return Boolean(c && c.kind === 'bg');
  }));
}

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'source', 'track', 'use', 'path', 'circle', 'rect', 'line']);

/** 아이콘만 들었는가 — 첫 닫는 태그까지 글자도 보간도 없으면 그림으로 본다 */
function iconOnly(body, name) {
  const close = body.indexOf('</' + name + '>');
  const inner = close < 0 ? body : body.slice(0, close);
  if (inner.includes('{')) return false; // 보간은 글자일 수 있다
  const stripped = inner.replace(/<[^>]*>/g, ' ');
  return !/[A-Za-z0-9가-힣]/.test(stripped);
}

/**
 * 이 아이콘이 **조작부의 이름 역할**을 하는가(④).
 * 가장 가까운 조작부 조상(자기 포함)을 찾아, 그 조작부의 내용이 **아이콘뿐**이면 참이다 —
 * 그때 아이콘이 안 보이면 단추가 무엇인지 알 수 없다. 글자가 함께 있으면 글자가 뜻을 전하므로
 * 그 아이콘은 장식이고 1.4.11 밖이다. 조작부 밖의 아이콘(빈 상태 그림)도 밖이다.
 */
function iconLabelsControl(src, node, stack) {
  const ctrl = node.interactive ? node : [...stack].reverse().find(a => a.interactive);
  if (!ctrl) return false;
  const body = src.slice(ctrl.bodyStart, Math.min(src.length, ctrl.bodyStart + 800));
  return iconOnly(body, ctrl.name);
}
/**
 * 조상의 배경색을 물려받아 글자색과 짝짓는다 (329, 325~327 리뷰 M-3).
 *
 * 왜: 같은 className 안에만 있는 짝을 보면 **가장 흔한 모양을 놓친다** — 카드가 bg-blue-600 을 깔고
 * 그 안의 p 가 text-blue-100 만 쓰는 모양이다. 328 은 그런 자리 넷(업데이트 띠 본문 4.24:1,
 * 공지 띠 3.81·3.27)을 **가드 밖에서 손으로** 찾아 고쳤다 — 가드가 못 보면 다음에 또 들어온다.
 *
 * 어떻게: 여는 태그와 닫는 태그로 얕은 나무를 만들고, 각 요소에서 **조건 없이 늘 붙는** 글자색을
 * 가장 가까운 조상(자기 포함)의 **조건 없는** 배경색과 짝짓는다. 중간에 조건부 배경이 있으면 멈춘다.
 *
 * 거짓 경보를 막는 네 가지:
 *  ① **조건부 색은 물려주지 않는다**(무엇이 깔릴지 모르는 것을 흰색으로 가정하지 않는다).
 *  ② **자기 배경이 있으면 건너뛴다** — 그 짝은 같은 className 안에서 이미 본다(중복 신고 금지).
 *  ③ **조상이 아무 배경도 깔지 않았으면 흰 바닥으로 본다**. 이 앱의 바닥은 흰색·gray-50 이고 흰쪽이
 *     대비가 더 **좋은** 쪽이라, 이 가정은 놓치는 방향으로만 틀린다(없는 위반을 만들지 않는다).
 *  ④ **아이콘은 "아이콘만 든 조작부" 일 때만 3:1 로 본다**(WCAG 1.4.11). 1.4.11 은 "내용을 이해하는 데
 *     필요한" 그림만 보므로 **장식 아이콘은 밖이다** — 빈 상태 그림(제품 없음 위의 상자 그림)과
 *     글자 옆 꺾쇠는 옆의 글자가 뜻을 전한다. 처음 돌렸을 때 그 장식까지 신고해 스물 몇 건이
 *     거짓 경보였다. 아이콘이 **조작부의 유일한 내용**일 때만(= 그 단추의 이름 역할을 할 때만) 센다.
 */
function inheritedProblems(file, text) {
  const src = blankComments(text);
  const out = [];
  const stack = [];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] !== '<') continue;
    if (src[i + 1] === '/') { // 닫는 태그
      const gt = src.indexOf('>', i + 2);
      if (gt < 0) break;
      const name = src.slice(i + 2, gt).trim();
      for (let k = stack.length - 1; k >= 0; k -= 1) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      i = gt;
      continue;
    }
    const m = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(src.slice(i, i + 60));
    if (!m) continue;
    const end = openTagEnd(src, i);
    if (end < 0) break;
    const tag = src.slice(i, end + 1);
    const name = m[1];
    const raw = tagClassName(tag);
    const selfClosing = /\/\s*>$/.test(tag) || VOID_TAGS.has(name);
    const interactive = /onClick=|onKeyDown=|onPointerDown=|href=/.test(tag) || name === 'button' || name === 'a' || name === 'Link';
    const node = { name, raw, tokens: fixedTokens(raw), interactive, bodyStart: end + 1 };

    const colors = node.tokens.map(colorToken).filter(Boolean);
    const ownBg = colors.some(c => c.kind === 'bg' && c.state === 'base');
    const fgTok = colors.find(c => c.kind === 'text' && c.state === 'base');
    const off = node.tokens.some(t => t === 'cursor-not-allowed' || t.startsWith('disabled:'));

    if (fgTok && !ownBg && !off) {
      // 329 정정: 처음에는 "조상에 배경이 없으면 흰 바닥" 으로 봤는데 **그 가정이 틀렸다** —
      // 배경은 대개 **다른 파일의 부모**가 깐다(어드민은 어두운 테마라 text-white 를 1.00:1 로 신고했다).
      // 거짓 경보 202건 중 거의 전부가 그 종류였다. 같은 파일에 **실제로 선언된** 배경만 짝짓는다.
      let bg = null;
      let bgName = '';
      let unknown = true;
      for (let k = stack.length - 1; k >= 0; k -= 1) {
        const anc = stack[k];
        if (anc.tokens.some(t => t === 'cursor-not-allowed' || t.startsWith('disabled:'))) { unknown = true; break; }
        const ancBg = anc.tokens.map(colorToken).find(c => c && c.kind === 'bg' && c.state === 'base');
        if (ancBg) {
          const hex = tokenHex(ancBg);
          if (hex) { bg = hex; bgName = anc.name + ' 의 ' + tokenName(ancBg); unknown = false; }
          break;
        }
        if (hasConditionalBg(anc.raw)) { unknown = true; break; } // ①
      }
      const fg = tokenHex(fgTok);
      if (!unknown && bg && fg) {
        const body = selfClosing ? '' : src.slice(end + 1, Math.min(src.length, end + 400));
        const isIcon = selfClosing || iconOnly(body, name);
        const need = isLargeText(node.tokens) || isIcon ? MIN_LARGE : MIN_NORMAL;
        const ratio = contrast(fg, bg);
        // ④ 장식 아이콘은 기준 밖 — 아이콘만 든 조작부의 아이콘만 센다
        const counted = !isIcon || iconLabelsControl(src, node, stack);
        if (counted && ratio < need) {
          out.push({
            file, line: src.slice(0, i).split('\n').length, token: bgName,
            fg: tokenName(fgTok), ratio: ratio.toFixed(2), need: need.toFixed(1),
          });
        }
      }
    }
    if (!selfClosing) stack.push(node);
    i = end;
  }
  return out;
}

export function contrastProblems(files) {
  const problems = [];
  for (const { file, text } of files) {
    for (const { line, raw } of classNameChunks(text)) {
      for (const chunk of branches(raw)) {
        const tokens = chunk.split(/\s+/).filter(Boolean);
        // ④ 꺼진 조작부는 기준에서 빠진다
        if (tokens.some(t => t === 'cursor-not-allowed' || t.startsWith('disabled:'))) continue;
        const need = isLargeText(tokens) ? MIN_LARGE : MIN_NORMAL;
        for (const pair of statePairs(tokens)) {
          const ratio = contrast(pair.fg, pair.bg);
          if (ratio >= need) continue;
          problems.push({
            file, line, token: pair.bgName,
            fg: pair.fgName === 'text-white' ? '흰 글자' : pair.fgName === 'text-black' ? '검은 글자' : `${pair.fgName} 글자`,
            ratio: ratio.toFixed(2),
            need: need.toFixed(1),
          });
        }
      }
    }
    // 329: 같은 className 밖 — 부모가 깔고 자식이 글자색만 쓰는 모양(리뷰 M-3)
    problems.push(...inheritedProblems(file, text));
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
  const run = text => contrastProblems([{ file: 'x.tsx', text }]);

  // 팔레트 — 328(리뷰 H-1): 이 프로젝트의 `gray-400` 은 `#6b7280` 이라 흰 배경에서 **통과**한다
  ok('프로젝트 팔레트를 읽는다(gray-400 = gray-500)', run('<p className="bg-white text-gray-400 text-xs">결과</p>').length === 0);
  ok('재정의가 실제로 반영된다', paletteHex('gray', '400') === '#6b7280');
  ok('진짜 흐린 회색은 잡는다', run('<p className="bg-white text-gray-300 text-xs">결과</p>').length === 1);

  ok('흰 글자 + 흐린 배경을 잡는다', run('<div className="bg-amber-500 text-white">경고</div>').length === 1);
  ok('기준을 넘는 배경은 통과', run('<div className="bg-amber-700 text-white">경고</div>').length === 0);
  ok('호버 상태도 본다', run('<button className="bg-blue-600 hover:bg-blue-500 text-white">저장</button>').length === 1);
  ok('호버가 더 진하면 통과', run('<button className="bg-blue-600 hover:bg-blue-700 text-white">저장</button>').length === 0);
  // ① 가지 쪼개기
  ok('삼항의 다른 가지를 섞지 않는다', run("<button className={`${on ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600'}`}>x</button>").length === 0);
  ok('같은 가지 안이면 잡는다', run("<button className={`${on ? 'bg-amber-500 text-white' : 'bg-white text-gray-600'}`}>x</button>").length === 1);
  // ② 상태별 짝짓기
  ok('호버에서 글자도 바뀌면 그 짝으로 본다', run('<button className="p-1 text-gray-300 hover:text-gray-700 hover:bg-gray-50">x</button>').length === 0);
  ok('호버 글자색이 없으면 기본 글자색과 짝짓는다', run('<button className="text-white bg-blue-600 hover:bg-blue-500">저장</button>').length === 1);
  ok('임의 값 호버 글자색을 읽는다', run('<button className="text-gray-300 hover:text-[#1a3a8f] hover:bg-gray-100">x</button>').length === 0);
  ok('호버에서 흰 글자로 바뀌면 통과', run('<button className="text-slate-400 hover:text-white hover:bg-slate-700">x</button>').length === 0);
  // ③ 큰 글자 — 이 프로젝트의 text-lg 는 17px 라 굵어도 큰 글자가 아니다(리뷰 L-1)
  ok('text-lg + 굵게는 큰 글자가 아니다(17px)', run('<p className="bg-amber-600 text-white text-lg font-bold">제목</p>').length === 1);
  ok('text-3xl 은 큰 글자다', run('<p className="bg-amber-600 text-white text-3xl">제목</p>').length === 0);
  ok('큰 글자여도 3:1 미만은 잡는다', run('<p className="bg-amber-500 text-white text-3xl">제목</p>').length === 1);
  // ④ 꺼진 조작부
  ok('꺼진 단추는 면제', run('<button className="bg-gray-100 text-gray-300 cursor-not-allowed">저장</button>').length === 0);
  ok('disabled: 변형도 면제', run('<button className="bg-gray-100 text-gray-300 disabled:opacity-50">저장</button>').length === 0);
  ok('꺼진 단추가 아니면 본다', run('<button className="bg-gray-100 text-gray-300">저장</button>').length === 1);
  // 328(리뷰 H-2): clsx·cn·삼항·중괄호 문자열도 읽는다
  ok('clsx 안의 문자열을 읽는다', run('<div className={clsx("absolute", "text-white bg-blue-500 text-xs")} />').length === 1);
  ok('cn 안의 문자열을 읽는다', run('<div className={cn("text-white bg-blue-500 text-xs", other)} />').length === 1);
  ok('중괄호 안 삼항도 읽는다', run('<div className={on ? "text-white bg-blue-500 text-xs" : "text-gray-700"} />').length === 1);
  ok('중괄호 안 단일 문자열도 읽는다', run("<div className={'text-white bg-blue-500 text-xs'} />").length === 1);
  ok('변수만 있으면 아무것도 세지 않는다', run('<div className={styles.row} />').length === 0);
  // 328(리뷰 H-3): 그라디언트는 양 끝을 본다
  ok('그라디언트 양 끝을 본다', run('<div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm">알림</div>').length === 2);
  ok('그라디언트가 둘 다 진하면 통과', run('<div className="bg-gradient-to-r from-emerald-700 to-emerald-800 text-white text-sm">알림</div>').length === 0);
  ok('글자 색이 없으면 보지 않는다', run('<span className="w-3 h-3 bg-amber-500 rounded-full" />').length === 0);
  ok('팔레트에 없는 색은 건너뛴다', run('<div className="bg-nosuch-500 text-white">x</div>').length === 0);
  ok('검은 글자도 본다', run('<div className="bg-slate-900 text-black">x</div>').length === 1);

  // 329(325~327 리뷰 M-3): 부모가 깔고 자식이 글자색만 쓰는 모양 — 328 이 "가장 큰 구멍" 이라 적은 자리
  ok('부모 배경 + 자식 글자색을 짝짓는다', run('<div className="bg-blue-600 p-3"><p className="text-xs text-blue-100">안내</p></div>').length === 1);
  ok('부모 배경에 진한 글자면 통과', run('<div className="bg-blue-600 p-3"><p className="text-xs text-blue-50">안내</p></div>').length === 0);
  ok('조상 배경을 두 단 건너도 찾는다', run('<div className="bg-blue-600"><div className="p-3"><p className="text-xs text-blue-100">안내</p></div></div>').length === 1);
  ok('닫는 태그 뒤 형제는 물려받지 않는다', run('<div><div className="bg-blue-600" /><p className="text-xs text-blue-100">안내</p></div>').length === 0);
  // ① 조건부 배경은 물려주지 않는다 — 무엇이 깔릴지 모르는 것을 흰색으로 가정하면 거짓 경보가 된다
  ok('조건부 배경이면 멈춘다', run('<div className={on ? "bg-blue-600" : "bg-white"}><p className="text-xs text-blue-100">안내</p></div>').length === 0);
  // ② 자기 배경이 있으면 같은 className 안에서 이미 본다(중복 신고 금지)
  ok('자기 배경은 중복 신고하지 않는다', run('<div className="bg-blue-600"><p className="bg-amber-500 text-white text-xs">경고</p></div>').length === 1);
  // ③ 조상에 배경이 없으면 아무것도 세지 않는다 — 배경은 대개 **다른 파일의 부모**가 깐다(329 정정)
  ok('조상에 배경이 없으면 세지 않는다', run('<div className="p-3"><p className="text-xs text-gray-200">안내</p></div>').length === 0);
  // ④ 아이콘은 "아이콘만 든 조작부" 일 때만 — 장식 아이콘은 WCAG 1.4.11 밖이다
  ok('아이콘만 든 단추의 아이콘은 센다', run('<div className="bg-white"><button aria-label="닫기" onClick={close}><X className="text-gray-300" /></button></div>').length === 1);
  ok('글자 옆 아이콘은 장식으로 본다', run('<div className="bg-white"><button onClick={go}><X className="text-gray-300" /> 닫기</button></div>').length === 0);
  ok('조작부 밖의 아이콘은 장식으로 본다', run('<div className="bg-white"><span><X className="text-gray-300" /></span></div>').length === 0);
  ok('아이콘 단추도 3:1 을 넘으면 통과', run('<div className="bg-white"><button aria-label="닫기" onClick={close}><X className="text-gray-400" /></button></div>').length === 0);
  // 꺼진 조작부는 물려받기에서도 면제
  ok('꺼진 조작부는 물려받기에서도 면제', run('<div className="bg-blue-600"><p className="text-xs text-blue-100 cursor-not-allowed">안내</p></div>').length === 0);

  console.log('[check-contrast] selftest OK — 덫(프로젝트 팔레트 3종·흐린/진한 배경·호버 2종·가지 쪼개기 2종·상태별 짝짓기 4종·큰 글자 3종·꺼진 조작부 4종·className 모양 5종·그라디언트 2종·글자색 없음·팔레트 밖·검은 글자·물려받기 6종·아이콘 4종) 통과');
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const files = listFiles(SRC).map(full => ({
  file: path.relative(ROOT, full).replace(/\\/g, '/'),
  text: fs.readFileSync(full, 'utf8'),
}));
const found = contrastProblems(files);
const key = p => `${p.file}:${p.line}:${p.token}`;
const unexpected = found.filter(p => !ALLOWED.some(a => a.file === p.file && a.line === p.line && a.token === p.token));
const stale = ALLOWED.filter(a => !found.some(p => p.file === a.file && p.line === a.line && p.token === a.token));

if (unexpected.length > 0 || stale.length > 0) {
  if (unexpected.length > 0) {
    console.error(`[check-contrast] 글자 대비가 기준에 못 미치는 자리 ${unexpected.length}개:`);
    for (const p of unexpected) console.error(`  - ${key(p)}  ${p.fg} 대비 ${p.ratio}:1 (기준 ${p.need}:1)`);
    console.error('  → 배경을 한 단 진한 색으로 올리세요(색 계열은 그대로 — 초록=성공, 주황=경고의 뜻이 바뀌면 안 됩니다).');
  }
  if (stale.length > 0) {
    console.error(`[check-contrast] ALLOWED 가 낡았다 — 이미 고쳐졌거나 사라진 자리 ${stale.length}개: ${stale.map(key).join(', ')}`);
  }
  process.exit(1);
}
console.log(`[check-contrast] OK — **이 가드가 보는 범위**(같은 className 가지 + 같은 파일 안 부모 배경)에서 기준 미달 0자리(사유를 적어 둔 자리 ${ALLOWED.length}개). **다른 파일의 부모가 깐 배경**과 투명도 표기는 보지 않는다 — 머리말의 한계를 보세요`);
