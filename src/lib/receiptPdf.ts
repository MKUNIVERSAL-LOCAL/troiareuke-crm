// receiptPdf — 결제 영수증 A4 PDF (비코어, 235, GAP P-9)
// 내용 규칙은 receiptRule.ts(순수). 여기서는 그 모델을 그려서 저장·공유만 한다.
// jspdf + 나눔고딕(base64)은 지연 로드 — 첫 화면 번들에 넣지 않는다(상담 결과지와 같은 방식).
import { SettingsStore } from './store';
import { getPreference } from './shopPreferences';
import { IS_MOBILE_APP } from './platform';
import { saveOrShareFile } from './mobileBridge';
import { todayISO } from './format';
import { buildReceipt, receiptFileName, type ReceiptPayment } from './receiptRule';

/**
 * 영수증 PDF — PC 는 내려받기, 모바일 앱은 공유 시트.
 * 사업자등록번호·대표자명은 코어 AuthUser·ShopSettings 에 없어 설정 행(receiptInfo)에서 읽는다 — 설정 > 매장 정보에서 입력.
 */
export async function exportReceiptPdf(payment: ReceiptPayment, customerName?: string | null): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const settings = SettingsStore.get();
  const receiptInfo = getPreference('receiptInfo') ?? {};
  const model = buildReceipt({
    payment,
    customerName,
    shop: {
      name: settings.name,
      phone: settings.phone,
      address: settings.address,
      businessNumber: receiptInfo.businessNumber,
      ownerName: receiptInfo.ownerName,
    },
    issuedOn: todayISO(),
  });

  const [{ jsPDF }, fontModule] = await Promise.all([import('jspdf'), import('../assets/fonts/nanumGothicBase64')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.addFileToVFS('NanumGothic.ttf', fontModule.default);
  doc.addFont('NanumGothic.ttf', 'NanumGothic', 'normal');
  doc.setFont('NanumGothic');

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const CW = W - M * 2;
  let y = M;

  // 머리말 — 제목과 매장
  doc.setFontSize(22);
  doc.setTextColor(17, 24, 39);
  doc.text(model.title, M, y + 22);
  y += 40;
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  for (const line of model.shopLines) {
    for (const wrapped of doc.splitTextToSize(line, CW) as string[]) { doc.text(wrapped, M, y); y += 14; }
  }
  y += 6;
  doc.setDrawColor(26, 58, 143);
  doc.setLineWidth(1.2);
  doc.line(M, y, W - M, y);
  y += 24;

  // 고객
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(model.customerLine, M, y);
  y += 26;

  // 내역 표 — 라벨/값 두 열
  doc.setFontSize(11);
  for (const row of model.rows) {
    doc.setTextColor(107, 114, 128);
    doc.text(row.label, M, y);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(row.value, CW - 120) as string[];
    doc.text(lines[0] ?? '', M + 120, y);
    y += 18;
    for (const extra of lines.slice(1)) { doc.text(extra, M + 120, y); y += 16; }
    doc.setDrawColor(243, 244, 246);
    doc.setLineWidth(0.6);
    doc.line(M, y - 10, W - M, y - 10);
  }

  // 합계
  y += 14;
  doc.setDrawColor(26, 58, 143);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  y += 26;
  doc.setFontSize(12);
  doc.setTextColor(107, 114, 128);
  doc.text(model.totalLabel, M, y);
  doc.setFontSize(18);
  doc.setTextColor(model.isRefund ? 185 : 26, model.isRefund ? 28 : 58, model.isRefund ? 28 : 143);
  doc.text(model.totalValue, W - M, y + 2, { align: 'right' });
  y += 34;

  // 꼬리말 — 세금계산서·설정 안내
  doc.setFontSize(8.5);
  doc.setTextColor(156, 163, 175);
  for (const note of model.notes) {
    for (const wrapped of doc.splitTextToSize(note, CW) as string[]) {
      if (y > H - M) break;
      doc.text(wrapped, M, y);
      y += 12;
    }
  }

  const fileName = receiptFileName(settings.name, customerName ?? undefined, payment.paymentDate, model.isRefund);
  if (IS_MOBILE_APP) {
    const base64 = doc.output('datauristring').replace(/^data:[^;]*;base64,/, '');
    return saveOrShareFile(fileName, base64);
  }
  doc.save(fileName);
  return 'downloaded';
}
