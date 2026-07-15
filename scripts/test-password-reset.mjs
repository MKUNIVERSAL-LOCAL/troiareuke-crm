import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const appUrlSource = fs.readFileSync('src/lib/appUrl.ts', 'utf8')
  .replaceAll('import.meta.env.VITE_PUBLIC_APP_URL', JSON.stringify(''))
  .replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'));
const transpiledAppUrl = ts.transpileModule(appUrlSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const appUrlModule = Buffer.from(transpiledAppUrl).toString('base64');
const { getPasswordResetRedirectUrl, isPasswordRecoveryHash } = await import(`data:text/javascript;base64,${appUrlModule}`);

assert.equal(isPasswordRecoveryHash('#type=recovery&access_token=token'), true);
assert.equal(isPasswordRecoveryHash('#error=access_denied&error_code=otp_expired&error_description=expired'), true);
assert.equal(
  isPasswordRecoveryHash('#error=access_denied&error_description=Google+OAuth+failed'),
  false,
  '일반 OAuth 오류를 비밀번호 재설정 오류로 오인하면 안 된다.',
);

assert.equal(
  getPasswordResetRedirectUrl({ publicAppUrl: 'https://example.com/crm' }),
  'https://example.com/crm/reset-password',
  '공개 앱의 하위 경로를 유지해야 한다.',
);

assert.equal(
  getPasswordResetRedirectUrl({
    baseUrl: '/troiareuke-crm/',
    location: { origin: 'https://example.github.io', protocol: 'https:' },
  }),
  'https://example.github.io/troiareuke-crm/reset-password',
  '웹 환경의 BASE_URL을 fallback으로 사용해야 한다.',
);

assert.equal(
  getPasswordResetRedirectUrl({
    publicAppUrl: 'https://example.com/crm/',
    location: { origin: 'null', protocol: 'file:' },
    isElectron: true,
  }),
  'https://example.com/crm/reset-password',
  'Electron은 설정된 공개 웹 URL을 사용해야 한다.',
);

assert.throws(
  () => getPasswordResetRedirectUrl({
    location: { origin: 'null', protocol: 'file:' },
    isElectron: true,
  }),
  /관리자에게 문의/,
  '공개 URL이 없는 Electron에서는 명확히 실패해야 한다.',
);

assert.throws(
  () => getPasswordResetRedirectUrl({ publicAppUrl: 'javascript:alert(1)' }),
  /관리자에게 문의/,
  '비 HTTP(S) redirect URL을 거부해야 한다.',
);

function firstInlineScript(file) {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, `${file}에 inline script가 있어야 한다.`);
  return match[1];
}

let pagesRedirect = '';
const notFoundLocation = {
  protocol: 'https:',
  host: 'example.github.io',
  pathname: '/troiareuke-crm/reset-password',
  search: '?source=email',
  hash: '#type=recovery',
  replace(url) { pagesRedirect = url; },
};
vm.runInNewContext(firstInlineScript('public/404.html'), {
  window: { location: notFoundLocation },
});
assert.equal(
  pagesRedirect,
  'https://example.github.io/troiareuke-crm/?/reset-password&source=email#type=recovery',
  'Pages 404 fallback이 경로·query·hash를 보존해야 한다.',
);

let rootRedirect = '';
const rootNotFoundLocation = {
  protocol: 'https:',
  host: 'crm.example.com',
  pathname: '/reset-password',
  search: '',
  hash: '#type=recovery',
  replace(url) { rootRedirect = url; },
};
vm.runInNewContext(firstInlineScript('public/404.html'), {
  window: { location: rootNotFoundLocation },
});
assert.equal(
  rootRedirect,
  'https://crm.example.com/?/reset-password#type=recovery',
  '루트 도메인에서도 SPA 경로를 보존하고 리다이렉트 루프를 만들지 않아야 한다.',
);

let restoredRoute = '';
const indexLocation = {
  pathname: '/troiareuke-crm/',
  search: '?/reset-password&source=email',
  hash: '#type=recovery',
};
vm.runInNewContext(firstInlineScript('index.html'), {
  window: {
    location: indexLocation,
    history: { replaceState(_state, _title, url) { restoredRoute = url; } },
  },
});
assert.equal(
  restoredRoute,
  '/troiareuke-crm/reset-password?source=email#type=recovery',
  'index.html이 Pages fallback 경로를 SPA 경로로 복원해야 한다.',
);

console.log('password reset URL tests: OK');
