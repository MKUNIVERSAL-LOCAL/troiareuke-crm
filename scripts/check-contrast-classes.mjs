#!/usr/bin/env node
/**
 * 글자 대비 가드 (326) — `npm run check:contrast`
 *
 * 왜: 325 가 **성공 토스트의 대비 3.77:1**(경고 토스트는 2.15:1)을 찾았는데, 그것이 잡힌 것은
 *     **운이었다** — 캠페인 창을 열 때 토스트가 떠 있었다. 접근성 쓸이(axe)는 **그 순간 화면에 있는
 *     것만** 본다. 토스트는 스캔 전에 치워지고(`dismissToasts`), 본사 공지 띠는 서버 공지가 있어야 뜨고,
 *     업데이트 띠는 새 버전이 있어야 뜬다 — 지점이 매일 보는 자리인데 **구조적으로 측정되지 않는다**.
 *     그래서 화면을 그리지 않고 **소스에서** 센다: 같은 className 가지 안의 **글자색 × 배경색**을 Tailwind
 *     팔레트로 계산해 기준 미만이면 실패한다(`text-white`·`text-black` 뿐 아니라 **327 부터 `text-<색>-<단계>` 도** —
 *     작은 회색 글이 흐린 회색 배경에 얹힌 자리가 거기 있었다).
 *
 * 326 측정: 처음 돌렸을 때 **18자리**가 걸렸고 **전부 진짜였다**(단추·배지·띠·글자 아바타 — 글자 아바타는
 *     1.47:1 이었다). 호버 상태까지 보면 15자리가 더 있었다(어드민 기본 단추의 `hover:bg-blue-500`).
 *     전부 한 단 진한 색으로 올려 지금 0자리다. 거짓 경보 0 — 아래 세 장치 덕이다.
 * 327 측정(색 글자 × 색 배경): **15자리**. 읽어야 하는 글이 흐린 자리가 13 — 발송 결과 문구 2.43:1 ·
 *     오류 상자 여섯 자리 4.41:1 · 온보딩 단계 번호 2.31:1 · "결제 기능 준비 중" 3.90:1 · 대기 배지와 지난
 *     날짜 칩 4.39:1 · "네이버 예약 (준비 중)" 2.43:1. 나머지 둘은 **꺼진 단추**(`cursor-not-allowed`)라
 *     WCAG 1.4.3 이 면제하는 자리고, 그래서 ③ 을 넣었다.
 *
 * 거짓 경보를 막는 세 가지:
 *  ① **가지 쪼개기**: `${on ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600'}` 는 **두 가지**다.
 *     한 문자열로 보면 `bg-gray-50 + text-white`(1.05:1)처럼 **없는 조합**을 신고한다(첫 시도에서 68자리
 *     중 50자리가 그 종류였다). 보간 안의 따옴표 문자열은 각각 다른 가지로 본다.
 *  ③ **꺼진 조작부는 면제**: WCAG 1.4.3 은 "비활성 사용자 인터페이스 구성요소" 를 기준에서 뺀다.
 *     `cursor-not-allowed`·`disabled`·`aria-disabled` 가 같은 가지에 있으면 보지 않는다 — 꺼진 단추를
 *     진하게 만들면 **켜진 것처럼 보여** 오히려 거짓이 된다(그 자리는 지금 둘뿐이다).
 *  ② **큰 글자는 3:1**: WCAG 1.4.3 은 24px 이상(또는 18.66px 이상 굵게)에 3:1 을 허용한다.
 *     `text-xl` 이상(또는 `text-lg`+`font-bold`)이면 3:1 로 본다 — 기준을 넘겨 적어 거짓 실패를 만들지 않는다.
 *
 * 한계(정직하게): 소스의 **클래스 이름만** 본다. 인라인 `style`·CSS 변수·이미지 위의 글자·투명도(`/80`)가
 *     섞인 색은 보지 않는다. 그쪽은 axe 쓸이(a11y*.spec)가 실제 화면에서 본다 — 둘은 서로를 메운다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import colors from 'tailwindcss/colors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

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
  const fam = colors[family];
  if (!fam || typeof fam !== 'object') return null;
  const hex = fam[shade];
  return typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null;
}

/** className 한 자리를 **가지**로 쪼갠다(①) */
function branches(cls) {
  const quoted = [...cls.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]);
  return [cls.replace(/\$\{[\s\S]*?\}/g, ' '), ...quoted];
}

/** 이 가지의 글자가 WCAG 기준에서 "큰 글자" 인가(②) */
function isLargeText(tokens) {
  if (tokens.some(t => /^(?:text-(?:xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl))$/.test(t))) return true;
  return tokens.includes('text-lg') && tokens.some(t => t === 'font-bold' || t === 'font-extrabold' || t === 'font-black');
}

/** 상태별 색 — Tailwind 변형 접두어를 상태 이름으로 본다(기본 상태는 접두어 없음) */
const STATES = ['base', 'hover', 'focus', 'focus-visible', 'active'];

/**
 * 토큰에서 상태·종류·색을 꺼낸다 — `hover:bg-red-50` 와 `hover:text-[#1a3a8f]` 둘 다 읽는다.
 * 327: 임의 값(`[#rrggbb]`)을 못 읽으면 그 상태에 글자색이 **없는 것으로 보여** 기본 글자색과 짝지어진다
 * (`text-gray-300 hover:text-[#1a3a8f] hover:bg-gray-100` 이 1.34:1 로 신고됐다 — 거짓 경보 셋).
 */
function colorToken(token) {
  // 327 정정: `white`·`black` 은 단계 숫자가 없다 — 빼먹어서 `hover:text-white` 를 못 읽었고,
  // 그러면 "호버에 글자색이 없다" 로 보여 **기본 글자색과 짝지어** 이미 고친 자리를 계속 신고했다.
  const m = /^(?:(hover|focus|focus-visible|active):)?(bg|text)-(?:([a-z]+)-(\d{2,3})|(white|black)|\[(#[0-9a-fA-F]{6})\])$/.exec(token);
  if (!m) return null;
  const named = m[5] === 'white' ? '#ffffff' : (m[5] === 'black' ? '#000000' : null);
  return {
    state: m[1] || 'base',
    kind: m[2],
    family: m[3],
    shade: m[4],
    named: m[5] || null,
    literal: m[6] ? m[6].toLowerCase() : named,
  };
}

/** 토큰이 가리키는 색 — 팔레트 또는 임의 값 */
function tokenHex(c) {
  return c.literal ? c.literal : paletteHex(c.family, c.shade);
}

/** 사람이 읽을 이름 */
function tokenName(c, kind) {
  const prefix = c.state === 'base' ? '' : `${c.state}:`;
  const body = c.named ? c.named : (c.family ? `${c.family}-${c.shade}` : `[${c.literal}]`);
  return `${prefix}${kind}-${body}`;
}

/**
 * 한 가지(chunk) 안에서 **상태마다** 글자색·배경색을 모아 짝짓는다 (327).
 *
 * 왜 상태별인가: `text-gray-300 hover:text-red-600 hover:bg-red-50` 은 마우스를 올리면 **글자와 배경이
 * 함께** 바뀐다. 기본 글자색을 호버 배경과 짝지으면 1.35:1 같은 **없는 조합**을 신고한다(327 에서 그
 * 거짓 경보 넷을 실제로 만들었다). 상태에 글자색이 없으면 기본 글자색이 그대로 쓰인다.
 */
function statePairs(tokens) {
  const byState = new Map();
  for (const t of tokens) {
    const c = colorToken(t);
    if (!c) continue;
    const slot = byState.get(c.state) || {};
    slot[c.kind] = c;
    byState.set(c.state, slot);
  }
  const baseText = byState.get('base')?.text;
  const baseFg = baseText ? tokenHex(baseText) : null;
  const baseFgName = baseText ? tokenName(baseText, 'text') : null;

  const out = [];
  for (const state of STATES) {
    const slot = byState.get(state);
    if (!slot?.bg) continue;
    const bg = tokenHex(slot.bg);
    if (!bg) continue;
    const fgTok = slot.text || baseText;
    const fg = fgTok ? tokenHex(fgTok) : baseFg;
    const fgName = fgTok ? tokenName(fgTok, 'text') : baseFgName;
    if (!fg || !fgName) continue;
    out.push({ state, fg, fgName, bg, bgName: tokenName(slot.bg, 'bg') });
  }
  return out;
}

export function contrastProblems(files) {
  const problems = [];
  for (const { file, text } of files) {
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([\s\S]*?)`\})/g)) {
      const cls = m[1] ?? m[2] ?? '';
      const line = text.slice(0, m.index).split('\n').length;
      for (const chunk of branches(cls)) {
        const tokens = chunk.split(/\s+/).filter(Boolean);
        // ③ 꺼진 조작부는 기준에서 빠진다(327)
        if (tokens.some(t => t === 'cursor-not-allowed' || t === 'disabled' || t === 'aria-disabled')) continue;
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

  ok('흰 글자 + 흐린 배경을 잡는다', run('<div className="bg-amber-500 text-white">경고</div>').length === 1);
  ok('기준을 넘는 배경은 통과', run('<div className="bg-amber-700 text-white">경고</div>').length === 0);
  ok('호버 상태도 본다', run('<button className="bg-blue-600 hover:bg-blue-500 text-white">저장</button>').length === 1);
  ok('호버가 더 진하면 통과', run('<button className="bg-blue-600 hover:bg-blue-700 text-white">저장</button>').length === 0);
  // ① 가지 쪼개기 — 첫 시도에서 68자리 중 50자리가 이 거짓 경보였다
  ok('삼항의 다른 가지를 섞지 않는다', run("<button className={`${on ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600'}`}>x</button>").length === 0);
  ok('같은 가지 안이면 잡는다', run("<button className={`${on ? 'bg-amber-500 text-white' : 'bg-white text-gray-600'}`}>x</button>").length === 1);
  // ② 큰 글자는 3:1
  ok('큰 글자는 3:1 로 본다', run('<p className="bg-amber-600 text-white text-2xl">큰 글자</p>').length === 0);
  ok('큰 글자여도 3:1 미만은 잡는다', run('<p className="bg-amber-500 text-white text-2xl">큰 글자</p>').length === 1);
  ok('text-lg 는 굵을 때만 큰 글자', run('<p className="bg-amber-600 text-white text-lg">보통</p>').length === 1);
  ok('text-lg + 굵게는 큰 글자', run('<p className="bg-amber-600 text-white text-lg font-bold">큰 글자</p>').length === 0);
  // 글자 색이 없으면 배경만으로는 판정하지 않는다(점·막대·토글 손잡이)
  ok('글자 색이 없으면 보지 않는다', run('<span className="w-3 h-3 bg-amber-500 rounded-full" />').length === 0);
  ok('팔레트에 없는 색은 건너뛴다', run('<div className="bg-brand-500 text-white">x</div>').length === 0);
  ok('검은 글자도 본다', run('<div className="bg-slate-900 text-black">x</div>').length === 1);
  // 327: 색 글자 × 색 배경
  ok('흐린 회색 글자를 잡는다', run('<p className="bg-gray-50 text-gray-400 text-xs">결과</p>').length === 1);
  ok('진한 회색 글자는 통과', run('<p className="bg-gray-50 text-gray-600 text-xs">결과</p>').length === 0);
  ok('오류 상자의 빨간 글자(4.41)를 잡는다', run('<p className="bg-red-50 text-red-600 text-sm">오류</p>').length === 1);
  ok('red-700 은 통과', run('<p className="bg-red-50 text-red-700 text-sm">오류</p>').length === 0);
  // ③ 꺼진 단추는 면제 — 진하게 만들면 켜진 것처럼 보인다
  ok('꺼진 단추는 면제', run('<button className="bg-gray-100 text-gray-400 cursor-not-allowed">저장</button>').length === 0);
  ok('꺼진 단추가 아니면 본다', run('<button className="bg-gray-100 text-gray-400">저장</button>').length === 1);
  // 327: 상태별 짝짓기 — 호버에서 글자와 배경이 **함께** 바뀌는 자리(실제로 거짓 경보 넷을 냈다)
  ok('호버에서 글자도 바뀌면 그 짝으로 본다', run('<button className="p-1 text-gray-300 hover:text-gray-700 hover:bg-gray-50">x</button>').length === 0);
  ok('호버 글자색이 없으면 기본 글자색과 짝짓는다', run('<button className="text-white bg-blue-600 hover:bg-blue-500">저장</button>').length === 1);
  ok('호버 글자색이 흐리면 잡는다', run('<button className="text-gray-700 hover:text-gray-300 hover:bg-gray-50">x</button>').length === 1);
  // 327: 임의 값 색도 읽는다(못 읽으면 기본 글자색과 짝지어 거짓 경보가 난다)
  ok('임의 값 호버 글자색을 읽는다', run('<button className="text-gray-300 hover:text-[#1a3a8f] hover:bg-gray-100">x</button>').length === 0);
  ok('임의 값 배경도 본다', run('<div className="bg-[#f59e0b] text-white">경고</div>').length === 1);
  // 327 자기 버그: `hover:text-white` 는 단계 숫자가 없어 못 읽혔고, 그래서 **이미 고친 자리**를 계속 신고했다
  ok('호버에서 흰 글자로 바뀌면 통과', run('<button className="text-slate-400 hover:text-white hover:bg-slate-700">x</button>').length === 0);
  ok('호버 배경이 흰색이어도 본다', run('<button className="text-white hover:bg-white">x</button>').length === 1);

  console.log('[check-contrast] selftest OK — 덫(흐린 배경·진한 배경·호버 2종·삼항 가지 2종·큰 글자 4종·글자 색 없음·팔레트 밖·검은 글자·흐린 회색·진한 회색·빨간 오류 2종·꺼진 단추 2종·상태별 짝짓기 3종·임의 값 2종·이름 색 2종) 통과');
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
console.log(`[check-contrast] OK — className 에 적힌 글자색 × 배경색 조합 전부 기준(보통 4.5:1·큰 글자 3:1) 이상(사유를 적어 둔 자리 ${ALLOWED.length}개)`);
