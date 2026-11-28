/**
 * 로드맵에 묶음 줄·재검증 줄을 **줄 단위로** 넣는다 (363, 360~362 리뷰 H-1).
 *
 * 왜 이것이 필요한가: 묶음 기록을 넣을 때 앵커를 `누계 155~NNN 묶음 MMM개.` 같은 **문장**으로 잡고
 * 그 뒤에 `\n` + 새 줄을 붙여 왔다. 그런데 앞 줄이 그 문장 **뒤에** 더 적고 있으면(예: 360 의
 * `**[자기 정정]** …`), 그 꼬리가 **새 줄의 끝으로 옮겨진다**. 361·362 를 넣을 때 두 번 연속 그랬고,
 * 그래서 362 줄이 "커밋은 09:37"(360 의 커밋)이라고 **자기에 대해 거짓**을 말했다.
 *
 * 그래서 문장이 아니라 **줄**을 찾는다 — `- [x] NNN — ` 으로 시작하는 줄을 찾아 그 **아래**에 넣는다.
 * 그 줄의 꼬리에 무엇이 있든 건드리지 않는다.
 *
 * 363 에서 한 번 틀렸다: 처음에는 "앞에 넣는다" 로 적었는데 **묶음 줄은 오래된 것이 위**(오름차순)다.
 * 그래서 363 이 362 위에 들어가 ② 의 "마지막 누계" 가 362 의 값을 읽었고, 가드가 "207 ≠ 208" 로
 * 잡았다. **재검증 줄은 반대로 새 것이 위**(내림차순)이므로 `insertRecheckLine` 은 앞에 넣는다.
 *
 * CRLF 는 그대로 돌려준다(`docs/*.md` 는 CRLF 와 LF 가 섞여 있다 — 메모리 docs-patch-crlf).
 */

/** 묶음 줄을 넣는다 — `after` 묶음 번호의 줄 **아래**에(묶음 줄은 오름차순이다) */
export function insertBatchLine(text, { after, line }) {
  const crlf = text.includes('\r\n');
  const lines = (crlf ? text.replace(/\r\n/g, '\n') : text).split('\n');
  const at = lines.findIndex(l => l.startsWith(`- [x] ${after} — `));
  if (at < 0) throw new Error(`묶음 ${after} 줄을 찾지 못했다`);
  lines.splice(at + 1, 0, line);
  const out = lines.join('\n');
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

/** 재검증 줄을 넣는다 — `beforeText` 로 시작하는 줄 **앞**에 */
export function insertRecheckLine(text, { beforeText, line }) {
  const crlf = text.includes('\r\n');
  const lines = (crlf ? text.replace(/\r\n/g, '\n') : text).split('\n');
  const at = lines.findIndex(l => l.startsWith(beforeText));
  if (at < 0) throw new Error(`"${beforeText}" 로 시작하는 줄을 찾지 못했다`);
  lines.splice(at, 0, line);
  const out = lines.join('\n');
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

export function selftest() {
  let n = 0;
  const ok = (name, cond) => { n += 1; if (!cond) { throw new Error(`[selftest] ${name} 덫 실패`); } };

  // 앞 줄이 꼬리를 더 적고 있어도 건드리지 않는다 — 이것이 H-1 의 핵심이다
const src = '- [x] 359 — **나**.\n- [x] 360 — **가**. 누계 155~360 묶음 205개. **[자기 정정]** 이 줄의 시각을 고쳤다.\n';
  const out1 = insertBatchLine(src, { after: 360, line: '- [x] 361 — **새**.' });
  const lines = out1.split('\n');
  ok('새 줄이 그 줄 **아래**에', lines[2] === '- [x] 361 — **새**.');
  ok('그 줄의 꼬리를 끌어오지 않는다', lines[1].endsWith('**[자기 정정]** 이 줄의 시각을 고쳤다.'));
  ok('줄 수가 하나만 늘었다', lines.length === src.split('\n').length + 1);
  ok('오름차순이 깨지지 않는다', lines.findIndex(l => l.startsWith('- [x] 361')) > lines.findIndex(l => l.startsWith('- [x] 360')));

  // CRLF 보존
  const crlfIn = '- [x] 360 — **가**.\r\n- [x] 359 — **나**.\r\n';
  const crlfOut = insertBatchLine(crlfIn, { after: 360, line: '- [x] 361 — **새**.' });
  ok('CRLF 를 그대로 돌려준다', crlfOut.includes('\r\n') && !/[^\r]\n/.test(crlfOut));

  // 재검증 줄
  const re = insertRecheckLine('- 2026-11-28 09:45 362차 재검증(361)\n', { beforeText: '- 2026-11-28 09:45', line: '- 2026-11-28 10:00 363차 재검증(362)' });
  ok('재검증 줄이 앞에 들어간다', re.split('\n')[0].includes('363차'));

  // 없는 묶음이면 던진다 — 조용히 아무것도 하지 않는 쪽이 더 위험하다
  let threw = false;
  try { insertBatchLine('- [x] 359 — **나**.\n', { after: 999, line: 'x' }); } catch { threw = true; }
  ok('없는 묶음이면 던진다', threw);

  return n;
}
