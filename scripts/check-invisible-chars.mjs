#!/usr/bin/env node
/**
 * 보이지 않는 글자 가드 (332·337·342·345·347) — `npm run check:invisible`
 *
 * 왜: 331 이 "설명되지 않는 가드 동작" 이라고 기록한 자리의 정체가 **보이지 않는 제어문자**였다.
 *     정규식 수정을 셸의 `node -e` 로 지나게 했더니 백슬래시가 문자열 이스케이프로 해석돼
 *     **실제 백스페이스 바이트(0x08)** 가 소스에 박혔다. 그 정규식은 영원히 매치되지 않으므로
 *     "인라인 svg 도 아이콘으로 본다" 는 수정이 **두 번 조용히 죽었다** — 가드는 그 자리를 계속
 *     글자로 재고, 나는 원인을 못 찾아 "설명하지 못했다" 고 적었다(331 기록). 사람 눈에 보이지
 *     않는 결함은 기계가 잡아야 한다.
 *
 * 보는 것: **저장소 전체**의 글 파일(확장자로 고른다)에서 탭·줄바꿈 말고는 금지다 —
 *     C0 제어문자(0x00~0x1F)·DEL(0x7F)·폭 없는 글자(U+00AD·U+200B~U+200D·U+FEFF)를 신고한다.
 *     폭 없는 글자는 복사·붙여넣기로 들어와 선택자·정규식·클래스 이름을 조용히 깨뜨린다.
 *     **맨 앞 BOM 만 예외**다 — 이 저장소의 여러 파일이 그렇게 저장돼 있고 해롭지 않다.
 *     중간에 있는 BOM 은 사고다(실제로 `Customers/index.tsx` 4줄 머리에 하나 박혀 있었다).
 *     **이모지 사이의 ZWJ(U+200D)도 예외**다(342) — `👨‍⚕️` 처럼 그림문자를 잇는 정상 쓰임이다.
 *     앞뒤가 그림문자가 아닌 ZWJ 는 그대로 신고한다.
 *     **345 에서 집합을 넓혔다**: U+2060(단어 결합자 — U+200B 처럼 선택자·정규식을 깨뜨린다)·
 *     U+2028/2029(줄·단락 구분자 — JS 문자열 안에서 줄바꿈이 되어 **구문을 깨뜨린다**)·
 *     U+200E/200F·U+061C(쌍방향 표시)·U+180E·U+FFFC·태그 문자(U+E0000~E007F).
 *     머리말이 "폭 없는 글자" 를 포괄적으로 말하는데 집합은 다섯 개뿐이었다(341~343 리뷰 L-2).
 *     전수 스캔(562파일)에서 실재하는 것은 U+2028·U+2029 각 1건이고 **정당한 쓰임**이라
 *     아래 `ALLOWED_SITES` 에 사유와 함께 적었다 — `server/src/server.js` 의 `jsonForScript()` 가
 *     스크립트에 JSON 을 박을 때 그 두 글자를 이스케이프로 **찾아 바꾸는** 코드다(XSS 방어).
 *
 * 범위의 역사:
 *     332 는 `src`·`scripts`·`e2e`·`server/src`·`docs` 만 봤다(503파일).
 *     337 은 `electron`·`.github`·`server/test`·`supabase`·루트 설정 여섯 개를 더했다(523파일) —
 *     334 까지는 "코어 잠금 파일이 많아서" 뺐는데 **잠금은 수정 금지이고 읽기는 막지 않는다**.
 *     342(335~340 리뷰 M-7)는 **목록을 뒤집었다**: 볼 폴더를 고르는 대신 **저장소 전체를 보고
 *     볼 필요가 없는 폴더만 뺀다**. 337 이 "일부러 안 보던 자리를 보게 넓혔다" 고 적었는데도
 *     확장자가 맞는 **36개 파일이 여전히 밖**이었다 — 그중에는 앱 진입점 `index.html`(340 이 재빌드
 *     판정에 쓴 파일), 모든 AI 세션의 규칙인 `CLAUDE.md`, 루트 `.sql` 네 개, `tsconfig*.json`,
 *     `server/package.json` 이 있었다. 고를 목록은 늘 낡는다.
 *
 * 한계: UTF-8 로 읽는 글 파일만 본다(확장자로 고른다). 바이너리·이미지는 보지 않는다.
 *     아래 `SKIP_ANYWHERE`(어디에 있어도 뺀다)·`SKIP_PATHS`(그 경로만 뺀다)는 빌드 산출물·의존성·보관본이다.
 *     잠금 파일에서 나오면 고치지 않고 `OWNER-APPROVAL-QUEUE.md` 에 적는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * 342: 볼 폴더를 고르지 않고 **볼 필요가 없는 폴더만** 뺀다 — 고를 목록은 늘 낡는다.
 * 345(리뷰 L-2): 이름이 아니라 **경로**로 뺀다 — 이름만 보면 `src/build/`·`server/src/dist/` 처럼
 * 같은 이름의 다른 폴더가 생겼을 때 **경고 없이** 검사 밖이 된다.
 * 어디에 있어도 빼는 것(의존성·버전관리·보관함)만 이름으로 남긴다.
 */
const SKIP_ANYWHERE = new Set(['node_modules', '.git', 'archive']);
const SKIP_PATHS = new Set([
  'dist', 'dist-e2e', 'dist-e2e-nas', 'dist-mobile', 'release', 'release-admin', 'release-portable',
  '.gate', 'coverage', 'test-results', 'playwright-report', 'build', '.next', '.vite', 'android',
  'ios/App/Pods', '.claude-flow',
]);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.yml', '.yaml', '.sql']);

/** 탭(09)·줄바꿈(0A)·복귀(0D)만 허용 */
const ALLOWED = new Set([9, 10, 13]);
const BOM = 0xfeff;
const ZWJ = 0x200d;
// 345: 폭 없는 글자·구문을 깨뜨리는 구분자·쌍방향 표시를 모두 본다(리뷰 L-2)
// 347(344~346 리뷰 L-2): **한글 채움 문자**가 빠져 있었다 — U+3164(HANGUL FILLER)·U+115F(초성 채움)·
// U+1160(중성 채움)·U+FFA0(반각 채움)은 폭 없이 보이지 않고 **한국어 환경에서 가장 섞여 들기 쉬운**
// 글자인데 머리말이 "폭 없는 글자" 를 통틀어 말하면서 집합에는 없었다(전수 스캔 0건이지만 넓혀 둔다).
// U+034F(결합용 그래핌 결합자)도 같은 종류다.
const ZERO_WIDTH = new Set([0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x180e, 0x200b, 0x200c, ZWJ, 0x200e, 0x200f, 0x2028, 0x2029, 0x2060, 0x3164, 0xffa0, 0xfffc, BOM]);
/** 태그 문자 — 눈에 보이지 않는데 글자 사이에 숨길 수 있다 */
const isTagChar = code => code >= 0xe0000 && code <= 0xe007f;

/**
 * 345: 정당한 쓰임만 **파일·줄·글자**로 면제한다. 사유를 반드시 적는다.
 * 넓힐 때 거짓 경보가 나는 자리가 하나 있었고, 그것은 보안 코드였다.
 */
const ALLOWED_SITES = [
  {
    file: 'server/src/server.js',
    line: 2106,
    code: 0x2028,
    why: 'jsonForScript() 가 스크립트에 박는 JSON 에서 이 글자를 \\u2028 로 바꾼다 — 찾을 글자이므로 리터럴이어야 한다(XSS 방어)',
  },
  {
    file: 'server/src/server.js',
    line: 2107,
    code: 0x2029,
    why: 'jsonForScript() 가 스크립트에 박는 JSON 에서 이 글자를 \\u2029 로 바꾼다 — 같은 이유',
  },
];

/** 그림문자이거나 그 꾸밈(이모지 변형 선택자·피부색 수정자)인가 — ZWJ 허용 판정에 쓴다 (342) */
const PICTO = /\p{Extended_Pictographic}/u;
function emojiish(ch) {
  if (ch === undefined) return false;
  const code = ch.codePointAt(0);
  // 345: 변형 선택자(U+FE0F·U+FE0E)는 눈에 보이지 않는 글자다 — 이 가드의 소스에 리터럴로 두지 않는다.
  // 347(리뷰 L-2): 다만 **집합에는 넣지 않는다** — 이 저장소에 42건이 있고 전부 이모지의 정당한 꾸밈이다
  // (그림문자 바로 뒤에 붙는 꾸밈이다). 넣으면 그 42건이 전부 거짓 경보가 되므로, 넣지 않는 이유를 적어 둔다.
  if (code === 0xfe0f || code === 0xfe0e) return true;
  if (/[\u{1F3FB}-\u{1F3FF}]/u.test(ch)) return true;
  return PICTO.test(ch);
}

/** 이 글에서 보이지 않는 글자를 찾는다 — [{line, col, code}]. 334: 파일 밖 호출자가 없어 export 를 뗐다 */
function invisibleChars(text) {
  const chars = [...text];
  const out = [];
  let line = 1;
  let col = 1;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const code = ch.codePointAt(0);
    if (i === 0 && code === BOM) { col += 1; continue; } // 맨 앞 BOM 은 허용
    if (code === 10) { line += 1; col = 1; continue; }
    // 342: 그림문자를 잇는 ZWJ 는 정상 쓰임(`👨‍⚕️`) — 앞뒤가 그림문자일 때만 넘긴다
    if (code === ZWJ && emojiish(chars[i - 1]) && emojiish(chars[i + 1])) { col += 1; continue; }
    if ((code < 32 && !ALLOWED.has(code)) || code === 127 || ZERO_WIDTH.has(code) || isTagChar(code)) {
      out.push({ line, col, code });
    }
    col += 1;
  }
  return out;
}

/** 저장소에서 볼 파일 — 상대 경로 문자열 (342) */
function collectFiles(dir = ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (SKIP_ANYWHERE.has(entry.name) || SKIP_PATHS.has(rel)) continue;
      collectFiles(full, out);
    } else if (EXT.has(path.extname(entry.name))) {
      out.push(rel);
    }
  }
  return out;
}

function selftest() {
  let trapCount = 0;
  const ok = (name, cond) => { trapCount += 1; if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };
  // 소스에 보이지 않는 글자를 두지 않는다(두면 이 가드가 자기 자신을 신고한다) — 코드로 만든다
  const ch = code => String.fromCharCode(code);

  ok('평범한 글은 통과', invisibleChars('const a = 1;\n\tconst b = 2;\r\n').length === 0);
  ok('한글은 통과', invisibleChars('가나다 ABC 123 · ✕ ₩').length === 0);
  ok('백스페이스를 잡는다(331 실사고)', invisibleChars('return /<svg' + ch(8) + '>/.test(x);').length === 1);
  ok('폼피드를 잡는다', invisibleChars('a' + ch(12) + 'b').length === 1);
  ok('널 문자를 잡는다', invisibleChars('a' + ch(0) + 'b').length === 1);
  ok('DEL 을 잡는다', invisibleChars('a' + ch(127) + 'b').length === 1);
  ok('폭 없는 공백을 잡는다', invisibleChars('text-' + ch(0x200b) + 'white').length === 1);
  ok('소프트 하이픈을 잡는다', invisibleChars('bg-' + ch(0x00ad) + 'blue-600').length === 1);
  ok('맨 앞 BOM 은 허용한다', invisibleChars(ch(BOM) + 'const a = 1;').length === 0);
  ok('중간 BOM 은 잡는다', invisibleChars('const a = 1;\n' + ch(BOM) + 'const b = 2;').length === 1);
  ok('줄·칸 번호를 센다', (() => {
    const hit = invisibleChars('a\nbb' + ch(8) + 'c')[0];
    return hit.line === 2 && hit.col === 3;
  })());
  ok('여러 개를 모두 센다', invisibleChars(ch(8) + 'a' + ch(8)).length === 2);
  // 342(리뷰 M-7): 이모지 ZWJ 는 허용, 글자 사이의 ZWJ 는 신고
  ok('이모지 사이 ZWJ 는 허용', invisibleChars(String.fromCodePoint(0x1f468) + ch(ZWJ) + String.fromCodePoint(0x2695, 0xfe0f) + ' 의사').length === 0);
  ok('글자 사이 ZWJ 는 잡는다', invisibleChars('text-' + ch(ZWJ) + 'white').length === 1);
  ok('한쪽만 이모지인 ZWJ 는 잡는다', invisibleChars('\u{1F468}' + ch(ZWJ) + 'a').length === 1);
  // 345(리뷰 L-2): 넓힌 글자들
  ok('단어 결합자(U+2060)를 잡는다', invisibleChars('text-' + ch(0x2060) + 'white').length === 1);
  ok('줄 구분자(U+2028)를 잡는다', invisibleChars('a' + ch(0x2028) + 'b').length === 1);
  ok('단락 구분자(U+2029)를 잡는다', invisibleChars('a' + ch(0x2029) + 'b').length === 1);
  ok('쌍방향 표시(U+200E·U+200F)를 잡는다', invisibleChars(ch(0x200e) + 'a' + ch(0x200f)).length === 2);
  ok('아랍 문자 표시(U+061C)를 잡는다', invisibleChars('a' + ch(0x061c)).length === 1);
  ok('몽골 모음 구분자(U+180E)를 잡는다', invisibleChars('a' + ch(0x180e)).length === 1);
  ok('대체 문자(U+FFFC)를 잡는다', invisibleChars('a' + ch(0xfffc)).length === 1);
  ok('태그 문자를 잡는다', invisibleChars('a' + String.fromCodePoint(0xe0041) + 'b').length === 1);
  // 347(리뷰 L-2): 한글 채움 문자 — 한국어 환경에서 가장 섞여 들기 쉬운 보이지 않는 글자
  ok('한글 채움 문자(U+3164)를 잡는다', invisibleChars('text-' + ch(0x3164) + 'white').length === 1);
  ok('초성·중성 채움(U+115F·U+1160)을 잡는다', invisibleChars(ch(0x115f) + 'a' + ch(0x1160)).length === 2);
  ok('반각 채움(U+FFA0)을 잡는다', invisibleChars('a' + ch(0xffa0)).length === 1);
  ok('그래핌 결합자(U+034F)를 잡는다', invisibleChars('a' + ch(0x034f)).length === 1);
  ok('이모지 변형 선택자는 집합 밖(정당한 꾸밈)', invisibleChars('a' + ch(0xfe0f)).length === 0);
  ok('보통 글자는 그대로 통과', invisibleChars('가나다 abc 123 · — ✕').length === 0);
  // 342: 범위 — 전에 밖이었던 파일들이 목록에 들어오고, 산출물은 빠진다
  const files = collectFiles();
  for (const must of ['index.html', 'CLAUDE.md', 'tsconfig.json', 'package.json', 'src/main.tsx', 'docs/NEXT-ACTION.md']) {
    ok(`범위에 ${must} 가 있다`, files.includes(must));
  }
  ok('의존성·산출물은 범위 밖', !files.some(f => /^node_modules\/|^release|^dist/.test(f)));
  ok('폐기 문서 보관함은 범위 밖', !files.some(f => f.startsWith('docs/archive/')));
  // 345(리뷰 L-2): 이름이 아니라 경로로 뺀다 — 루트의 build 만 빠지고 다른 위치의 같은 이름은 들어온다
  ok('루트 산출물 폴더는 범위 밖', !files.some(f => /^(build|dist|release)\//.test(f)));
  ok('server/src 는 범위 안', files.includes('server/src/server.js'));

  console.log(`[check-invisible] selftest OK — 덫 ${trapCount}종 통과(제어문자 4종·폭 없는 글자 2종·BOM 2종·줄칸·여러 개·이모지 ZWJ 3종·넓힌 글자 9종·한글 채움 4종·변형 선택자 면제·범위 10종)`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const files = collectFiles();
const allHits = [];
for (const rel of files) {
  let text;
  try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  for (const hit of invisibleChars(text)) allHits.push({ file: rel, ...hit });
}
const allowed = h => ALLOWED_SITES.some(a => a.file === h.file && a.line === h.line && a.code === h.code);
const problems = allHits.filter(h => !allowed(h));
// 345: 면제가 낡으면(그 자리가 없어지면) 조용히 남지 않게 말한다 — 340 이 덫에서 겪은 것과 같은 원칙
const staleAllow = ALLOWED_SITES.filter(a => !allHits.some(h => h.file === a.file && h.line === a.line && h.code === a.code));
if (staleAllow.length > 0) {
  // 347(344~346 리뷰 M-5): 전에는 "그 줄을 지우세요" 라고만 말하고 **먼저 멈췄다**. 그런데 가장 흔한 원인은
  // 그 파일에 줄이 끼어 **면제의 줄 번호가 밀린 것**이다(server.js 는 2100줄이 넘고 서버 작업마다 바뀐다).
  // 그때 올바른 조치는 "지우기" 가 아니라 "줄 번호 갱신" 이다 — 같은 (파일·글자) 가 다른 줄에서 보이면 그렇게 말한다.
  // 그리고 남은 위반도 함께 출력한다(둘 중 하나만 보여 주면 사람이 반대로 고친다).
  console.error(`[check-invisible] 사유를 적어 둔 자리 ${staleAllow.length}개가 그 줄에 없습니다:`);
  for (const a of staleAllow) {
    const moved = allHits.filter(h => h.file === a.file && h.code === a.code && !ALLOWED_SITES.some(x => x.file === h.file && x.line === h.line && x.code === h.code));
    const where = moved.length > 0 ? ` → 같은 글자가 ${moved.map(h => h.line).join('·')}줄에 있습니다. **줄 번호를 갱신하세요**(면제를 지우면 그 자리가 위반으로 신고됩니다)` : ' → 그 자리가 없어졌으면 이 면제 줄을 지우세요';
    console.error(`  - ${a.file}:${a.line} U+${a.code.toString(16).toUpperCase()}${where}`);
  }
  if (problems.length > 0) {
    console.error(`[check-invisible] 함께 신고된 위반 ${problems.length}개:`);
    for (const q of problems.slice(0, 10)) console.error(`  - ${q.file}:${q.line}:${q.col}  U+${q.code.toString(16).toUpperCase().padStart(4, '0')}`);
  }
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`[check-invisible] 보이지 않는 글자 ${problems.length}개:`);
  for (const p of problems.slice(0, 40)) {
    console.error(`  - ${p.file}:${p.line}:${p.col}  U+${p.code.toString(16).toUpperCase().padStart(4, '0')}`);
  }
  if (problems.length > 40) console.error(`  … 그 밖 ${problems.length - 40}개`);
  console.error('  → 그 자리를 다시 입력하세요. 셸(`node -e`·heredoc)을 지나는 수정에서 백슬래시가');
  console.error('    이스케이프로 해석돼 들어오는 경우가 많습니다 — 파일로 써서 실행하세요.');
  process.exit(1);
}
console.log(`[check-invisible] OK — ${files.length}개 파일에 보이지 않는 글자 0개(탭·줄바꿈·맨 앞 BOM·이모지 ZWJ 만 허용, 사유를 적어 둔 자리 ${ALLOWED_SITES.length}개). 범위는 저장소 전체에서 산출물·의존성만 뺀 것입니다`);
