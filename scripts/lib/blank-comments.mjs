/**
 * 주석 지우기 — 모든 소스 가드가 함께 쓰는 하나뿐인 구현 (331, 328~330 리뷰 H-2).
 *
 * 왜 공용인가: 같은 함수가 네 가드에 복제돼 있었고 **셋은 틀린 판**이었다. 문자열 상태를 보지 않아
 * `accept="image/*"` 의 `/*` 를 블록 주석 시작으로 보고 **파일 끝까지 공백으로 지웠다** — 그래서
 * `Customers/index.tsx` 뒤 293줄과 `Treatments/index.tsx` 뒤 283줄이 **조용히 검사 밖**이었다.
 * 그 자리에 위반을 심어도 가드는 0건을 말했다(리뷰가 재현했다). 이 구현은 문자열·템플릿·정규식을
 * 상태로 들고 가며, 파일 끝에서 짝이 맞지 않으면 **던진다** — 조용히 틀린 답을 주지 않는다.
 *
 * 줄 수는 보존한다(공백으로 치환하므로 줄 번호가 밀리지 않는다).
 *
 * 이 구현의 내력(331 에서 여기로 옮겨 왔다 — 334 에서 설명도 함께 옮겼다):
 * 298 은 정규식으로 블록 주석을 먼저 지웠다. 그래서 **줄 주석 안의 `/*`**(예: `// 정본은 /api/photos/*`)
 * 부터 다음 닫는 기호까지가 통째로 공백이 되어 **그 사이의 진짜 창이 사라졌다** — 가드가 조용히
 * 놓치는 자리를 298 이 새로 만든 것이다(297~299 리뷰 M-6). 문자열·템플릿·주석 상태를 들고 한 문자씩
 * 훑으면 그 혼동이 없고, 길이를 유지하므로 여러 가드가 같은 함수를 쓸 수 있다.
 */
/** 이 따옴표가 **같은 줄 안에서** 닫히는가 — 닫히지 않으면 JSX 본문의 아포스트로피다 */
function closesOnSameLine(text, at, quote) {
  const nl = text.indexOf('\n', at + 1);
  const line = text.slice(at + 1, nl < 0 ? text.length : nl);
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\') { i += 1; continue; }
    if (line[i] === quote) return true;
  }
  return false;
}

export function blankComments(text) {
  let out = '';
  let i = 0;
  let mode = 'code'; // code | line | block | sq | dq | tpl | regex
  let prev = '';     // 코드에서 마지막으로 본 뜻 있는 글자 — 정규식 자리인지 가린다
  while (i < text.length) {
    const c = text[i], d = text[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      // 306(300~302 리뷰 LOW-1): 정규식 리터럴 안의 `/*`·따옴표에 속아 **진짜 창을 삼켰다**
      // (`const re = /[/*]/;` 뒤의 창이 사라졌다). 정규식은 한 상태로 따로 들고 간다.
      // 310(303~308 리뷰 M-2): `<` 를 정규식 자리로 보던 탓에 **JSX 닫는 태그 `</span>` 의 `/`** 가
      // 정규식 시작이 되고, 같은 줄 뒤쪽 `{/* … */}` 의 `/` 가 그것을 닫아 **주석이 주석으로 안 보였다**
      // (주석 속 가짜 창이 진짜 창으로 세어졌다 — 거짓 경보). `<`·`>` 를 빼고, 같은 줄에서 닫히는
      // `/` 가 있을 때만 정규식으로 본다(정규식 리터럴은 한 줄 안에서 닫힌다).
      const closesOnLine = c === '/' && /^[^\n]*[^\\]\//.test(text.slice(i + 1, text.indexOf('\n', i) < 0 ? undefined : text.indexOf('\n', i)));
      if (c === '/' && '=(,:[!&|?{};+-*%~^'.includes(prev) && closesOnLine) { mode = 'regex'; out += c; i += 1; continue; }
      // 331(328~330 리뷰 H-2 후속): `'`·`"` 문자열은 **한 줄 안에서 닫힌다**(JS 문법). 같은 줄에
      // 닫는 짝이 없으면 그것은 문자열이 아니라 **JSX 본문의 아포스트로피**다(`<p>Let's go</p>`).
      // 문자열로 보면 같은 줄 뒤쪽의 `//` 주석을 지우지 못해 **주석 속 마크업을 실물로 센다**
      // (316 실사고). 그래서 닫히는지 먼저 본다.
      if ((c === "'" || c === '"') && closesOnSameLine(text, i, c)) mode = c === "'" ? 'sq' : 'dq';
      else if (c === '`') mode = 'tpl';
      if (!/\s/.test(c)) prev = c;
      out += c; i += 1; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += c; } else out += ' ';
      i += 1; continue;
    }
    if (mode === 'block') {
      if (c === '*' && d === '/') { mode = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? c : ' '; i += 1; continue;
    }
    if (mode === 'regex') {
      if (c === '\\') { out += text.slice(i, i + 2); i += 2; continue; }
      if (c === '[') { // 문자 클래스 안의 / 는 끝이 아니다
        while (i < text.length && text[i] !== ']') { out += text[i]; if (text[i] === '\\') { out += text[i + 1] ?? ''; i += 1; } i += 1; }
        continue;
      }
      if (c === '/' || c === '\n') { mode = 'code'; prev = '/'; }
      out += c; i += 1; continue;
    }
    // 문자열·템플릿 — 이스케이프를 건너뛰고 닫는 짝에서 code 로 돌아온다
    if (c === '\\') { out += text.slice(i, i + 2); i += 2; continue; }
    // 306(리뷰 LOW-1): `'`·`"` 문자열은 **줄을 넘지 못한다**(JS 문법). JSX 본문의 아포스트로피
    // (`<p>Let's go</p>`)에 걸려 상태가 파일 끝까지 이어지면 뒤의 주석 속 창이 진짜로 세어지거나
    // 진짜 창이 사라졌다 — 301 판의 폭발 반경이 298 판보다 컸던 이유다. 줄바꿈에서 코드로 돌아온다.
    if (c === '\n' && (mode === 'sq' || mode === 'dq')) { mode = 'code'; prev = ''; out += c; i += 1; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) { mode = 'code'; prev = c; }
    out += c; i += 1; continue;
  }
  // 템플릿·블록 주석이 끝까지 닫히지 않았다면 이 결과를 믿을 수 없다 — 조용히 틀린 답을 주지 않는다
  if (mode === 'tpl' || mode === 'block') {
    throw new Error(`blankComments: 파일 끝에서 '${mode}' 상태로 남았다 — 백틱·주석 짝이 맞지 않거나 스캐너가 못 보는 모양이 있다`);
  }
  return out;
}
