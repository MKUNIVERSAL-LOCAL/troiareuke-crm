// 서버 코드 지문 (229, 리뷰 H-1)
// 왜: 재배포 성공 판정이 "라우트가 401 을 주는지" 였는데, 아직 재배포되지 않은 구버전 서버도 401 을 준다.
//     그래서 빌드가 실패해 구 컨테이너가 그대로 돌고 있어도 "✅ 최신 코드 응답 확인" 이 찍혔다(가짜 성공).
// 방법: server/src 의 실행 코드(.js, 테스트 제외)를 해시해 /health 로 알린다. 배포 스크립트가 로컬 해시와 비교한다.
//     줄바꿈은 \n 으로 정규화한다 — Windows 작업 사본(CRLF)과 NAS 배포본(LF)이 같은 값을 내야 한다.
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** server/src 실행 코드의 지문(앞 12자) — 파일 이름과 내용이 같으면 어느 기기에서도 같은 값 */
export function computeCodeHash(dir = SERVER_SRC_DIR) {
  const files = readdirSync(dir).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).sort();
  const h = createHash('sha256');
  for (const name of files) {
    h.update(name);
    h.update('\u0000');
    h.update(readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex').slice(0, 12);
}

export const CODE_HASH = computeCodeHash();
