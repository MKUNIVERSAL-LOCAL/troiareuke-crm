#!/usr/bin/env node
/**
 * 릴리스 노트 가드 (214) — 업데이트 배너는 docs/RELEASE-NOTES-CURRENT.md 의 앞 2000자를 프로그램을 쓰는 사람(원장·직원 계정)에게 그대로 보여준다
 * (scripts/prepare-portable-update.mjs · prepare-mobile-update.mjs 가 매니페스트에 그만큼 넣는다).
 * v1.0.62 뒤 추가분이 옛 섹션에 섞여 들어가 배너가 "이미 적용된 내용" 만 보여줄 상태였던 일(214)을 막는다:
 *   1) 첫 줄은 "v<버전> 업데이트 내용" — package.json 버전이거나 아직 올리지 않은 다음 패치 버전(릴리스 준비 전)
 *   2) 맨 위 섹션에 항목(• 로 시작하는 줄)이 한 줄 이상 있다
 *   3) 배너 구간에 옛 버전 머리글이 들어오면 그 앞에 "지난 업데이트" 구분선이 있어야 한다 — 직원이 새 내용의 끝을 알 수 있게
 *   4) 배너에 **절(■)이 둘 이상** 보인다 — 한 주제가 2000자를 삼키면 나머지는 직원에게 닿지 않는다 (299)
 *   5) 한 절에 항목이 **12개를 넘지 않는다** — 묶음을 거듭하며 아무 절에나 붙이다 보면 "■ 영수증" 아래에
 *      예약·재고·발송 이야기가 25개 쌓인다(299 에서 실제로 그랬다). 직원이 제목으로 찾을 수 없게 된다.
 * 실패하면 비 0 으로 끝난다. 자체 점검: node scripts/check-release-notes.mjs --selftest
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BANNER_CHARS = 2000;
export const PAST_MARK = '지난 업데이트';
const HEAD_RE = /^v(\d+\.\d+\.\d+) 업데이트 내용\s*$/;
const VERSION_HEAD_RE = /^v(\d+\.\d+\.\d+) 업데이트 내용\s*$/gm;

/** 순수 검사 — 노트 본문과 package.json 버전을 받아 문제 목록을 돌려준다(빈 배열이면 통과) */
export function checkReleaseNotes(text, pkgVersion) {
  const problems = [];
  const body = text.replace(/\r\n/g, '\n');
  const lines = body.split('\n');
  const m = HEAD_RE.exec(lines[0] || '');
  if (!m) {
    problems.push('첫 줄이 "v<버전> 업데이트 내용" 형식이 아닙니다: ' + JSON.stringify((lines[0] || '').slice(0, 40)));
    return problems; // 머리글을 못 읽으면 나머지 판정이 의미 없다
  }
  const noteVersion = m[1];
  const [maj, min, patch] = pkgVersion.split('.').map(Number);
  const nextPatch = [maj, min, patch + 1].join('.');
  if (noteVersion !== pkgVersion && noteVersion !== nextPatch) {
    problems.push(`첫 줄 버전 ${noteVersion} 이 package.json ${pkgVersion}(또는 다음 패치 ${nextPatch})과 다릅니다`);
  }

  const heads = [...body.matchAll(VERSION_HEAD_RE)];
  const topEnd = heads.length > 1 ? body.indexOf(heads[1][0]) : body.length;
  const topItems = body.slice(0, topEnd).split('\n').filter(l => l.trimStart().startsWith('•'));
  if (topItems.length === 0) problems.push('맨 위 섹션에 항목(• 로 시작하는 줄)이 없습니다');

  if (heads.length > 1) {
    const banner = body.trim().slice(0, BANNER_CHARS); // 업데이터와 같은 기준(문자 수, trim 뒤) — prepare-portable-update.mjs
    const oldHeadAt = banner.indexOf(heads[1][0]);
    if (oldHeadAt >= 0) {
      const markAt = banner.indexOf(PAST_MARK);
      if (markAt < 0 || markAt > oldHeadAt) {
        problems.push(`배너(앞 ${BANNER_CHARS}자)에 옛 버전(${heads[1][1]}) 내용이 "${PAST_MARK}" 구분선 없이 이어집니다 — 새 항목을 맨 위로 모으고 구분선을 넣으세요`);
      }
    }
  }
  // ④ 배너를 한 주제가 삼키지 않는가 (299)
  const bannerText = body.trim().slice(0, BANNER_CHARS);
  const bannerSections = [...bannerText.matchAll(/^■ (.+)$/gm)];
  // 맨 위 절이 배너보다 길 때만 본다 — 노트가 짧으면 잘리는 것이 없고, 절 하나로도 충분하다 (299)
  const topTrimmed = body.slice(0, topEnd).trim().length;
  if (topTrimmed > BANNER_CHARS && bannerSections.length === 1) {
    problems.push(`배너(앞 ${BANNER_CHARS}자)에 절이 하나뿐입니다("■ ${bannerSections[0][1].trim()}") — 지점이 매일 쓰는 변화가 뒤로 밀립니다. 절을 나누고 중요한 것을 위로 올리세요`);
  }

  // ⑤ 한 절에 몰아넣지 않는가 (299)
  const MAX_PER_SECTION = 12;
  const topEndLine = heads.length > 1 ? body.slice(0, topEnd).split('\n').length : lines.length;
  let section = null, count = 0;
  const tooBig = [];
  for (let i = 0; i < topEndLine; i++) {
    const line = lines[i] ?? '';
    const h = /^■ (.+)$/.exec(line);
    if (h) {
      if (section && count > MAX_PER_SECTION) tooBig.push([section, count]);
      section = h[1].trim(); count = 0; continue;
    }
    if (line.trimStart().startsWith('•')) count += 1;
  }
  if (section && count > MAX_PER_SECTION) tooBig.push([section, count]);
  for (const [name, n] of tooBig) {
    problems.push(`"■ ${name}" 절에 항목이 ${n}개입니다(최대 ${MAX_PER_SECTION}) — 주제별로 나누세요. 직원은 제목으로 찾습니다`);
  }

  return problems;
}

if (process.argv.includes('--selftest')) {
  const pad = n => '\n'.repeat(n);
  const cases = [
    ['정상(새 섹션이 배너를 채움)', 'v1.0.63 업데이트 내용\n\n■ 문자\n• 새 항목\n' + pad(2100) + 'v1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 0],
    ['정상(짧은 새 섹션 + 구분선)', 'v1.0.63 업데이트 내용\n\n• 새 항목\n\n— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 0],
    ['구분선 없이 옛 버전이 배너에', 'v1.0.63 업데이트 내용\n\n• 새 항목\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 1],
    ['머리글 버전 불일치', 'v9.9.9 업데이트 내용\n• 새 항목\n', '1.0.62', 1],
    ['맨 위 섹션에 항목 없음', 'v1.0.63 업데이트 내용\n\n— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 1],
    ['첫 줄 형식 아님', '릴리스 노트\n• 항목\n', '1.0.62', 1],
    // 299: 배너를 한 절이 삼키면 알린다(절 하나 + 긴 항목)
    ['배너에 절이 하나뿐', 'v1.0.63 업데이트 내용\n\n■ 한 주제\n• ' + 'ㄱ'.repeat(2100) + '\n', '1.0.62', 1],
    ['배너에 절이 둘', 'v1.0.63 업데이트 내용\n\n■ 첫 주제\n• ' + 'ㄱ'.repeat(1000) + '\n\n■ 둘째 주제\n• ' + 'ㄴ'.repeat(1200) + '\n', '1.0.62', 0],
    // 299: 한 절에 13개를 넣으면 알린다
    ['한 절에 13개', 'v1.0.63 업데이트 내용\n\n■ 몰아넣은 절\n' + '• 항목\n'.repeat(13), '1.0.62', 1],
    ['한 절에 12개는 통과', 'v1.0.63 업데이트 내용\n\n■ 괜찮은 절\n' + '• 항목\n'.repeat(12), '1.0.62', 0],
  ];
  let bad = 0;
  for (const [name, text, version, expected] of cases) {
    const got = checkReleaseNotes(text, version);
    const ok = got.length === expected;
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} — 문제 ${got.length}건(기대 ${expected})${ok ? '' : ': ' + got.join(' / ')}`);
  }
  console.log(bad === 0 ? '자체 점검 통과' : `자체 점검 실패 ${bad}건`);
  process.exit(bad === 0 ? 0 : 1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = await readFile(path.join(root, 'docs', 'RELEASE-NOTES-CURRENT.md'), 'utf8');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const problems = checkReleaseNotes(text, pkg.version);
if (problems.length > 0) {
  console.error('[check-release-notes] 릴리스 노트 문제:');
  for (const p of problems) console.error(' - ' + p);
  console.error(`배너는 앞 ${BANNER_CHARS}자만 보여줍니다 — 새 릴리스 항목을 맨 위 섹션에 두세요.`);
  process.exit(1);
}
console.log('[check-release-notes] OK — 첫 줄 버전·맨 위 섹션 항목·배너 구분선·배너 절 수·절 크기 확인');
