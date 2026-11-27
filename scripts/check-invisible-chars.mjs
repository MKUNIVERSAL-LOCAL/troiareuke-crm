#!/usr/bin/env node
/**
 * 보이지 않는 글자 가드 (332·337·342) — `npm run check:invisible`
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
 *     아래 `SKIP_DIRS` 는 빌드 산출물·의존성·보관본이다(`archive` = 폐기 문서 보관).
 *     잠금 파일에서 나오면 고치지 않고 `OWNER-APPROVAL-QUEUE.md` 에 적는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** 342: 볼 폴더를 고르지 않고 **볼 필요가 없는 폴더만** 뺀다 — 고를 목록은 늘 낡는다 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'archive', 'dist', 'dist-e2e', 'dist-e2e-nas', 'dist-mobile',
  'release', 'release-admin', 'release-portable', '.gate', 'coverage', 'test-results',
  'playwright-report', 'build', '.next', '.vite', 'android', 'Pods', '.claude-flow',
]);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.yml', '.yaml', '.sql']);

/** 탭(09)·줄바꿈(0A)·복귀(0D)만 허용 */
const ALLOWED = new Set([9, 10, 13]);
const BOM = 0xfeff;
const ZWJ = 0x200d;
const ZERO_WIDTH = new Set([0x00ad, 0x200b, 0x200c, ZWJ, BOM]);

/** 그림문자이거나 그 꾸밈(이모지 변형 선택자·피부색 수정자)인가 — ZWJ 허용 판정에 쓴다 (342) */
const PICTO = /\p{Extended_Pictographic}/u;
function emojiish(ch) {
  if (ch === undefined) return false;
  if (ch === '️' || ch === '︎') return true;
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
    if ((code < 32 && !ALLOWED.has(code)) || code === 127 || ZERO_WIDTH.has(code)) {
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
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(full, out);
    } else if (EXT.has(path.extname(entry.name))) {
      out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
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
  ok('이모지 사이 ZWJ 는 허용', invisibleChars('\u{1F468}' + ch(ZWJ) + '⚕️ 의사').length === 0);
  ok('글자 사이 ZWJ 는 잡는다', invisibleChars('text-' + ch(ZWJ) + 'white').length === 1);
  ok('한쪽만 이모지인 ZWJ 는 잡는다', invisibleChars('\u{1F468}' + ch(ZWJ) + 'a').length === 1);
  // 342: 범위 — 전에 밖이었던 파일들이 목록에 들어오고, 산출물은 빠진다
  const files = collectFiles();
  for (const must of ['index.html', 'CLAUDE.md', 'tsconfig.json', 'package.json', 'src/main.tsx', 'docs/NEXT-ACTION.md']) {
    ok(`범위에 ${must} 가 있다`, files.includes(must));
  }
  ok('의존성·산출물은 범위 밖', !files.some(f => /^node_modules\/|^release|^dist/.test(f)));
  ok('폐기 문서 보관함은 범위 밖', !files.some(f => f.startsWith('docs/archive/')));

  console.log(`[check-invisible] selftest OK — 덫 ${trapCount}종 통과(제어문자 4종·폭 없는 글자 2종·BOM 2종·줄칸·여러 개·이모지 ZWJ 3종·범위 8종)`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const files = collectFiles();
const problems = [];
for (const rel of files) {
  let text;
  try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  for (const hit of invisibleChars(text)) problems.push({ file: rel, ...hit });
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
console.log(`[check-invisible] OK — ${files.length}개 파일에 보이지 않는 글자 0개(탭·줄바꿈·맨 앞 BOM·이모지 ZWJ 만 허용). 범위는 저장소 전체에서 산출물·의존성만 뺀 것입니다`);
