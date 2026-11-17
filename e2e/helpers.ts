import { deflateSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';

/**
 * E2E 공통 흐름 — 로컬 모드 빌드(dist-e2e)에서 가입·온보딩·고객 등록까지.
 * smoke.spec(핵심 흐름)과 before-after.spec(킬러 기능 ②)이 같은 진입 절차를 공유한다.
 */

export interface E2EAccount {
  run: string;
  shop: string;
  email: string;
  password: string;
  customer: string;
  customerPhone: string;
}

export function makeAccount(prefix: string): E2EAccount {
  const run = Date.now().toString().slice(-7);
  return {
    run,
    shop: `${prefix}샵${run}`,
    email: `${prefix.toLowerCase()}-${run}@smoke.test`,
    password: 'smoke-pass-1234',
    customer: `테스트고객${run.slice(-3)}`,
    customerPhone: `010-${run.slice(0, 4)}-${run.slice(3, 7)}`,
  };
}

export async function dismissToasts(page: Page) {
  const close = page.getByRole('button', { name: '닫기' });
  while (await close.count()) {
    await close.first().click().catch(() => {});
    if ((await close.count()) === 0) break;
  }
}

/** 가입(로컬 모드) → 온보딩(직원 1명 '김테스트', 시술 1개 '테스트관리') → 대시보드 */
export async function signupAndOnboard(page: Page, acc: E2EAccount) {
  await page.goto('/signup');
  await page.getByPlaceholder('예: 아르케스파 강남점').fill(acc.shop);
  await page.getByPlaceholder('example@email.com').fill(acc.email);
  await page.getByPlaceholder('010-0000-0000').fill('010-1234-5678');
  await page.getByPlaceholder('123-45-67890').fill('1234567890');
  await page.getByPlaceholder('비밀번호 (8자 이상)').fill(acc.password);
  await page.getByPlaceholder('비밀번호 재입력').fill(acc.password);
  await page.getByRole('button', { name: '다음 단계' }).click();
  await page.getByText('전체 동의', { exact: true }).click();
  await page.getByRole('button', { name: '무료 시작하기' }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });

  await page.getByPlaceholder('예: 더마 에스테틱').fill(acc.shop);
  await page.getByRole('button', { name: '피부관리실', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByPlaceholder('직원 1 이름').fill('김테스트');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '시술 항목 추가' }).click();
  await page.getByPlaceholder('시술명').fill('테스트관리');
  await page.getByPlaceholder('분', { exact: true }).fill('60');
  await page.getByPlaceholder('가격 (원)').fill('50000');
  await expect(page.getByText(/총 1개 시술 항목이 등록됩니다/)).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click(); // 외부 연동(정보)
  await page.getByRole('button', { name: '다음', exact: true }).click(); // 요금제
  await expect(page.getByText('설정 완료!')).toBeVisible();
  await page.getByRole('button', { name: '더마솔루션 시작하기' }).click();
  await page.waitForURL(url => !/\/onboarding/.test(url.pathname), { timeout: 20_000 });
  await expect(page.getByRole('link', { name: /고객 관리/ }).first()).toBeVisible({ timeout: 15_000 });
}

/** 고객 1명 등록 (개인정보 동의 포함) */
export async function createCustomer(page: Page, acc: E2EAccount) {
  await page.goto('/customers');
  await page.getByRole('button', { name: '고객 추가' }).click();
  await page.getByPlaceholder('홍길동').fill(acc.customer);
  await page.getByPlaceholder('010-0000-0000').fill(acc.customerPhone);
  await page.getByText('[필수] 개인정보 수집·이용 동의').click();
  await page.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByText(acc.customer).filter({ visible: true }).first()).toBeVisible();
  await dismissToasts(page);
}

/** 로컬 모드 세션의 역할을 슈퍼어드민으로 바꿔 어드민 콘솔에 진입 (AuthContext가 localStorage 세션을 그대로 복원한다) */
export async function becomeSuperadmin(page: Page) {
  await page.evaluate(() => {
    const key = 'troiareuke_auth_user';
    const u = JSON.parse(localStorage.getItem(key) || 'null');
    if (u) localStorage.setItem(key, JSON.stringify({ ...u, role: 'superadmin' }));
  });
  await page.reload();
}

/** 테스트용 단색 PNG(가로세로 size px) — 시술 사진 업로드 입력에 쓴다 */
export function solidPng(size: number, rgb: [number, number, number]): Buffer {
  // 최소 PNG 인코더 (filter 0, 8bit RGB) — 외부 의존 없이 유효한 이미지를 만든다
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = rgb[0]; row[2 + x * 3] = rgb[1]; row[3 + x * 3] = rgb[2]; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
