/**
 * pdfExport.ts — 선택 데이터셋을 PDF로 내보내기
 *
 * jspdf + 나눔고딕(OFL) 폰트를 동적 import로 지연 로드한다 — PDF 버튼을
 * 누르기 전에는 메인 번들 크기에 영향이 없다. 시트 구성은 엑셀 내보내기
 * (dataExport.buildExportSheets)와 동일한 데이터 경로를 공유한다.
 */
import { buildExportSheets, EXPORT_DATASETS, type ExportResult } from './dataExport';
import { SettingsStore } from './store';

const SENSITIVE_NOTICE = '민감정보 포함 — 외부 공유 금지';

export async function exportDatasetsToPdf(keys: string[]): Promise<ExportResult> {
  if (keys.length === 0) throw new Error('내보낼 데이터를 선택해주세요.');

  // 무거운 의존성(jspdf ~390KB + 한글 폰트 ~2.7MB base64)은 지연 로드
  // 폰트는 빌드타임 base64 모듈 — 브라우저/Electron(file://) 모두에서 동작
  const [{ jsPDF }, autoTableModule, fontModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('../assets/fonts/nanumGothicBase64'),
  ]);
  const autoTable = autoTableModule.default;
  const fontBase64 = fontModule.default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.addFileToVFS('NanumGothic.ttf', fontBase64);
  doc.addFont('NanumGothic.ttf', 'NanumGothic', 'normal');
  doc.setFont('NanumGothic');

  const shopName = SettingsStore.get().name || 'CRM';
  const date = new Date().toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  const sensitiveKeys = new Set(EXPORT_DATASETS.filter(d => d.sensitive).map(d => d.key));

  const orderedKeys = EXPORT_DATASETS.filter(d => keys.includes(d.key)).map(d => d.key);
  let isFirstPage = true;

  for (const key of orderedKeys) {
    const dataset = EXPORT_DATASETS.find(d => d.key === key)!;
    const sheet = buildExportSheets([key])[0];
    if (!sheet) continue;
    counts[dataset.label] = sheet.rows.length;

    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    // 섹션 헤더
    doc.setFont('NanumGothic');
    doc.setFontSize(15);
    doc.setTextColor(20, 30, 60);
    doc.text(`${dataset.label} (${sheet.rows.length.toLocaleString()}건)`, 40, 44);
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text(`${shopName} · ${date} 기준`, 40, 60);
    if (sensitiveKeys.has(key)) {
      doc.setTextColor(200, 60, 40);
      doc.text(`※ ${SENSITIVE_NOTICE}`, 40, 74);
    }

    if (sheet.rows.length === 0) {
      doc.setFontSize(11);
      doc.setTextColor(150, 150, 150);
      doc.text('해당 데이터가 없습니다.', 40, 100);
      continue;
    }

    const columns = Object.keys(sheet.rows[0]);
    autoTable(doc, {
      startY: sensitiveKeys.has(key) ? 84 : 72,
      head: [columns],
      body: sheet.rows.map(row => columns.map(col => String(row[col] ?? ''))),
      styles: { font: 'NanumGothic', fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { font: 'NanumGothic', fillColor: [26, 58, 143], textColor: 255, fontSize: 7.5 },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      margin: { left: 40, right: 40, top: 84 },
    });
  }

  const safeShopName = shopName.replace(/[\\/:*?"<>|]/g, '');
  const fileName = `${safeShopName}_데이터내보내기_${date}.pdf`;
  doc.save(fileName);
  return { fileName, counts };
}
