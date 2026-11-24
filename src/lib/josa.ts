/**
 * 한국어 조사 자동 선택 — '을(를)'·'이(가)' 같은 플레이스홀더가 화면에 그대로 나가지 않게 (15차 점검 #L1, 2026-11-24)
 * 마지막 글자의 받침으로 고른다. 한글 음절·숫자(영/일/이…)·영문(l·m·n·r 받침)·닫는 인용부호/괄호를 처리하고,
 * 판단할 수 없으면 받침 없는 쪽(를/가/는/와/로)을 쓴다.
 */
export type JosaPair = '을/를' | '이/가' | '은/는' | '과/와' | '으로/로';

const FORMS: Record<JosaPair, [withFinal: string, withoutFinal: string]> = {
  '을/를': ['을', '를'], '이/가': ['이', '가'], '은/는': ['은', '는'], '과/와': ['과', '와'], '으로/로': ['으로', '로'],
};
const DIGIT_FINAL: Record<string, number> = { '0': 1, '1': 8, '2': 0, '3': 1, '4': 0, '5': 0, '6': 1, '7': 8, '8': 8, '9': 0 }; // 종성 인덱스(0 없음·8 ㄹ·그 외 1)
const LATIN_FINAL: Record<string, number> = { l: 8, r: 8, m: 1, n: 1 };

/** 마지막 글자의 종성 인덱스 — 0: 받침 없음, 8: ㄹ, 그 외: 받침 있음, null: 판단 불가 */
function finalOf(word: string): number | null {
  const w = word.replace(/[\s'"\u2019\u201d)\]]+$/, ''); // 닫는 인용부호·괄호는 건너뛰고 본 글자를 본다
  const ch = w[w.length - 1];
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
  if (ch in DIGIT_FINAL) return DIGIT_FINAL[ch];
  const lower = ch.toLowerCase();
  if (/[a-z]/.test(lower)) return LATIN_FINAL[lower] ?? 0;
  return null;
}

/** 단어 뒤에 맞는 조사를 붙여 돌려준다: josa('회차권', '을/를') → '회차권을', josa("'김수아'", '이/가') → "'김수아'가" */
export function josa(word: string, pair: JosaPair): string {
  const fin = finalOf(word);
  const [withFinal, withoutFinal] = FORMS[pair];
  if (fin === null || fin === 0) return word + withoutFinal;
  if (pair === '으로/로' && fin === 8) return word + withoutFinal; // ㄹ 받침은 '로'
  return word + withFinal;
}
