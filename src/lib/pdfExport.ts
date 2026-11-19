/**
 * pdfExport.ts — 선택 데이터셋을 PDF로 내보내기
 *
 * jspdf + 나눔고딕(OFL) 폰트를 동적 import로 지연 로드한다 — PDF 버튼을
 * 누르기 전에는 메인 번들 크기에 영향이 없다. 시트 구성은 엑셀 내보내기
 * (dataExport.buildExportSheets)와 동일한 데이터 경로를 공유한다.
 */
import { IS_MOBILE_APP } from './platform';
import { todayISO } from './format';
import { saveOrShareFile } from './mobileBridge';
import { buildExportSheets, EXPORT_DATASETS, type ExportResult, type ExportDelivery, type ExportRole } from './dataExport';
import { SettingsStore } from './store';

const SENSITIVE_NOTICE = '민감정보 포함 — 외부 공유 금지';

export async function exportDatasetsToPdf(keys: string[], role: ExportRole): Promise<ExportResult> {
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
  const date = todayISO();
  const counts: Record<string, number> = {};
  const sensitiveKeys = new Set(EXPORT_DATASETS.filter(d => d.sensitive).map(d => d.key));

  const orderedKeys = EXPORT_DATASETS.filter(d => keys.includes(d.key)).map(d => d.key);
  let isFirstPage = true;

  for (const sheet of buildExportSheets(orderedKeys, role)) { // 시트는 한 번만 만든다 (리뷰 2026-11-20)
    const key = sheet.key;
    const dataset = EXPORT_DATASETS.find(d => d.key === key)!;
    counts[dataset.label] = sheet.dataRows;

    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    // 섹션 헤더
    doc.setFont('NanumGothic');
    doc.setFontSize(15);
    doc.setTextColor(20, 30, 60);
    doc.text(`${dataset.label} (${sheet.dataRows.toLocaleString()}건)`, 40, 44);
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
    const wide = columns.length > 10; // 고객(16열)·상담(19열)은 A4 가로에서도 열이 좁다 — 여백을 줄여 글자 크기를 지킨다 (산출물 감사 2026-11-20)
    autoTable(doc, {
      startY: sensitiveKeys.has(key) ? 84 : 72,
      head: [columns],
      body: sheet.rows.map(row => columns.map(col => typeof row[col] === 'number' ? (row[col] as number).toLocaleString() : String(row[col] ?? ''))),
      styles: { font: 'NanumGothic', fontStyle: 'normal', fontSize: wide ? 7 : 8, cellPadding: wide ? 2 : 3, overflow: 'linebreak' },
      // autotable의 머리글 기본은 bold — NanumGothic은 normal만 등록돼 있어 명시하지 않으면 times로 폴백해 한글이 깨진다 (산출물 감사 2026-11-20)
      headStyles: { font: 'NanumGothic', fontStyle: 'normal', fillColor: [26, 58, 143], textColor: 255, fontSize: 7.5 },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      // 합계 행(데이터 행 뒤)은 굵게·연한 배경 — 세무용 시트에서 한눈에 (리뷰 2026-11-20). NanumGothic은 normal만 등록돼 굵기 대신 색으로 구분
      didParseCell: (data) => {
        const isTotalsRow = data.section === 'body' && sheet.rows.length > sheet.dataRows && data.row.index === sheet.rows.length - 1;
        if (!isTotalsRow) return;
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.textColor = [17, 24, 39];
      },
      margin: { left: 40, right: 40, top: 84 },
    });
  }

  const safeShopName = shopName.replace(/[\\/:*?"<>|]/g, '');
  const fileName = `${safeShopName}_데이터내보내기_${date}.pdf`;
  let delivery: ExportDelivery = 'downloaded';
  if (IS_MOBILE_APP) {
    const base64 = doc.output('datauristring').replace(/^data:[^;]*;base64,/, '');
    delivery = await saveOrShareFile(fileName, base64);
  } else {
    doc.save(fileName);
  }
  return { fileName, counts, delivery };
}
