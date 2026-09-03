// 죽은 라우트 정적 검사 (프로젝트 원칙 3-④ 자동화)
// src/App.tsx에 선언된 라우트와, 코드 전체의 navigate()/to=/Navigate 이동 대상을 대조해
// 존재하지 않는 경로로의 이동(=사용자가 누르면 빈 화면/리다이렉트)을 머지 전에 잡는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(rootDir, 'src');

// ── 1) App.tsx에서 선언된 라우트 수집 (중첩 <Route> 스택 추적) ──
const appSource = fs.readFileSync(path.join(srcDir, 'App.tsx'), 'utf8');
const declared = new Set(['/']);
const parentStack = [];
for (const line of appSource.split('\n')) {
  const match = line.match(/<Route\s+path="([^"]+)"/);
  if (match) {
    const p = match[1];
    if (p !== '*') {
      const full = p.startsWith('/')
        ? p
        : `${parentStack[parentStack.length - 1] || ''}/${p}`.replace(/\/+/g, '/');
      declared.add(full.replace(/\/$/, '') || '/');
      // 자식을 가진 라우트(자기 종결 /> 아님)는 부모 스택에 push
      if (!/\/>\s*$/.test(line.trim())) parentStack.push(full);
    }
  }
  if (/<\/Route>/.test(line)) parentStack.pop();
}

// ── 2) 코드 전체에서 내부 이동 대상 수집 ──
const targets = []; // { path, file, line }
const NAV_PATTERNS = [
  /navigate\(\s*['"`](\/[^'"`?#\s]*)/g, //  navigate('/x')
  /\bto=\{?['"`](\/[^'"`?#\s]*)/g, //       <NavLink to="/x"> / <Link to={'/x'}>
  /<Navigate\s+to="(\/[^"?#\s]*)"/g, //     <Navigate to="/x" />
];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split('\n');
      lines.forEach((lineText, i) => {
        if (lineText.includes('${')) return; // 동적 경로는 정적 검사 제외
        for (const re of NAV_PATTERNS) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(lineText)) !== null) {
            targets.push({ path: m[1].replace(/\/$/, '') || '/', file: path.relative(rootDir, full), line: i + 1 });
          }
        }
      });
    }
  }
}
walk(srcDir);

// ── 3) 대조 ──
const unknown = targets.filter((t) => !declared.has(t.path));
console.log(`선언 라우트 ${declared.size}개 / 이동 지점 ${targets.length}개 검사`);
if (unknown.length > 0) {
  console.error('\n❌ 존재하지 않는 라우트로의 이동 발견:');
  for (const u of unknown) console.error(`  ${u.file}:${u.line} → ${u.path}`);
  process.exit(1);
}
console.log('✅ 죽은 라우트 없음');
