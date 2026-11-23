import { test, expect } from '@playwright/test';
import { buildAliasBook, ALIAS_STOP_WORDS } from '../src/lib/aiAlias';

// AI 챗봇 가명화는 외부 AI에 무엇이 나가는지를 정하는 순수 함수 — 브라우저 없이 규칙을 그대로 고정한다 (83, 2026-11-20).
// 규칙: 번호는 세션 동안 고객 id에 고정 / 질문·이전 답변의 이름도 가명으로 / CRM 어휘·'고객#…' 이름 제외 / 앞 경계 + 긴 이름 우선 / 동명이인은 첫 번호 + 전원 목록

test('가명은 고객 id에 고정되고, 목록이 바뀌어도 같은 사람은 같은 번호를 쓴다', () => {
  const numbers = new Map<string, number>();
  const first = buildAliasBook([{ id: 'a', name: '김민지' }, { id: 'b', name: '박서준' }, { id: 'c', name: '이하늘' }], numbers);
  expect(first.aliasOf('a')).toBe('고객#1');
  expect(first.aliasOf('c')).toBe('고객#3');
  // b가 삭제되고 d가 새로 생겨도 a·c의 번호는 그대로, d는 max+1
  const second = buildAliasBook([{ id: 'a', name: '김민지' }, { id: 'c', name: '이하늘' }, { id: 'd', name: '최유리' }], numbers);
  expect(second.aliasOf('a')).toBe('고객#1');
  expect(second.aliasOf('c')).toBe('고객#3');
  expect(second.aliasOf('d')).toBe('고객#4');
  expect(second.aliasOf(undefined)).toBe('-');
  expect(second.aliasOf('zzz')).toBe('고객(미등록)');
});

test('질문 속 이름은 가명으로, 답변 속 가명은 이름으로 — 왕복이 맞는다', () => {
  const book = buildAliasBook([{ id: 'a', name: '김민지' }, { id: 'b', name: '박서준' }], new Map());
  expect(book.forwardAlias('김민지 마지막 방문이 언제야? 박서준님도.')).toBe('고객#1 마지막 방문이 언제야? 고객#2님도.');
  expect(book.deAlias('고객#1은 11월 3일, 고객#2은 10월 20일에 다녀갔습니다. 고객#99는 모름')).toBe('김민지은 11월 3일, 박서준은 10월 20일에 다녀갔습니다. 고객#99는 모름');
  // 고객#12와 고객#1을 섞지 않는다
  const many = buildAliasBook(Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `고객이름${i}` })), new Map());
  expect(many.deAlias('고객#12 / 고객#1')).toBe('고객이름11 / 고객이름0');
});

test('CRM 어휘·고객#꼴 이름은 치환하지 않고, 앞 경계와 긴 이름 우선을 지킨다', () => {
  const book = buildAliasBook([
    { id: 'w', name: '고객' }, { id: 'x', name: '매출' }, { id: 'y', name: '고객#3' },
    { id: 'p', name: '김민' }, { id: 'q', name: '김민지' }, { id: 'r', name: 'A.B' },
  ], new Map());
  expect(ALIAS_STOP_WORDS.has('고객')).toBe(true);
  // 어휘 이름의 고객이 있어도 질문 문장과 모델의 '고객#N' 표기는 멀쩡하다
  expect(book.forwardAlias('이번 달 매출과 고객#3 상태')).toBe('이번 달 매출과 고객#3 상태');
  // 긴 이름 우선: 김민지는 김민(#4)이 아니라 김민지(#5)
  expect(book.forwardAlias('김민지 방문, 김민 방문')).toBe('고객#5 방문, 고객#4 방문');
  // 앞 경계: 다른 한글에 붙은 '김민지'(박김민지)는 사람 이름이 아니다. 뒤에는 조사가 붙어도 치환
  expect(book.forwardAlias('박김민지는 직원, 김민지는 고객')).toBe('박김민지는 직원, 고객#5는 고객');
  // 정규식 특수문자 이름
  expect(book.forwardAlias('A.B 예약, AxB 예약')).toBe('고객#6 예약, AxB 예약');
});

test('동명이인은 첫 번호로 치환되고 전원 번호 목록을 돌려준다', () => {
  const book = buildAliasBook([{ id: 'a', name: '김영희' }, { id: 'b', name: '박서준' }, { id: 'c', name: '김영희' }], new Map());
  expect(book.forwardAlias('김영희 결제')).toBe('고객#1 결제');
  expect(book.duplicates).toEqual([['고객#1', '고객#3']]);
  expect(book.deAlias('고객#3')).toBe('김영희');
});

test('글자 없는 이름·라틴 CRM 어휘 이름은 치환하지 않고, 붙어 있는 두 이름은 모두 치환된다', () => {
  const book = buildAliasBook([{ id: 'n', name: '1234' }, { id: 'p', name: '010-1234' }, { id: 'v', name: 'VIP' }, { id: 'a', name: '박서준' }, { id: 'b', name: '김민지' }], new Map());
  expect(book.forwardAlias('1234원 결제, 010-1234로 연락, VIP 고객')).toBe('1234원 결제, 010-1234로 연락, VIP 고객');
  // 구분 기호로 이어진 두 이름은 모두 치환. 띄어쓰기 없이 붙여 쓴 이름("박서준김민지")은 앞 글자가 한글이라 사람 이름으로 보지 않는다(의도된 한계)
  expect(book.forwardAlias('박서준·김민지 둘 다, 박서준/김민지')).toBe('고객#4·고객#5 둘 다, 고객#4/고객#5');
  // 시술 메모 같은 자유 텍스트도 같은 규칙
  expect(book.forwardAlias('- 2026-11-20 | 고객#4 | 김민지 소개로 방문 | 단건')).toBe('- 2026-11-20 | 고객#4 | 고객#5 소개로 방문 | 단건');
});

test('고객이 없으면 문장은 그대로다', () => {
  const book = buildAliasBook([], new Map());
  expect(book.forwardAlias('이번 달 매출 알려줘')).toBe('이번 달 매출 알려줘');
  expect(book.duplicates).toEqual([]);
});
