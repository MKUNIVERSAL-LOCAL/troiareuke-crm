#!/usr/bin/env node
/**
 * 릴리스 노트 가드 (214) — 업데이트 배너는 docs/RELEASE-NOTES-CURRENT.md 의 앞 2000자를 프로그램을 쓰는 사람(원장·직원 계정)에게 그대로 보여준다
 * (scripts/prepare-portable-update.mjs · prepare-mobile-update.mjs 가 매니페스트에 그만큼 넣는다).
 * v1.0.62 뒤 추가분이 옛 섹션에 섞여 들어가 배너가 "이미 적용된 내용" 만 보여줄 상태였던 일(214)을 막는다:
 *   1) 첫 줄은 "v<버전> 업데이트 내용" — package.json 버전이거나 아직 올리지 않은 다음 패치 버전(릴리스 준비 전)
 *   2) 맨 위 섹션에 항목(• 로 시작하는 줄)이 한 줄 이상 있다
 *   3) **노트 안에 옛 버전 머리글이 있으면** 그 앞에 "지난 업데이트" 구분선이 있어야 한다 — 직원이 새 내용의 끝을 알 수 있게.
 *      300(297~299 리뷰 H-1): 전에는 **배너(앞 2000자) 안에 있을 때만** 봤다. 299 가 재구성하면서 그 줄을 지웠고
 *      옛 머리글은 2000자 밖이라 가드가 **구조적으로 침묵**했다 — 이 파일 전체가 GitHub 릴리스 본문(`--notes-file`)이라
 *      공개 페이지에서 v1.0.63 내용이 아무 표시 없이 이어졌다.
 *   4) 배너에 **절(■)이 둘 이상** 보인다 — 한 주제가 2000자를 삼키면 나머지는 직원에게 닿지 않는다 (299)
 *   5) 한 절에 항목(`•`·`·`·`-` 로 시작하는 줄)이 **12개를 넘지 않는다** — 묶음을 거듭하며 아무 절에나 붙이다 보면 "■ 영수증" 아래에
 *      예약·재고·발송 이야기가 25개 쌓인다(299 에서 실제로 그랬다). 직원이 제목으로 찾을 수 없게 된다.
 *   6) 같은 **굵은 낱말**이 **두 절에 나오지 않는다**(336) — `**공지 띠**` 가 두 절에 적혀 지점이
 *      같은 것을 두 번 읽고 있었다(한쪽은 배경, 한쪽은 본문이라 어느 쪽이 사실인지도 흐렸다).
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
    // 300(리뷰 H-1): 배너 안이든 밖이든 **노트 안에** 옛 머리글이 있으면 그 앞에 구분선이 있어야 한다
    const oldHeadAt = body.indexOf(heads[1][0]);
    const markAt = body.indexOf(PAST_MARK);
    if (markAt < 0 || markAt > oldHeadAt) {
      const inBanner = oldHeadAt < BANNER_CHARS;
      problems.push(`옛 버전(${heads[1][1]}) 내용이 "${PAST_MARK}" 구분선 없이 이어집니다${inBanner ? ` — 배너(앞 ${BANNER_CHARS}자)에도 들어갑니다` : ' — 이 파일 전체가 GitHub 릴리스 본문입니다'}. 새 항목을 맨 위로 모으고 구분선을 넣으세요`);
    }
  }
  // ④ 배너를 한 주제가 삼키지 않는가 (299 → 300 에서 측정값 교체)
  //
  // 299 는 "배너에 절이 하나뿐이면 실패" 로 셌다. 그런데 **299 가 고친 그 사고**(첫 절이 2000자의 60%를
  // 먹어 매일 쓰는 변화가 잘렸다)는 배너에 절이 셋이어서 그 규칙으로는 잡히지 않았다(리뷰 M-3 가 실측).
  // 피해는 "첫 절이 배너를 얼마나 먹었나" 이므로 그것을 센다. 절 머리말이 배너에 **하나도 없는** 경우도
  // 같은 피해(한 주제가 통째로 삼킴)이므로 실패로 본다.
  const bannerText = body.trim().slice(0, BANNER_CHARS);
  const bannerSections = [...bannerText.matchAll(/^■ (.+)$/gm)];
  const topTrimmed = body.slice(0, topEnd).trim().length;
  const MAX_FIRST_SHARE = 0.55;
  if (topTrimmed > BANNER_CHARS) {
    if (bannerSections.length === 0) {
      problems.push(`배너(앞 ${BANNER_CHARS}자)에 절 머리말(■)이 하나도 없습니다 — 한 주제가 배너를 통째로 차지합니다. 절을 나누고 중요한 것을 위로 올리세요`);
    } else {
      const firstAt = bannerSections[0].index;
      const secondAt = bannerSections.length > 1 ? bannerSections[1].index : bannerText.length;
      const share = (secondAt - firstAt) / BANNER_CHARS;
      const totalSections = [...body.slice(0, topEnd).matchAll(/^■ /gm)].length;
      if (share > MAX_FIRST_SHARE && totalSections > 1) {
        problems.push(`배너(앞 ${BANNER_CHARS}자)의 ${Math.round(share * 100)}%가 첫 절("■ ${bannerSections[0][1].trim()}") 하나입니다(최대 ${Math.round(MAX_FIRST_SHARE * 100)}%) — 지점이 매일 쓰는 변화가 뒤로 밀립니다. 그 절을 줄이거나 다른 절을 위로 올리세요`);
      }
    }
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
    // 301(297~299 리뷰 LOW-5): `•` 만 세어 `- 항목`·`· 항목` 으로 바꾸면 우회됐다 — 글머리표 세 종류를 센다
    if (/^\s*[•·-]\s/.test(line)) count += 1;
  }
  if (section && count > MAX_PER_SECTION) tooBig.push([section, count]);
  for (const [name, n] of tooBig) {
    problems.push(`"■ ${name}" 절에 항목이 ${n}개입니다(최대 ${MAX_PER_SECTION}) — 주제별로 나누세요. 직원은 제목으로 찾습니다`);
  }

  // ⑥ 같은 **굵은 낱말**이 두 절에 나오지 않는가 (336)
  //
  // 왜: 336 이 노트를 한 편으로 읽었더니 `**공지 띠**` 가 "잘 안 보이던 글자·아이콘" 과 "안내 띠"
  // 양쪽에 적혀 있었다 — 지점은 같은 것을 두 번 읽고, 두 줄이 서로 다른 말을 하면(한쪽은 배경,
  // 한쪽은 본문) 어느 쪽이 사실인지 알 수 없다. 굵게 적는 낱말은 글쓴이가 고른 **핵심 낱말**이라
  // 신호가 분명하고 거짓 경보가 적다. 지난 버전 절은 그때의 기록이니 보지 않는다(맨 위 절들만).
  {
    const current = body.slice(0, topEnd);
    const seen = new Map();
    let secName = null;
    for (const line of current.split(String.fromCharCode(10))) {
      const h = /^■ (.+)$/.exec(line);
      if (h) { secName = h[1].trim(); continue; }
      if (!secName) continue;
      for (const b of line.matchAll(/\*\*([^*]{2,20})\*\*/g)) {
        const key = b[1].trim();
        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key).add(secName);
      }
    }
    for (const [term, where] of seen) {
      if (where.size > 1) {
        problems.push(`굵게 적은 "${term}" 이 ${where.size}개 절에 나옵니다(${[...where].map(x => `■ ${x}`).join(" · ")}) — 지점은 같은 것을 두 번 읽습니다. 한 줄로 합치세요`);
      }
    }
  }
  // ⑦ ■ 절 머리말 앞에 **빈 줄**이 있는가 (342, 335~340 리뷰 L-2)
  //
  // 왜: 336 이 절을 재구성하면서 두 자리(`■ 현장 안전`·`■ AI 사용량`)가 앞 항목에 붙었다.
  // 파싱은 줄 단위라 아무 문제가 없었고 — 그래서 가드가 보지 않았다 — 지점이 읽는 글만 붙어 읽혔다.
  {
    const nl = String.fromCharCode(10);
    const lines = body.split(nl);
    for (let i = 1; i < lines.length; i += 1) {
      if (/^■ /.test(lines[i]) && lines[i - 1].trim() !== '') {
        problems.push(`"${lines[i].trim()}" 절 머리말 앞에 빈 줄이 없습니다 — 앞 항목과 붙어 읽힙니다`);
      }
    }
  }
  return problems;
}

if (process.argv.includes('--selftest')) {
  const pad = n => '\n'.repeat(n);
  const cases = [
    ['정상(새 섹션이 배너를 채움 + 구분선)', 'v1.0.63 업데이트 내용\n\n■ 문자\n• 새 항목\n' + pad(2100) + '— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 0],
    ['정상(짧은 새 섹션 + 구분선)', 'v1.0.63 업데이트 내용\n\n• 새 항목\n\n— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 0],
    ['구분선 없이 옛 버전이 배너에', 'v1.0.63 업데이트 내용\n\n• 새 항목\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 1],
    ['머리글 버전 불일치', 'v9.9.9 업데이트 내용\n• 새 항목\n', '1.0.62', 1],
    ['맨 위 섹션에 항목 없음', 'v1.0.63 업데이트 내용\n\n— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 1],
    ['첫 줄 형식 아님', '릴리스 노트\n• 항목\n', '1.0.62', 1],
    // 300(리뷰 H-1): 옛 머리글이 배너 밖이어도 구분선이 없으면 알린다 — 299 가 지운 그 줄
    ['옛 머리글이 배너 밖인데 구분선 없음', 'v1.0.63 업데이트 내용\n\n■ 첫 주제\n• ' + 'ㄱ'.repeat(900) + '\n\n■ 둘째 주제\n• ' + 'ㄴ'.repeat(1300) + '\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 1],
    ['옛 머리글이 배너 밖 + 구분선 있음', 'v1.0.63 업데이트 내용\n\n■ 첫 주제\n• ' + 'ㄱ'.repeat(900) + '\n\n■ 둘째 주제\n• ' + 'ㄴ'.repeat(1300) + '\n\n— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 0],
    // 300(리뷰 M-3): 299 가 고친 모양 — 절은 셋인데 첫 절이 배너의 60%를 먹는다
    ['첫 절이 배너의 60%', 'v1.0.63 업데이트 내용\n\n■ 한 주제\n• ' + 'ㄱ'.repeat(1250) + '\n\n■ 둘째\n• ' + 'ㄴ'.repeat(400) + '\n\n■ 셋째\n• ' + 'ㄷ'.repeat(600) + '\n', '1.0.62', 1],
    ['첫 절이 배너의 40%는 통과', 'v1.0.63 업데이트 내용\n\n■ 한 주제\n• ' + 'ㄱ'.repeat(760) + '\n\n■ 둘째\n• ' + 'ㄴ'.repeat(700) + '\n\n■ 셋째\n• ' + 'ㄷ'.repeat(700) + '\n', '1.0.62', 0],
    ['배너에 절 머리말이 없음', 'v1.0.63 업데이트 내용\n\n• ' + 'ㄱ'.repeat(2200) + '\n\n■ 뒤에 오는 절\n• 항목\n', '1.0.62', 1],
    // 299: 배너를 한 절이 삼키면 알린다(절 하나 + 긴 항목)
    ['배너에 절이 하나뿐(= 첫 절이 전부)', 'v1.0.63 업데이트 내용\n\n■ 한 주제\n• ' + 'ㄱ'.repeat(2100) + '\n\n■ 뒤에 오는 절\n• 항목\n', '1.0.62', 1],
    ['배너에 절이 둘(반반)', 'v1.0.63 업데이트 내용\n\n■ 첫 주제\n• ' + 'ㄱ'.repeat(1000) + '\n\n■ 둘째 주제\n• ' + 'ㄴ'.repeat(1200) + '\n', '1.0.62', 0],
    // 299: 한 절에 13개를 넣으면 알린다
    ['한 절에 13개', 'v1.0.63 업데이트 내용\n\n■ 몰아넣은 절\n' + '• 항목\n'.repeat(13), '1.0.62', 1],
    ['한 절에 12개는 통과', 'v1.0.63 업데이트 내용\n\n■ 괜찮은 절\n' + '• 항목\n'.repeat(12), '1.0.62', 0],
    // 336(규칙 ⑥): 같은 굵은 낱말이 두 절에 — 336 이 손으로 찾은 중복(공지 띠)이 이 모양이었다
    ['굵은 낱말이 두 절에 나오면 잡는다', 'v1.0.63 업데이트 내용\n\n■ 가\n• **공지 띠** 배경을 진하게\n\n■ 나\n• **공지 띠** 본문을 진하게\n\n— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 1],
    ['한 절 안에서 두 번은 통과', 'v1.0.63 업데이트 내용\n\n■ 가\n• **공지 띠** 배경을 진하게\n• **공지 띠** 본문도 진하게\n\n— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n• 옛 항목\n', '1.0.62', 0],
    // 342(리뷰 L-2): ■ 절 머리말 앞의 빈 줄
    ['절 머리말이 앞 항목에 붙으면 잡는다', 'v1.0.63 업데이트 내용\n\n■ 가\n• 항목\n■ 나\n• 항목\n', '1.0.62', 1],
    ['빈 줄이 있으면 통과', 'v1.0.63 업데이트 내용\n\n■ 가\n• 항목\n\n■ 나\n• 항목\n', '1.0.62', 0],
    ['지난 버전 절의 같은 낱말은 보지 않는다', 'v1.0.63 업데이트 내용\n\n■ 가\n• **공지 띠** 배경을 진하게\n\n— 아래는 이미 적용된 지난 업데이트 내용입니다 —\n\nv1.0.62 업데이트 내용\n\n■ 나\n• **공지 띠** 를 만들었습니다\n', '1.0.62', 0],
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
console.log('[check-release-notes] OK — 첫 줄 버전·맨 위 섹션 항목·배너 구분선·배너 절 수·절 크기·굵은 낱말 중복·절 머리말 빈 줄 확인');
