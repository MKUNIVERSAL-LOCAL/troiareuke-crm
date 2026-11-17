// Before/After 비교 (킬러 기능 ②) — 비코어.
// 고객 시술 사진 수집, 촬영 가이드용 직전 사진, 비교 이미지(PNG) 합성, 저장·공유·복사.
// 사진 정본은 photoStore(NAS crm_photos)이고 여기서는 읽기만 한다.
import { TreatmentLogStore, SettingsStore } from './store';
import { getPhotos, PHOTO_ANGLES, type PhotoEntry, type PhotoAngle } from './photoStore';
import { IS_MOBILE_APP } from './platform';
import { saveOrShareFile, blobToBase64 } from './mobileBridge';

export interface DatedPhoto extends PhotoEntry {
  date: string;  // 시술일 (YYYY-MM-DD)
  logId: string; // 소속 시술기록
}

/** 고객의 모든 시술 사진을 시술일 오름차순(오래된 → 최신)으로 평탄화 */
export function collectCustomerPhotos(customerId: string): DatedPhoto[] {
  const logs = [...TreatmentLogStore.getByCustomer(customerId)]
    .sort((a, b) => a.treatmentDate.localeCompare(b.treatmentDate) || a.createdAt.localeCompare(b.createdAt));
  const out: DatedPhoto[] = [];
  for (const log of logs) {
    for (const p of getPhotos(`treatment:${log.id}`)) out.push({ ...p, date: log.treatmentDate, logId: log.id });
  }
  return out;
}

export function angleLabel(angle?: PhotoAngle | string): string {
  return PHOTO_ANGLES.find(a => a.id === angle)?.label ?? '';
}

/** 촬영 가이드 — 같은 고객의 직전 시술 사진을 각도별 최신 1장씩 (편집 중인 기록은 제외, 최대 4장) */
export function findReferencePhotos(customerId: string, excludeLogId?: string): DatedPhoto[] {
  const byAngle = new Map<string, DatedPhoto>();
  for (const p of collectCustomerPhotos(customerId)) {
    if (p.logId === excludeLogId) continue;
    byAngle.set(p.angle ?? '_', p); // 오름차순 순회라 마지막 = 최신
  }
  return [...byAngle.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('사진을 불러올 수 없습니다.'));
    img.src = src;
  });
}

/** 정사각 패널에 사진을 꽉 채워(가운데 크롭) 그린다 */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

const FONT = 'Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string) {
  ctx.font = `bold 18px ${FONT}`;
  const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 36, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 14, y + 18);
}

export interface ComparisonInput {
  before: DatedPhoto;
  after: DatedPhoto;
  customerName?: string;
}

/** Before | After 2분할 비교 이미지(PNG) 합성 — 지점이 고객에게 보내는 결과 보고용 */
export async function renderComparison({ before, after, customerName }: ComparisonInput): Promise<Blob> {
  const W = 1200, PAD = 40, PANEL = 540, GAP = 40, HEADER = 120, FOOTER = 90;
  const H = HEADER + PANEL + FOOTER;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 생성할 수 없습니다.');
  const [imgB, imgA] = await Promise.all([loadImage(before.dataUrl), loadImage(after.dataUrl)]);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 머리말
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText('Before / After', PAD, 34);
  ctx.fillStyle = '#6b7280';
  ctx.font = `20px ${FONT}`;
  const sub = [
    customerName ? `${customerName} 고객` : '',
    `${before.date} → ${after.date}`,
    `D+${daysBetween(before.date, after.date)}`,
  ].filter(Boolean).join('   ·   ');
  ctx.fillText(sub, PAD, 80);

  // 패널
  const xB = PAD, xA = PAD + PANEL + GAP, y = HEADER;
  drawCover(ctx, imgB, xB, y, PANEL, PANEL);
  drawCover(ctx, imgA, xA, y, PANEL, PANEL);
  drawTag(ctx, 'BEFORE', xB + 16, y + 16, 'rgba(55,65,81,0.9)');
  drawTag(ctx, 'AFTER', xA + 16, y + 16, 'rgba(79,70,229,0.92)');

  // 패널 설명
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#374151';
  ctx.font = `20px ${FONT}`;
  const cap = (p: DatedPhoto) => `${p.date}${p.angle ? ` · ${angleLabel(p.angle)}` : ''}`;
  ctx.fillText(cap(before), xB + PANEL / 2, y + PANEL + 14);
  ctx.fillText(cap(after), xA + PANEL / 2, y + PANEL + 14);

  // 꼬리말
  ctx.font = `17px ${FONT}`;
  ctx.fillStyle = '#9ca3af';
  ctx.textAlign = 'left';
  ctx.fillText('고객 본인 확인용 · 무단 공유 금지', PAD, H - 38);
  ctx.textAlign = 'right';
  ctx.fillText(SettingsStore.get().name || 'CRM', W - PAD, H - 38);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('이미지 생성에 실패했습니다.'))), 'image/png');
  });
}

export function comparisonFileName(customerName?: string): string {
  const shop = (SettingsStore.get().name || 'CRM').replace(/[\\/:*?"<>|]/g, '');
  const who = (customerName || '고객').replace(/[\\/:*?"<>|\s]/g, '');
  return `${shop}_${who}_BeforeAfter_${new Date().toISOString().slice(0, 10)}.png`;
}

/** PC: 파일 내려받기 / 모바일 앱: 캐시 저장 후 공유 시트(카카오톡 등) */
export async function exportComparison(blob: Blob, fileName: string): Promise<'shared' | 'saved' | 'downloaded'> {
  if (IS_MOBILE_APP) return saveOrShareFile(fileName, await blobToBase64(blob), 'image/png');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** 클립보드 이미지 복사 가능 여부 — PC(Electron·브라우저)에서 카카오톡 PC 대화창에 바로 붙이기 */
export const canCopyImage =
  !IS_MOBILE_APP && typeof navigator !== 'undefined' && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined';

export async function copyImageToClipboard(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
