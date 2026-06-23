// 🔒 Claude Code PreToolUse 훅 — 코어 파일 Edit/Write/MultiEdit 차단
// .claude/settings.json 의 PreToolUse(Edit|Write|MultiEdit) 에서 호출됨.
// stdin 으로 들어온 tool_input.file_path 가 코어면 exit 2 로 도구 호출을 막는다.
// (exit 2 → stderr 메시지가 Claude 에게 전달되고 해당 편집이 거부됨)

import { isCore } from './core-lock.mjs';

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const raw = await readStdin().catch(() => '');
if (process.env.CORE_EDIT === '1') process.exit(0); // 명시적 우회

let payload = {};
try { payload = JSON.parse(raw || '{}'); } catch { process.exit(0); }

const input = payload.tool_input || payload.toolInput || {};
// Edit/Write/MultiEdit 모두 file_path 사용
const target = input.file_path || input.filePath || input.path || '';

if (target && isCore(target)) {
  console.error(
    '🔒 코어코드 보호장치: 이 파일은 잠겨 있어 수정할 수 없습니다 → ' + target + '\n' +
    '   (보호 대상: store.ts / supabase.ts / AuthContext / App / electron / supabase SQL 등)\n' +
    '   정말 필요하면 docs/CORE-LOCK.md 의 우회 절차(CORE_EDIT=1)를 따르세요.'
  );
  process.exit(2);
}
process.exit(0);
