// ═══════════════════════════════════════════════════════════════
// consultReport — 피부 상담 결과지 PDF (비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 상담 기록 1건을 고객에게 건네는 A4 결과지로 만든다: 샵·고객·상담일·담당, 피부타입, 고민, 측정값,
// 추천 솔루션·제품, 관리사 소견, 다음 상담일, 상담 사진(AI 분석 사진·Before/After 비교), 안내 문구.
// jspdf + 나눔고딕(base64)은 지연 로드. PC는 내려받기, 모바일 앱은 공유 시트.
// ═══════════════════════════════════════════════════════════════

import { SettingsStore } from './store';
import { getPhotos } from './photoStore';
import { IS_MOBILE_APP } from './platform';
import { saveOrShareFile } from './mobileBridge';
import type { Consultation, Customer, BeaconMetrics } from '../types';

const METRIC_LABELS: { key: keyof BeaconMetrics; label: string }[] = [
  { key: 'moisture', label: '수분' }, { key: 'oil', label: '유분' }, { key: 'elasticity', label: '탄력' },
  { key: 'pigmentation', label: '색소침착' }, { key: 'pore', label: '모공' }, { key: 'wrinkle', label: '주름' },
  { key: 'redness', label: '홍조' }, { key: 'sensitivity', label: '민감도' }, { key: 'skinTone', label: '피부톤' },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('사진을 불러올 수 없습니다.'));
    img.src = src;
  });
}

export function consultReportFileName(customerName: string, consultDate: string): string {
  const shop = (SettingsStore.get().name || 'CRM').replace(/[\\/:*?"<>|]/g, '');
  const who = (customerName || '고객').replace(/[\\/:*?"<>|\s]/g, '');
  return `${shop}_${who}_상담결과지_${consultDate}.pdf`;
}

export async function exportConsultationPdf(c: Consultation, customer: Customer): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const [{ jsPDF }, fontModule] = await Promise.all([import('jspdf'), import('../assets/fonts/nanumGothicBase64')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.addFileToVFS('NanumGothic.ttf', fontModule.default);
  doc.addFont('NanumGothic.ttf', 'NanumGothic', 'normal');
  doc.setFont('NanumGothic');

  const shop = SettingsStore.get().name || '';
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const CW = W - M * 2;
  let y = M;

  const ensure = (need: number) => { if (y + need > H - M) { doc.addPage(); doc.setFont('NanumGothic'); y = M; } };
  const text = (s: string, size: number, color: [number, number, number] = [30, 30, 30], gap = 4) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(s, CW) as string[];
    for (const line of lines) { ensure(size + gap); doc.text(line, M, y + size); y += size + gap; }
  };
  const section = (title: string) => {
    y += 10;
    ensure(26 + 16); // 제목 + 본문 첫 줄이 같은 페이지에 오게(제목만 남는 고아 방지)
    doc.setDrawColor(26, 58, 143);
    doc.setLineWidth(1.2);
    doc.line(M, y + 2, M + 18, y + 2);
    doc.setFontSize(11);
    doc.setTextColor(26, 58, 143);
    doc.text(title, M + 26, y + 6);
    y += 16;
  };

  // 머리말
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39);
  doc.text('피부 상담 결과지', M, y + 20);
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(`${shop}${shop ? ' · ' : ''}${c.consultDate}${c.staffName ? ` · 담당 ${c.staffName}` : ''}`, M, y + 38);
  y += 50;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);
  y += 10;

  // 고객
  text(`${customer.name} 고객님${c.skinTypeResult ? `  ·  피부 타입: ${c.skinTypeResult}` : ''}`, 12, [17, 24, 39], 6);

  if (c.concerns.length) { section('피부 고민'); text(c.concerns.join(' · '), 10.5); }

  const metrics = METRIC_LABELS.map(m => ({ label: m.label, v: c.beaconMetrics?.[m.key] })).filter(m => typeof m.v === 'number');
  if (metrics.length) {
    section('피부 측정');
    ensure(44);
    const cellW = Math.min(90, CW / metrics.length);
    metrics.forEach((m, i) => {
      const x = M + i * cellW;
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(x + 2, y, cellW - 4, 38, 4, 4, 'F');
      doc.setFontSize(8.5); doc.setTextColor(107, 114, 128); doc.text(m.label, x + cellW / 2, y + 13, { align: 'center' });
      doc.setFontSize(13); doc.setTextColor(26, 58, 143); doc.text(String(m.v), x + cellW / 2, y + 30, { align: 'center' });
    });
    y += 46;
  }

  if (c.recommendedSolution) { section('1:1 맞춤 솔루션'); text(c.recommendedSolution, 10.5); }
  if (c.recommendedProducts.length) { section('추천 제품 · 프로그램'); text(c.recommendedProducts.join(', '), 10.5); }
  if (c.managerNote) { section('관리사 소견'); text(c.managerNote, 10.5); }
  if (c.nextConsultDate) { section('다음 상담 권장일'); text(c.nextConsultDate, 10.5); }

  // 사진
  const photos = getPhotos(`consult:${c.id}`);
  if (photos.length) {
    section('상담 사진');
    for (const p of photos) {
      try {
        const img = await loadImage(p.dataUrl);
        const maxW = p.label === 'compare' ? CW : Math.min(220, CW);
        const scale = Math.min(maxW / img.naturalWidth, 260 / img.naturalHeight, 1);
        const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
        ensure(h + 10);
        const fmt = p.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(p.dataUrl, fmt, M, y, w, h);
        y += h + 10;
      } catch { /* 깨진 사진은 건너뜀 */ }
    }
  }

  // 꼬리말 — 모든 페이지 하단 여백 안(H - M/2)에 찍는다. 본문 한계(H - M)보다 아래라 겹치지 않고, 꼬리말만 있는 빈 페이지도 생기지 않는다
  doc.setFontSize(8.5);
  doc.setTextColor(156, 163, 175);
  for (let i = 1, n = doc.getNumberOfPages(); i <= n; i++) {
    doc.setPage(i);
    doc.setFont('NanumGothic');
    doc.text('※ 본 결과지는 피부 관리 참고용 소견이며 의료 진단·처방·치료가 아닙니다. 고객 본인 확인용 · 무단 공유 금지', M, H - M / 2);
  }

  const fileName = consultReportFileName(customer.name, c.consultDate);
  if (IS_MOBILE_APP) {
    const base64 = doc.output('datauristring').replace(/^data:[^;]*;base64,/, '');
    return saveOrShareFile(fileName, base64);
  }
  doc.save(fileName);
  return 'downloaded';
}
