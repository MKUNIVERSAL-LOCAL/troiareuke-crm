#!/usr/bin/env node
/**
 * 보이지 않는 글자 가드 (332) — `npm run check:invisible`
 *
 * 왜: 331 이 "설명되지 않는 가드 동작" 이라고 기록한 자리의 정체가 **보이지 않는 제어문자**였다.
 *     정규식 수정을 셸의 `node -e` 로 지나게 했더니 백슬래시가 문자열 이스케이프로 해석돼
 *     **실제 백스페이스 바이트(0x08)** 가 소스에 박혔다. 그 정규식은 영원히 매치되지 않으므로
 *     "인라인 svg 도 아이콘으로 본다" 는 수정이 **두 번 조용히 죽었다** — 가드는 그 자리를 계속
 *     글자로 재고, 나는 원인을 못 찾아 "설명하지 못했다" 고 적었다(331 기록). 사람 눈에 보이지
 *     않는 결함은 기계가 잡아야 한다.
 *
 * 보는 것: `src`·`scripts`·`e2e`·`server/src`·`docs` 의 글 파일에서 탭·줄바꿈 말고는 금지다 —
 *     C0 제어문자(0x00~0x1F)·DEL(0x7F)·폭 없는 글자(U+00AD·U+200B~U+200D·U+FEFF)를 신고한다.
 *     폭 없는 글자는 복사·붙여넣기로 들어와 선택자·정규식·클래스 이름을 조용히 깨뜨린다.
 *     **맨 앞 BOM 만 예외**다 — 이 저장소의 14개 파일이 그렇게 저장돼 있고 해롭지 않다.
 *     중간에 있는 BOM 은 사고다(실제로 `Customers/index.tsx` 4줄 머리에 하나 박혀 있었다).
 *
 * 한계: UTF-8 로 읽는 글 파일만 본다(확장자로 고른다). 바이너리·이미지는 보지 않는다.
 *     **보지 않는 자리**(334, 리뷰 L-4): `electron/`·루트 설정(`vite.config.ts`·`tailwind.config.js`·
 *     `package.json`)·`.github/` 워크플로, 그리고 이름이 `archive` 인 모든 디렉터리(의도는 `docs/archive`).
 *     코어 잠금 파일이 많은 쪽을 일부러 뺀 것이지만, 빼 둔 사실을 적어 두지 않으면 "전역" 이라는 말이
 *     사실보다 넓어진다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['src', 'scripts', 'e2e', 'server/src', 'docs'];
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.yml']);

/** 탭(09)·줄바꿈(0A)·복귀(0D)만 허용 */
const ALLOWED = new Set([9, 10, 13]);
const BOM = 0xfeff;
const ZERO_WIDTH = new Set([0x00ad, 0x200b, 0x200c, 0x200d, BOM]);

/** 이 글에서 보이지 않는 글자를 찾는다 — [{line, col, code}]. 334: 파일 밖 호출자가 없어 export 를 뗐다 */
function invisibleChars(text) {
  const out = [];
  let line = 1;
  let col = 1;
  let first = true;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (first) {
      first = false;
      if (code === BOM) { col += 1; continue; } // 맨 앞 BOM 은 허용
    }
    if (code === 10) { line += 1; col = 1; continue; }
    if ((code < 32 && !ALLOWED.has(code)) || code === 127 || ZERO_WIDTH.has(code)) {
      out.push({ line, col, code });
    }
    col += 1;
  }
  return out;
}

function listFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'archive') continue;
      listFiles(full, out);
    } else if (EXT.has(path.extname(name))) out.push(full);
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

  console.log(`[check-invisible] selftest OK — 덫 ${trapCount}종 통과(평범한 글·한글·백스페이스·폼피드·널·DEL·폭 없는 공백·소프트 하이픈·맨 앞 BOM 허용·중간 BOM·줄칸 번호·여러 개)`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const files = ROOTS.flatMap(r => listFiles(path.join(ROOT, r)));
const problems = [];
for (const full of files) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
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
console.log(`[check-invisible] OK — ${files.length}개 파일에 보이지 않는 글자 0개(탭·줄바꿈·맨 앞 BOM 만 허용)`);
