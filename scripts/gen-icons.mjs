/**
 * SVG → PNG 아이콘 생성 스크립트 (Node.js, sharp 불필요)
 * canvas API 없이 SVG 파일을 public/icons/ 에 그대로 PNG-like SVG로 저장.
 * 실제 PNG가 필요하면 sharp 또는 디자이너 제공 파일로 교체.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

function makeSVGIcon(size, maskable = false) {
  const pad = maskable ? size * 0.15 : size * 0.12;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size / 2) - pad;
  const innerR = outerR * 0.45;

  const pts = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#1a3a8f"/>
  <polygon points="${pts.join(' ')}" fill="none" stroke="white" stroke-width="${(size / 512 * 28).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
}

// 192x192
writeFileSync(join(iconsDir, 'icon-192.png'), makeSVGIcon(192), 'utf-8');
// 512x512
writeFileSync(join(iconsDir, 'icon-512.png'), makeSVGIcon(512), 'utf-8');
// 512x512 maskable
writeFileSync(join(iconsDir, 'icon-512-maskable.png'), makeSVGIcon(512, true), 'utf-8');

console.log('Icons generated in public/icons/ (SVG format, .png extension for manifest compatibility)');
console.log('Replace with real PNG files from designer when available.');
