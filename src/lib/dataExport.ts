/**
 * dataExport.ts — 지점(계정)별 CRM 데이터 엑셀 내보내기
 *
 * 모든 스토어는 지점(branch) 스코프로 격리되어 있으므로, 로그인한 계정은
 * 항상 본인 샵 데이터만 내보내게 된다 (Supabase/NAS/로컬 모드 동일).
 * 시트 구성은 세무(결제수단별 집계·정액권 선수금 원장)·PIPA(민감정보 경고)·
 * 마이그레이션(마스터+이력 전체) 관점을 반영했다.
 */
import * as XLSX from 'xlsx';
import {
  CustomerStore, PaymentStore, ProductStore, ProductSaleStore,
  ReservationStore, TreatmentLogStore, ProgramStore, CustomerProgramStore,
  StaffStore, ServiceStore, MessageHistoryStore, SettingsStore,
} from './store';
import { ConsultationStore } from './consultationStore';
import { getLocalLogs } from './loginLog';
import type { BeaconMetrics } from '../types';

export interface ExportDataset {
  key: string;
  label: string;
  description: string;
  /** 민감정보(건강정보 소지) 포함 여부 — UI에서 경고 표시 */
  sensitive?: boolean;
}

export const EXPORT_DATASETS: ExportDataset[] = [
  { key: 'customers', label: '고객 데이터', description: '이름·전화·이메일·주소·피부타입·등급·방문/누적결제', sensitive: true },
  { key: 'consultations', label: '고객 상담 내역', description: '피부 고민·비컨 측정값·피부타입 판정·소견·추천 솔루션', sensitive: true },
  { key: 'payments', label: '매출(결제·환불) 데이터', description: '결제일·고객·구분·금액·할인·결제수단·상태' },
  { key: 'sales_by_method', label: '결제수단별 매출 집계', description: '일자별 카드/현금/계좌이체/카카오페이 합계 — 부가세 신고용' },
  { key: 'customer_programs', label: '정액권(회권) 잔여 원장', description: '고객별 구매 회권의 총/사용/잔여 회차와 잔여금액 — 선수금 관리' },
  { key: 'products', label: '상품(제품) 재고', description: '제품명·카테고리·가격·원가·현재고·안전재고' },
  { key: 'product_sales', label: '상품 판매 내역', description: '판매일·제품·고객·수량·금액·결제수단' },
  { key: 'reservations', label: '예약 이력', description: '과거+미래 예약 전체 — 상태(완료/노쇼/취소) 포함', sensitive: true },
  { key: 'treatment_logs', label: '시술 기록', description: '시술일·고객·담당·내용·회차 차감·피부상태 메모', sensitive: true },
  { key: 'programs', label: '프로그램(정액권 상품) 목록', description: '판매 중인 회권/패키지 정의 — 가격·회차·유효기간' },
  { key: 'services', label: '시술 메뉴', description: '시술명·카테고리·가격·소요시간 마스터' },
  { key: 'staff', label: '직원 목록', description: '이름·직급·연락처·재직 여부 (급여 등 미포함)' },
  { key: 'message_history', label: '메시지 발송 이력', description: '발송일·유형·대상수·성공/실패' },
  { key: 'dormant_customers', label: '휴면 고객 리스트', description: '60일 이상 미방문 고객 — 재방문 마케팅용', sensitive: true },
  { key: 'login_logs', label: '로그인 기록', description: '이 기기의 로그인 성공/실패 이력 (최근 500건) — 보안 감사용' },
];

export interface ExportSheet {
  name: string;   // 엑셀 시트명 (31자 이하)
  rows: Record<string, string | number>[];
}

const SENSITIVE_NOTICE = '⚠ 민감정보 포함 — 외부 공유 금지';

// 비컨 측정 9개 지표는 분석하기 쉽게 각각 별도 컬럼으로 전개한다
const METRIC_COLUMNS: [keyof BeaconMetrics, string][] = [
  ['moisture', '수분'], ['oil', '유분'], ['elasticity', '탄력'],
  ['pigmentation', '색소침착'], ['pore', '모공'], ['wrinkle', '주름'],
  ['redness', '홍조'], ['sensitivity', '민감도'], ['skinTone', '피부톤'],
];

function metricsToColumns(m?: BeaconMetrics): Record<string, string | number> {
  const columns: Record<string, string | number> = {};
  for (const [key, label] of METRIC_COLUMNS) {
    columns[label] = m?.[key] ?? '';
  }
  return columns;
}

function buildSheet(key: string): ExportSheet | null {
  switch (key) {
    case 'customers':
      return {
        name: '고객',
        rows: CustomerStore.getAll().filter(c => !c.id.startsWith('sample_')).map(c => ({
          이름: c.name, 전화번호: c.phone, 이메일: c.email || '', 주소: c.address || '',
          성별: c.gender, 생년월일: c.birthDate || '', 등급: c.grade,
          피부타입: c.skinType || '', 알레르기: c.allergies || '',
          방문횟수: c.totalVisits, 누적결제액: c.totalSpent,
          최근방문일: c.lastVisitDate || '', 등록일: c.registeredAt,
          유입경로: c.referralSource || '', 태그: (c.tags || []).join(', '), 메모: c.memo || '',
        })),
      };
    case 'consultations':
      return {
        name: '상담내역',
        rows: ConsultationStore.getAll().map(c => ({
          상담일: c.consultDate, 고객명: c.customerName, 담당: c.staffName || '',
          피부고민: (c.concerns || []).join(', '),
          ...metricsToColumns(c.beaconMetrics),
          피부타입판정: c.skinTypeResult || '', 관리사소견: c.managerNote || '',
          추천솔루션: c.recommendedSolution || '',
          추천제품: (c.recommendedProducts || []).join(', '),
          다음상담권고일: c.nextConsultDate || '',
        })),
      };
    case 'payments':
      return {
        name: '매출(결제)',
        rows: PaymentStore.getAll().map(p => ({
          결제일: p.paymentDate, 고객명: p.customerName || '', 구분: p.typeLabel,
          금액: p.amount, 할인액: p.discountAmount || 0, 결제수단: p.paymentMethod,
          상태: p.status === 'completed' ? '완료' : p.status === 'refunded' ? '환불' : '대기',
          메모: p.memo || '',
        })),
      };
    case 'sales_by_method': {
      // 일자 × 결제수단 집계 (완료 결제만) — 부가세 신고 대사용
      const byDate = new Map<string, Record<string, number>>();
      for (const p of PaymentStore.getAll()) {
        if (p.status !== 'completed') continue;
        const row = byDate.get(p.paymentDate) || {};
        row[p.paymentMethod] = (row[p.paymentMethod] || 0) + p.amount;
        byDate.set(p.paymentDate, row);
      }
      return {
        name: '결제수단별매출',
        rows: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, sums]) => ({
          일자: date,
          카드: sums['카드'] || 0, 현금: sums['현금'] || 0,
          계좌이체: sums['계좌이체'] || 0, 카카오페이: sums['카카오페이'] || 0,
          혼합: sums['혼합'] || 0,
          합계: Object.values(sums).reduce((a, b) => a + b, 0),
        })),
      };
    }
    case 'customer_programs':
      return {
        name: '정액권잔여원장',
        rows: CustomerProgramStore.getAll().map(cp => {
          const total = cp.totalSessions;
          const remaining = total === null ? '' : Math.max(0, total - cp.usedSessions);
          const remainingValue = total && total > 0
            ? Math.round((cp.pricePaid / total) * Math.max(0, total - cp.usedSessions))
            : '';
          return {
            고객명: cp.customerName, 프로그램명: cp.programName, 카테고리: cp.category,
            구매일: cp.purchaseDate, 결제금액: cp.pricePaid, 결제수단: cp.paymentMethod,
            총회차: total ?? '무제한', 사용회차: cp.usedSessions, 잔여회차: remaining,
            잔여금액추정: remainingValue, 만료일: cp.expiryDate || '',
            상태: cp.isCompleted ? '소진완료' : '이용중', 비고: cp.notes || '',
          };
        }),
      };
    case 'products':
      return {
        name: '제품재고',
        rows: ProductStore.getAll().map(p => ({
          제품명: p.name, 카테고리: p.category, 브랜드: p.brand || '',
          판매가: p.price, 원가: p.cost, 현재고: p.stock, 안전재고: p.minStock,
          단위: p.unit, 활성: p.isActive ? 'Y' : 'N', 설명: p.description || '',
        })),
      };
    case 'product_sales':
      return {
        name: '제품판매',
        rows: ProductSaleStore.getAll().map(s => ({
          판매일: s.saleDate, 제품명: s.productName, 고객명: s.customerName || '',
          수량: s.quantity, 단가: s.unitPrice, 합계: s.totalPrice,
          결제수단: s.paymentMethod, 담당: s.staffName || '', 비고: s.notes || '',
        })),
      };
    case 'reservations':
      return {
        name: '예약이력',
        rows: ReservationStore.getAll().map(r => ({
          날짜: r.date, 시작: r.startTime, 종료: r.endTime,
          고객명: r.customerName, 전화번호: r.customerPhone, 담당: r.staffName,
          시술: (r.services || []).map(s => s.serviceName).join(', '),
          금액: r.totalPrice,
          상태: ({ confirmed: '확정', pending: '대기', completed: '완료', cancelled: '취소', noshow: '노쇼' } as Record<string, string>)[r.status] || r.status,
          예약경로: r.source, 메모: r.memo || '',
        })),
      };
    case 'treatment_logs':
      return {
        name: '시술기록',
        rows: TreatmentLogStore.getAll().map(t => ({
          시술일: t.treatmentDate, 시간: t.treatmentTime || '', 고객명: t.customerName,
          담당: t.staffName || '', 프로그램: t.programName || '', 차감회차: t.sessionsUsed,
          시술내용: t.treatmentDetails || '', 피부상태: t.skinCondition || '',
          관리사메모: t.staffNotes || '', 다음방문권장일: t.nextAppointment || '',
        })),
      };
    case 'programs':
      return {
        name: '프로그램목록',
        rows: ProgramStore.getAll().map(p => ({
          프로그램명: p.name, 카테고리: p.category,
          총회차: p.totalSessions ?? '무제한', 유효기간일: p.validityDays ?? '무기한',
          판매가: p.price, 원가: p.costPrice, 활성: p.isActive ? 'Y' : 'N',
          설명: p.description || '',
        })),
      };
    case 'services':
      return {
        name: '시술메뉴',
        rows: ServiceStore.getAll().map(s => ({
          시술명: s.name, 카테고리: s.category, 가격: s.price,
          소요시간분: s.duration, 활성: s.isActive ? 'Y' : 'N', 설명: s.description || '',
        })),
      };
    case 'staff':
      return {
        name: '직원목록',
        rows: StaffStore.getAll().map(s => ({
          이름: s.name, 직급: s.role, 전화번호: s.phone, 이메일: s.email || '',
          전문분야: (s.specialty || []).join(', '), 입사일: s.hireDate,
          재직여부: s.isActive ? '재직' : '퇴사/비활성',
        })),
      };
    case 'message_history':
      return {
        name: '메시지발송이력',
        rows: MessageHistoryStore.getAll().map(h => ({
          발송일: h.sentAt, 유형: h.type, 템플릿: h.templateName || '직접 작성',
          제목: h.title || '', 대상수: h.recipients, 성공: h.successCount, 실패: h.failCount,
          상태: h.status, 비용: h.cost ?? '',
        })),
      };
    case 'dormant_customers': {
      const today = new Date();
      return {
        name: '휴면고객',
        rows: CustomerStore.getAll()
          .filter(c => !c.id.startsWith('sample_') && c.lastVisitDate)
          .map(c => ({
            customer: c,
            days: Math.floor((today.getTime() - new Date(c.lastVisitDate! + 'T00:00:00').getTime()) / 86400000),
          }))
          .filter(({ days }) => days >= 60)
          .sort((a, b) => b.days - a.days)
          .map(({ customer: c, days }) => ({
            고객명: c.name, 전화번호: c.phone, 최근방문일: c.lastVisitDate || '',
            경과일수: days, 등급: c.grade, 누적결제액: c.totalSpent,
            피부타입: c.skinType || '',
          })),
      };
    }
    case 'login_logs':
      return {
        name: '로그인기록',
        rows: getLocalLogs().map(log => ({
          일시: log.logged_in_at, 이메일: log.email, 지점: log.branch_name || '',
          결과: log.status === 'success' ? '성공' : '실패',
          실패사유: log.fail_reason || '', 기기정보: log.device_info || '',
        })),
      };
    default:
      return null;
  }
}

/** 선택한 데이터셋들의 시트 데이터 생성 (테스트 가능하도록 분리) */
export function buildExportSheets(keys: string[]): ExportSheet[] {
  const sheets: ExportSheet[] = [];
  for (const key of keys) {
    const sheet = buildSheet(key);
    if (sheet) sheets.push(sheet);
  }
  return sheets;
}

export interface ExportResult {
  fileName: string;
  /** 시트별 행 수 (0행 시트도 헤더 안내와 함께 포함됨) */
  counts: Record<string, number>;
}

/** 선택 데이터셋을 하나의 xlsx 파일로 다운로드 */
export function exportDatasetsToXlsx(keys: string[]): ExportResult {
  const sheets = buildExportSheets(keys);
  if (sheets.length === 0) throw new Error('내보낼 데이터를 선택해주세요.');

  const workbook = XLSX.utils.book_new();
  const counts: Record<string, number> = {};
  const sensitiveKeys = new Set(EXPORT_DATASETS.filter(d => d.sensitive).map(d => d.key));

  keys.forEach(key => {
    const dataset = EXPORT_DATASETS.find(d => d.key === key);
    const sheet = buildSheet(key);
    if (!dataset || !sheet) return;
    counts[dataset.label] = sheet.rows.length;

    const rows = sheet.rows.length > 0
      ? sheet.rows
      : [{ 안내: '해당 데이터가 없습니다.' }];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (sensitiveKeys.has(key) && sheet.rows.length > 0) {
      // 민감정보 시트 상단에 경고행 삽입
      XLSX.utils.sheet_add_aoa(worksheet, [[SENSITIVE_NOTICE]], { origin: -1 });
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  });

  const shopName = (SettingsStore.get().name || 'CRM').replace(/[\\/:*?"<>|]/g, '');
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `${shopName}_데이터내보내기_${date}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  return { fileName, counts };
}
