#!/usr/bin/env node
/**
 * 입력칸 가로 넘침 가드 — `flex-1` 을 준 폼 요소는 **최소 너비를 스스로 정해야** 한다 (362, 355~359 리뷰 M-1).
 *
 * 363(360~362 리뷰 M-2): 처음에는 "`min-w-0` 이 있어야 한다" 로 적었는데, 그러면 **이미 의도해서
 * `min-w-[10rem]` 을 준 자리**(142 묶음의 자원 이름 칸)에도 `min-w-0` 을 더하게 되고 — 같은 속성이라
 * 뒤에 오는 쪽이 이기므로 — 더한 쪽이 **무동작이거나 의도를 덮는다**. 규칙을 "`min-w-*` 중 하나" 로
 * 바꾸고, **둘이 함께 있으면 신고**한다(서로 겨루는 두 클래스는 데드코드다 — CLAUDE.md §2).
 *
 * 왜: `flex-1` 만 준 `<input>` 은 **최소 너비가 내용 기준**(`min-width: auto`)이라 글꼴이 넓어지면
 * 줄어들지 못한다. 그래서 입력칸 + 고정폭 단추가 한 줄에 있는 창은 **글꼴에 따라** 창 밖으로 넘친다.
 * 358 에서 깃허브 리눅스 러너의 글꼴로 "태그 목록 관리" 창이 **420 > 412** 로 넘치는 것이 드러났고,
 * 그때는 **검사가 실제로 열어 재는 창 둘만** 고쳤다. 리뷰가 같은 모양 12곳이 남은 것을 찾아
 * 360 에서 전부 고쳤다 — 지점 PC 글꼴이 바뀌면 거기서도 보일 수 있는 결함이다.
 *
 * 왜 가드로 만들 수 있나(352 가 받아들인 경계선): 비교 대상이 **코드가 정본인 집합**이다 —
 * "`flex-1` 을 가진 폼 요소" 라는 집합에 "`min-w-*` 를 **정확히 하나** 가졌는가" 를 묻는다.
 * 말의 뜻을 해석하지 않고 **면제 목록도 두지 않는다**. 어떤 값을 줄지는 사람이 고르고(줄어들어도
 * 되는 칸은 `min-w-0`, 일정 폭이 필요한 칸은 `min-w-[10rem]` 처럼), 가드는 **"정했는가"** 와
 * **"둘이 겨루지 않는가"** 만 본다. 그 둘은 기계가 셀 수 있다.
 *
 * 한계: 한 줄 정규식으로는 `onChange={e => …}` 의 `>` 때문에 여는 태그가 끊겨 거의 다 놓친다.
 * 그래서 **중괄호 깊이**를 세며 여는 태그의 끝(`>`)을 찾는다. 주석 안의 태그는 세지 않는다
 * (`scripts/lib/blank-comments.mjs` — 331 에서 네 가드가 공용으로 쓰기 시작한 그 구현).
 *
 * 사용: node scripts/check-flex-inputs.mjs [--selftest]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from './lib/blank-comments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAGS = ['input', 'select', 'textarea'];

/** 여는 태그들을 돌려준다 — 중괄호 깊이를 세어 `>` 를 찾는다 */
// 372(369~371 리뷰 M-7): 370·371 이 미사용 export 를 정리할 때 **리뷰가 이름까지 적어 준**
//      `openTags` 를 빠뜨렸다(import 0건). 내부 함수로 돌린다 — 같은 파일의 셀프테스트만 쓴다.
function openTags(text) {
  const out = [];
  const unbalanced = []; // 366: 문자열 밖에서 짝이 안 맞는 `}` 를 만난 줄 — 호출부가 신고한다
  for (const tag of TAGS) {
    let from = 0;
    for (;;) {
      const re = new RegExp('<' + tag + '[\\s>]');
      const rel = text.slice(from).search(re);
      if (rel < 0) break;
      const start = from + rel;
      // 363(리뷰 M-3): 전에는 **문자열을 보지 않아** `placeholder="a>b"` 의 `>` 가 여는 태그를 끊어
      // `className` 을 못 봤고(거짓 통과), 문자열 안의 `}` 가 깊이를 음수로 만들어 **다음 태그까지
      // 삼켰다**. 331 의 `blank-comments.mjs` 가 세운 원칙("문자열·템플릿을 상태로 들고 간다")을 여기에도 쓴다.
      let i = start + tag.length + 1;
      let depth = 0;
      let quote = null; // ' " ` 중 하나
      for (; i < text.length; i += 1) {
        const c = text[i];
        if (quote !== null) {
          if (c === '\\') { i += 1; continue; }
          if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '{') depth += 1;
        // 366(리뷰 M-3): 전에는 음수 깊이를 0 으로 **되돌렸다**. 그 보정은 실제 src 에서 **한 번도
        // 발동하지 않고**(리뷰가 계수기로 확인) 덫도 따옴표 추적 덕에 통과했다 — 발동하지 않고 덫도 없는
        // 방어 코드는 데드코드다(CLAUDE.md §2). 이제 **그 자리에서 멈춘다** — 짝이 안 맞는 중괄호는
        // 이 파서가 다룰 수 없는 모양이고, 조용히 넘어가면 다음 태그를 삼킨다.
        else if (c === '}') { depth -= 1; if (depth < 0) { unbalanced.push(text.slice(0, i).split('\n').length); break; } }
        else if (c === '>' && depth === 0) break;
      }
      out.push({ tag, start, open: text.slice(start, i) });
      from = i;
    }
  }
  out.unbalanced = unbalanced;
  return out;
}

/**
 * 그 태그가 가진 `min-w-…` 클래스들 (366, 리뷰 L-9 로 좁혔다)
 *
 * **변형 접두는 세지 않는다**(`sm:min-w-[320px]` 은 기본값과 겨루지 않는다 — 전에는 겨룸으로 거짓 신고).
 * **줄어들 수 있는 값만** 최소 너비를 "정했다" 로 인정한다 — `min-w-full|min|fit|max` 는 오히려
 * 줄어들지 못하게 만들어 358 의 넘침을 그대로 재현하므로, 있어도 "정하지 않은" 것으로 본다.
 */
// 370(366~368 리뷰 L-6): 이 규칙은 "줄어들 수 있는 값인가" 만 본다 — `min-w-96`(24rem) 처럼
//      **큰 바닥**도 통과한다. 폰 폭(약 25rem)에서는 그 바닥이 358 의 넘침을 되풀이할 수 있다.
//      얼마가 "충분히 작은가" 는 레이아웃 판단이라 기계에 맡기지 않는다(352 의 경계선) —
//      대신 한계를 여기 적어 둔다. 142 가 의도해 둔 `min-w-[10rem]` 같은 바닥이 실제로 있다.
const SHRINKABLE = /^min-w-(0|\[[^\]]+\]|\d+(\.\d+)?|px)$/;
function minWidths(open) {
  return [...open.matchAll(/(?:^|[\s"'`{])(min-w-(?:\[[^\]]+\]|[\w.]+))/g)]
    .map(m => m[1])
    .filter(c => SHRINKABLE.test(c));
}
/** `flex-1` 인데 최소 너비가 없거나, 서로 겨루는 최소 너비가 둘 이상인 자리 */
function violations(text) {
  const out = [];
  for (const t of openTags(blankComments(text))) {
    if (!/\bflex-1\b/.test(t.open)) continue;
    const mins = minWidths(t.open);
    const line = text.slice(0, t.start).split('\n').length;
    if (mins.length === 0) out.push({ tag: t.tag, line, why: 'none' });
    else if (mins.length > 1) out.push({ tag: t.tag, line, why: 'conflict', mins });
  }
  return out;
}

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * 짝이 안 맞는 `}` 가 있는 줄들 (372) — **주석을 지운 글**을 본다.
 * 이 한 줄이 배선이라 덫이 보지 못했다: 변이로 원문을 넘기게 바꿔도 셀프테스트가 통과했다
 * (지금 src 에 주석 처리한 JSX 가 없어 거짓 경보가 나지 않기 때문이다). 순수 함수로 떼어내
 * 덫이 **그 결정 자체**를 찌르게 한다(364 에서 같은 모양을 같은 방법으로 고쳤다).
 */
function unbalancedLines(raw) {
  return openTags(blankComments(raw)).unbalanced || [];
}

function selftest() {
  let trapCount = 0;
  const ok = (name, cond) => { trapCount += 1; if (!cond) { console.error(`[selftest] ${name} 덫 실패`); process.exit(1); } };

  ok('flex-1 만 있으면 잡는다', violations('<input className="flex-1 px-3" />').length === 1);
  ok('min-w-0 이 있으면 통과', violations('<input className="flex-1 min-w-0 px-3" />').length === 0);
  ok('flex-1 이 없으면 보지 않는다', violations('<input className="w-full px-3" />').length === 0);
  // 한 줄 정규식이 놓치던 모양 — 화살표 함수의 `>` 가 여는 태그를 끊는다
  ok('화살표 함수가 끼어도 찾는다', violations('<input value={v} onChange={e => set(e.target.value)}\n  className="flex-1 px-3" />').length === 1);
  // 363(리뷰 M-3): 문자열 안의 `>` 가 여는 태그를 끊어 className 을 못 보던 자리 — 거짓 통과였다
  ok('문자열 안의 꺾쇠에 속지 않는다', violations('<input placeholder="a>b" className="flex-1 px-3" />').length === 1);
  // 363(리뷰 M-3): 문자열 안의 `}` 가 깊이를 음수로 만들어 **다음 태그까지 삼켰다**
  ok('문자열 안의 닫는 중괄호에 속지 않는다', violations('<input placeholder="}" className="flex-1 min-w-0" />\n<input className="flex-1" />').length === 1);
  // 363(리뷰 M-2): 서로 겨루는 최소 너비 둘은 데드코드다
  ok('최소 너비가 둘이면 신고', violations('<input className="flex-1 min-w-0 min-w-[10rem]" />').length === 1);
  ok('최소 너비가 둘이면 이유를 적는다', violations('<input className="flex-1 min-w-0 min-w-[10rem]" />')[0].why === 'conflict');
  ok('의도한 최소 너비 하나면 통과', violations('<input className="flex-1 min-w-[10rem] px-3" />').length === 0);
  // 363(리뷰 L-2): 줄 번호는 blankComments 의 길이 보존에 기댄다 — 여러 줄 주석 뒤에서도 맞아야 한다
  ok('블록 주석 뒤의 줄 번호', violations('/* 가\n나\n다 */\n<input className="flex-1" />')[0].line === 4);
  // select·textarea 도 같은 규칙
  ok('select 도 본다', violations('<select className="flex-1" />').length === 1);
  ok('textarea 도 본다', violations('<textarea className="flex-1" />').length === 1);
  // 주석 안의 태그는 세지 않는다(331 의 공용 구현)
  ok('줄 주석 안은 세지 않는다', violations('// <input className="flex-1" />\n<input className="flex-1 min-w-0" />').length === 0);
  ok('블록 주석 안은 세지 않는다', violations('/* <input className="flex-1" /> */\n<input className="flex-1 min-w-0" />').length === 0);
  // `flex-1` 과 비슷한 다른 낱말에 속지 않는다
  ok('flex-10 같은 말에 속지 않는다', violations('<input className="flex-100 px-3" />').length === 0);
  // 366(리뷰 L-9): min-w-full|min|fit|max 는 오히려 **줄어들지 못하게** 만든다 — 정한 것으로 보지 않는다
  ok('min-w-full 은 줄어들 수 있는 값이 아니다', violations('<input className="flex-1 min-w-full" />').length === 1);
  ok('min-w-fit 도 아니다', violations('<input className="flex-1 min-w-fit" />').length === 1);
  ok('min-w-px 는 줄어들 수 있다', violations('<input className="flex-1 min-w-px" />').length === 0);
  ok('변형 접두는 겨룸으로 세지 않는다', violations('<input className="flex-1 min-w-0 sm:min-w-[320px]" />').length === 0);
  ok('min-w 가 없으면 잡는다(비슷한 말에 속지 않는다)', violations('<input className="flex-1 w-min max-w-0" />').length === 1);
  // 줄 번호를 사실대로 돌려준다
  ok('줄 번호', violations('첫 줄\n둘째 줄\n<input className="flex-1" />')[0].line === 3);
  // 369(366~368 리뷰 H-4): 366 은 "발동하지 않고 덫도 없는 방어 코드는 데드코드다" 라며 음수 깊이
  //      보정을 지우고 **신고**로 바꿨는데, 그 새 경로도 덫이 0종이고 지금 src 에서 0번 발동한다 —
  //      리뷰가 세 변이(옛 보정 되돌리기·수집 비우기·호출부 신고 삭제)로 전부 통과하는 것을 보였다.
  //      경로 자체는 도달 가능하다(문자열 밖의 짝 없는 `}`) — 그래서 지우지 않고 덫을 박는다.
  //      도달하는 글은 **여는 태그 안**의 짝 없는 `}` 다(깊이는 태그 안에서만 센다) — `className={x}}`
  //      꼴의 오타이고, 조용히 넘어가면 깊이가 음수로 남아 **다음 태그까지 삼킨다**(363 이 겪은 피해).
  ok('여는 태그 안의 짝 없는 } 를 모은다', (openTags('<input className={x}} />\n').unbalanced || []).length === 1);
  ok('짝이 안 맞는 } 의 줄 번호를 적는다', (openTags('첫 줄\n<input className={x}} />\n').unbalanced || [])[0] === 2);
  ok('짝이 맞으면 모으지 않는다', (openTags('<input className={x} />\n').unbalanced || []).length === 0);
  ok('문자열 안의 } 는 짝으로 세지 않는다', (openTags('<input placeholder="}" />\n').unbalanced || []).length === 0);
  // 372(리뷰 L-3): 본검사가 주석을 지운 글을 넘기는지 — 주석 처리한 JSX 는 신고 대상이 아니다
  ok('주석 처리한 태그의 } 는 신고하지 않는다', unbalancedLines('// <input className={x}} />\n').length === 0);
  ok('블록 주석 안의 } 도 신고하지 않는다', unbalancedLines('/* <input className={x}} /> */\n').length === 0);
  ok('주석 밖의 } 는 여전히 신고한다', unbalancedLines('// 설명\n<input className={x}} />\n').length === 1);

  console.log(`[check-flex-inputs] selftest OK — 덫 ${trapCount}종 통과(flex-1·최소 너비·겨룸·화살표 함수·문자열·세 태그·주석·줄 번호·줄어들 수 있는 값·짝 없는 중괄호 — **열거는 분류라 수와 달리 손으로 적는다. 372 에서 낡은 열거를 고쳤다**). **이 수는 세어서 찍는다** — 손으로 적지 말 것(352~354 리뷰 M-2)`);
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }
selftest();

const problems = [];
for (const full of listFiles(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  // 366(리뷰 M-3): 문자열 밖에서 짝이 안 맞는 `}` 는 이 파서가 다룰 수 없는 모양이다 — 조용히 넘기지 않는다
  // 372(369~371 리뷰 L-3): 이 경로만 **원문**을 넘겨, 주석 처리한 JSX 한 줄이 짝 없는 `}` 로
  //      신고될 수 있었다(`// <input className={x}} />` 로 확인). `violations()` 는 이미
  //      `blankComments` 를 지나므로 **같은 입력**으로 통일한다 — 거짓을 말하는 가드는 금지다(303).
  for (const line of unbalancedLines(fs.readFileSync(full, 'utf8'))) {
    problems.push(`${rel}:${line} 여는 태그 안에서 짝이 안 맞는 \`}\` 를 만났습니다 — 이 파서가 태그 끝을 찾을 수 없습니다(모양을 단순하게 하거나 가드를 고치세요)`);
  }
  for (const v of violations(fs.readFileSync(full, 'utf8'))) {
    if (v.why === 'conflict') {
      problems.push(`${rel}:${v.line} <${v.tag}> 에 최소 너비가 둘이다(${v.mins.join(' · ')}) — 같은 속성이라 뒤에 오는 쪽이 이기고 앞쪽은 데드코드다. 하나만 두세요`);
      continue;
    }
    problems.push(`${rel}:${v.line} <${v.tag}> 에 \`flex-1\` 은 있고 **줄어들 수 있는** 최소 너비가 없다 — 글꼴이 넓어지면 줄어들지 못해 창 밖으로 넘친다(358 에서 실제로 420 > 412). \`min-w-0\` 이나 \`min-w-[Nrem]\` 을 주세요(\`min-w-full|min|fit|max\` 는 반대로 못 줄어들게 합니다)`);
  }
}

if (problems.length > 0) {
  console.error(`[check-flex-inputs] ${problems.length}건:`);
  for (const p of problems) console.error('  - ' + p);
  console.error('  → 줄어들어도 되는 칸이면 `min-w-0`, 일정 폭이 필요하면 `min-w-[Nrem]` 처럼 **하나만** 주세요.');
  process.exit(1);
}
console.log('[check-flex-inputs] OK — `flex-1` 을 가진 입력칸·선택칸·여러줄칸 전부가 최소 너비를 하나만 가집니다');
