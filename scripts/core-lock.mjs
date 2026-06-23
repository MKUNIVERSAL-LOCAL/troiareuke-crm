// 🔒 코어 잠금 — 단일 소스(Single Source of Truth)
// Claude Code 훅(claude-core-guard.mjs)과 git pre-commit 훅이 공통으로 사용.
// 여기 CORE_FILES / CORE_DIRS 만 고치면 양쪽 보호가 동시에 갱신됨.
//
// 사용:
//   node scripts/core-lock.mjs check-stdin   # 줄바꿈 구분 파일 경로를 stdin으로 받아 검사
//   node scripts/core-lock.mjs check <path…>  # 인자로 받은 경로 검사
//   → 코어 파일이 하나라도 포함되면 exit 1 (CORE_EDIT=1 이면 통과)

// ── 보호 대상 (repo 루트 기준 상대경로) ──────────────────────────
export const CORE_FILES = [
  'src/lib/store.ts',          // 중앙 데이터 스토어 (17개 Store 모듈)
  'src/lib/supabase.ts',       // Supabase 클라이언트 + 핵심 타입
  'src/lib/payment.ts',        // 결제
  'src/lib/loginLog.ts',       // 로그인 로그
  'src/lib/masking.ts',        // PII 마스킹
  'src/lib/googleCalendar.ts', // 캘린더 연동
  'src/contexts/AuthContext.tsx', // 인증·세션
  'src/App.tsx',               // 라우팅 + 권한 가드
  'src/main.tsx',              // 부트스트랩 + OAuth 콜백
  'electron/main.cjs',         // Electron 메인(백업·IPC·autoUpdater)
  'electron/preload.cjs',      // Electron preload 브리지
];

// ── 보호 대상 디렉터리 (이 prefix 하위 전부) ─────────────────────
export const CORE_DIRS = [
  'supabase/', // RLS·마이그레이션 SQL 전체
];

// 경로 정규화: 역슬래시→슬래시, 선행 ./ 제거, 소문자화는 하지 않음
function normalize(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

// 절대경로/상대경로 모두 처리 — repo 상대경로 꼬리로 매칭
export function isCore(filePath) {
  const n = normalize(filePath);
  if (!n) return false;
  for (const f of CORE_FILES) {
    if (n === f || n.endsWith('/' + f)) return true;
  }
  for (const d of CORE_DIRS) {
    if (n.includes('/' + d) || n.startsWith(d)) return true;
  }
  return false;
}

// ── CLI ──────────────────────────────────────────────────────────
function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(normalize(process.argv[1] || ''));
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const [, , mode, ...rest] = process.argv;
  if (process.env.CORE_EDIT === '1') process.exit(0); // 명시적 우회

  let paths = [];
  if (mode === 'check-stdin') {
    const text = await readStdin();
    paths = text.split(/\r?\n/).filter(Boolean);
  } else if (mode === 'check') {
    paths = rest;
  } else {
    console.error('usage: node scripts/core-lock.mjs check-stdin | check <path…>');
    process.exit(2);
  }

  const hits = paths.filter(isCore);
  if (hits.length) {
    console.error('\n🔒 코어코드 보호 — 다음 파일은 잠겨 있어 변경할 수 없습니다:');
    for (const h of hits) console.error('   - ' + normalize(h));
    console.error('\n   코어를 정말 고쳐야 하면 docs/CORE-LOCK.md 를 읽고,');
    console.error('   환경변수 CORE_EDIT=1 을 준 상태에서만 진행하세요.\n');
    process.exit(1);
  }
  process.exit(0);
}

if (isMainModule()) main();
