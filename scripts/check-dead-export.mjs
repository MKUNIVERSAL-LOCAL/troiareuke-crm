#!/usr/bin/env node
/**
 * 미사용 export 가드 (315) — `npm run check:dead-export`
 *
 * 왜: CLAUDE.md 2절은 "미사용 export·import·파일을 남기지 말 것" 을 상시 규칙으로 둔다. 그런데
 *     305(300~302 리뷰 M-4)에서 **호출자 0인 export 가 두 묶음을 지나 남아 있었다** — 300 이 그 함수를
 *     쓰던 자리를 옮기고, 301 은 "죽은 코드를 치웠다" 면서 인자만 떼고 함수는 남겼다.
 *     `check:rules` 는 **순수 규칙 함수가 lib-units 에서 호출되는지**만 보므로 이 종류를 보지 못한다.
 *
 * 하는 일: `src/lib` 의 **값 export**(`export function`·`export const`)를 모아, 저장소의 다른 코드
 *     파일(`src`·`e2e`·`scripts`·`server`·`electron`)에서 그 이름이 한 번도 나오지 않으면 적는다.
 *   - 타입·인터페이스는 보지 않는다(타입은 자기 파일 안에서만 쓰여도 공개 계약일 수 있다).
 *   - 문서(.md)의 언급은 **코드 참조가 아니다** — 315 에서 그걸 참조로 세어 다섯 개를 놓쳤다.
 *   - 코어 잠금 파일의 것은 ALLOWED 에 둔다(고치려면 오너 승인 + CORE_EDIT=1 이 필요하다).
 *
 * 한계(정직하게): 이름이 **문자열로만** 쓰이는 경우(동적 접근)는 "쓰임" 으로 세어 놓칠 수 있다.
 *     반대로 같은 이름의 다른 심볼이 다른 파일에 있으면 "쓰인다" 고 볼 수 있다 — 둘 다 **놓치는 쪽**이라
 *     거짓 실패는 내지 않는다(거짓 경보가 가드를 죽인다는 303 의 교훈).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 지금 남아 있는 미사용 export — 전부 코어 잠금 파일이라 승인 없이 손댈 수 없다 */
const ALLOWED = [
  { file: 'src/lib/googleCalendar.ts', name: 'getAccessToken', why: '코어 잠금 — 캘린더 연동(결정 #6) 뒤 정리' },
  { file: 'src/lib/googleCalendar.ts', name: 'isGoogleCalendarAvailable', why: '코어 잠금 — 같음' },
  { file: 'src/lib/googleCalendar.ts', name: 'fetchCalendarEvents', why: '코어 잠금 — 같음' },
  { file: 'src/lib/googleCalendar.ts', name: 'syncReservationsToCalendar', why: '코어 잠금 — 같음' },
  { file: 'src/lib/payment.ts', name: 'requestSubscription', why: '코어 잠금 — PG 계약(결정 #4) 뒤 쓰인다' },
  { file: 'src/lib/payment.ts', name: 'getPlanById', why: '코어 잠금 — 같음' },
  { file: 'src/lib/updateChannel.ts', name: 'isStale', why: '코어 잠금(배포 헬퍼) — 업데이트 채널 쪽에서 쓰려고 둔 것' },
];

const SKIP = /node_modules|[\\/](dist|dist-e2e-nas|release|release-admin|android|ios|\.git)[\\/]/;
const CODE = /\.(ts|tsx|mjs|cjs|js)$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (SKIP.test(full + path.sep)) return [];
    try {
      return fs.statSync(full).isDirectory() ? walk(full) : (CODE.test(name) ? [full] : []);
    } catch { return []; }
  });
}

const codeFiles = ['src', 'e2e', 'scripts', 'server', 'electron'].flatMap(d => walk(path.join(ROOT, d)));
const texts = new Map(codeFiles.map(f => [f, fs.readFileSync(f, 'utf8')]));
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/gm;

function deadExports() {
  const out = [];
  for (const [full, text] of texts) {
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (!rel.startsWith('src/lib/')) continue;
    for (const m of text.matchAll(EXPORT_RE)) {
      const name = m[1];
      const re = new RegExp(`\\b${name}\\b`);
      let used = false;
      for (const [other, t] of texts) {
        if (other === full) continue;
        // **이 가드 자신**은 세지 않는다 — ALLOWED 에 적어 둔 이름이 "쓰인다" 로 읽혀 전부 낡은 것처럼 보였다(315)
        if (other === fileURLToPath(import.meta.url)) continue;
        if (re.test(t)) { used = true; break; }
      }
      if (!used) out.push({ file: rel, name, line: text.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

if (process.argv.includes('--selftest')) {
  const ok = (name, cond) => { if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };
  // 지금 남은 것은 ALLOWED 와 정확히 같아야 한다
  const found = deadExports();
  const key = x => `${x.file}:${x.name}`;
  const extra = found.filter(f => !ALLOWED.some(a => a.file === f.file && a.name === f.name)).map(key);
  const stale = ALLOWED.filter(a => !found.some(f => f.file === a.file && f.name === a.name)).map(key);
  ok(`새 미사용 export 없음(${extra.join(', ')})`, extra.length === 0);
  ok(`ALLOWED 가 낡지 않음(${stale.join(', ')})`, stale.length === 0);
  ok('ALLOWED 는 전부 코어 잠금 파일', ALLOWED.every(a => /googleCalendar|payment\.ts|updateChannel/.test(a.file)));
  ok('값 export 를 실제로 찾는다', texts.size > 50);
  console.log('[check-dead-export] selftest OK — 덫(새 미사용 export·낡은 ALLOWED·코어 잠금 사유·파일 수집) 통과');
  process.exit(0);
}

const found = deadExports();
const unexpected = found.filter(f => !ALLOWED.some(a => a.file === f.file && a.name === f.name));
const stale = ALLOWED.filter(a => !found.some(f => f.file === a.file && f.name === a.name));

if (unexpected.length > 0 || stale.length > 0) {
  if (unexpected.length > 0) {
    console.error(`[check-dead-export] 아무도 쓰지 않는 export ${unexpected.length}개:`);
    for (const f of unexpected) console.error(`  - ${f.file}:${f.line}  ${f.name}`);
    console.error('  → 쓰는 곳을 만들거나, `export` 를 떼거나(자기 파일 안에서만 쓰면), 선언째 지우세요.');
  }
  if (stale.length > 0) {
    console.error(`[check-dead-export] ALLOWED 가 낡았다 — 이미 쓰이거나 사라진 ${stale.length}개: ${stale.map(a => `${a.file} ${a.name}`).join(', ')}`);
    console.error('  → 그 줄을 지우세요(사유만 남고 사실이 바뀌는 것을 막습니다).');
  }
  process.exit(1);
}
console.log(`[check-dead-export] OK — src/lib 의 값 export 중 쓰이지 않는 것은 사유를 적어 둔 ${ALLOWED.length}개(전부 코어 잠금)뿐`);
