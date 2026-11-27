#!/usr/bin/env node
/**
 * 글자 대비 가드 (326·327, 328 에서 **팔레트·사정거리 전면 수정**) — `npm run check:contrast`
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
 * 한계(정직하게, 328 에서 다시 썼다):
 *  - **글자색과 배경색이 부모·자식으로 갈라져 있으면 짝짓지 못한다**. 이것이 가장 큰 구멍이다(리뷰 M-3).
 *  - 투명도 표기(`text-white/70`·`bg-amber-500/80`)·인라인 `style`·CSS 변수·이미지 위의 글자는 보지 않는다.
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

  console.log('[check-contrast] selftest OK — 덫(프로젝트 팔레트 3종·흐린/진한 배경·호버 2종·가지 쪼개기 2종·상태별 짝짓기 4종·큰 글자 3종·꺼진 조작부 3종·className 모양 5종·그라디언트 2종·글자색 없음·팔레트 밖·검은 글자) 통과');
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
console.log(`[check-contrast] OK — **이 가드가 보는 범위**(같은 className 가지의 글자색 × 배경색)에서 기준 미달 0자리(사유를 적어 둔 자리 ${ALLOWED.length}개). 부모·자식으로 갈라진 색과 투명도는 보지 않는다 — 머리말의 한계를 보세요`);
