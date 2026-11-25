#!/usr/bin/env node
/**
 * 서버 단위 테스트 실행기 (229, 리뷰 M-2)
 * `node --test "server/src/*.test.js"` 글롭은 Node 21+ 에서만 확장된다(CI·Docker 는 Node 20).
 * 디렉터리 인자도 환경에 따라 파일로 해석돼 실패했다 → 여기서 파일 목록을 직접 만들어 넘긴다.
 * 새 *.test.js 파일은 자동으로 포함된다.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'server', 'src');
const files = readdirSync(dir).filter(f => f.endsWith('.test.js')).sort().map(f => join('server', 'src', f));

if (files.length === 0) {
  console.error('[run-server-tests] server/src 에 *.test.js 가 없습니다.');
  process.exit(1);
}

const r = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
