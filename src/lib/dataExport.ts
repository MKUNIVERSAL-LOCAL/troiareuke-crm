/**
 * dataExport.ts — 지점(계정)별 CRM 데이터 엑셀 내보내기
 *
 * 모든 스토어는 지점(branch) 스코프로 격리되어 있으므로, 로그인한 계정은
 * 항상 본인 샵 데이터만 내보내게 된다 (Supabase/NAS/로컬 모드 동일).
 * 시트 구성은 세무(결제수단별 집계·정액권 선수금 원장)·PIPA(민감정보 경고)·
 * 마이그레이션(마스터+이력 전체) 관점을 반영했다.
 */
import { IS_MOBILE_APP } from './platform';
import { todayISO, formatDateTime, localISODate } from './format';
import { maskPhone } from './masking';
import { isProgramExpired } from './customerPrograms';
import { buildCustomerStatsIndex, statsFor } from './customerStats';
import { refundedOn, memoWithoutRefundTag } from './refundDate';
import { canceledSaleIds } from './saleCancel';

import { saveOrShareFile } from './mobileBridge';
import type { WorkBook, WorkSheet } from 'xlsx';
import {
  CustomerStore, PaymentStore, ProductStore, ProductSaleStore,
  ReservationStore, TreatmentLogStore, ProgramStore, CustomerProgramStore,
  StaffStore, ServiceStore, MessageHistoryStore, SettingsStore,
} from './store';
import { ConsultationStore } from './consultationStore';
import { ExpenseStore } from './expenseStore';
import { getLocalLogs } from './loginLog';
import type { BeaconMetrics } from '../types';
import { COGS_CATEGORIES } from '../types';

/** 영문 코드 열을 한글로 — 시트·PDF를 보는 원장은 코드를 모른다 (산출물 감사 2026-11-20) */
const SOURCE_LABELS: Record<string, string> = { manual: '직접 등록', naver: '네이버', kakao: '카카오', phone: '전화', 'walk-in': '방문', app: '앱' };
const MESSAGE_TYPE_LABELS: Record<string, string> = { sms: '문자', lms: '장문 문자', mms: '사진 문자', 'kakao-channel': '카카오 채널', 'kakao-openchat': '카카오 오픈채팅' };
const MESSAGE_STATUS_LABELS: Record<string, string> = { sent: '발송 완료', failed: '실패', sending: '발송 중', draft: '초안' };
/** 직원 계정이 내보낼 때는 전화번호를 가리고 메모·생년월일을 비운다 — 고객 목록 화면의 역할 규칙과 동일. 호출자가 buildExportSheets(keys, role)로 넘기고, 시트 생성 동안만 유효 (리뷰 2026-11-20) */
export type ExportRole = 'owner' | 'staff';
let exportRole: ExportRole = 'owner';
const phoneFor = (phone?: string) => (exportRole === 'staff' ? maskPhone(phone || '', 'staff') : (phone || ''));
const privateFor = (v?: string) => (exportRole === 'staff' ? '' : (v || ''));

/** SheetJS(≈400KB)는 내보내기·업로드 순간에만 로드 — 첫 화면 번들에서 제외 (2026-11-18). 실패하면 전역 핸들러가 보여줄 한국어 메시지로 */
export const loadXlsx = () => import('xlsx').catch(() => { throw new Error('엑셀 기능을 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해주세요.'); });

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
  { key: 'expenses', label: '지출(매입·비용) 데이터', description: '지출일·분류·거래처·내용·금액·지불수단 — 손익계산서 원장' },
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
  /** 합계 행을 뺀 데이터 행 수 — 건수 표기용 (리뷰 2026-11-20) */
  dataRows: number;
  /** 데이터셋 키 — 내보내기 루프가 시트를 다시 만들지 않고 이 값으로 라벨·민감 여부를 찾는다 */
  key: string;
}

const SENSITIVE_NOTICE = '⚠ 민감정보 포함 — 외부 공유 금지';
/** 금액 열 — 엑셀에서 50000이 아니라 50,000으로 보이게 서식(#,##0)을 건다 (산출물 감사 2026-11-20) */
const AMOUNT_HEADER = /금액|결제액|판매가|원가|가격|비용|할인액|단가|합계|잔여금액추정|누적결제|카드|현금|계좌이체|카카오페이|혼합|기타/; // 결제수단별매출의 수단 열도 금액이다 (리뷰 2026-11-20)
/** 합계 행에서 더하지 않을 금액 열 — 단가 합은 뜻이 없다 */
const SUM_EXCLUDE = /단가|할인액/; // 할인액은 참고 기록 — 합계 행에 더하면 금액처럼 읽힌다 (10차 #M10)
/** 세무·정산용 시트는 맨 아래에 합계 행 */
const TOTAL_SHEETS = new Set(['payments', 'expenses', 'sales_by_method', 'product_sales']);
type SheetRow = ExportSheet['rows'][number];
function withTotalsRow(rows: SheetRow[]): SheetRow[] {
  if (rows.length === 0) return rows;
  const keys = Object.keys(rows[0]);
  // 상태 열이 있으면 '완료' 행만 더한다 — 매출(결제) 시트의 환불·대기 행이 합계를 부풀리지 않게 (리뷰 2026-11-20)
  const hasStatus = keys.includes('상태');
  const counted = hasStatus ? rows.filter(r => r['상태'] === '완료') : rows;
  const totals: SheetRow = {};
  let any = false;
  keys.forEach((k, idx) => {
    const numeric = rows.every(r => typeof r[k] === 'number' || r[k] === '' || r[k] == null) && rows.some(r => typeof r[k] === 'number');
    if (numeric && AMOUNT_HEADER.test(k) && !SUM_EXCLUDE.test(k)) { totals[k] = counted.reduce((sum, r) => sum + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0); any = true; }
    else totals[k] = idx === 0 ? (hasStatus ? '합계(완료만)' : '합계') : '';
  });
  return any ? [...rows, totals] : rows;
}
type XlsxModule = Awaited<ReturnType<typeof loadXlsx>>;
function applyAmountFormats(XLSX: XlsxModule, ws: WorkSheet, headerRowIndex: number): void {
  const ref = ws['!ref']; if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const head = ws[XLSX.utils.encode_cell({ r: headerRowIndex, c })];
    if (!head || typeof head.v !== 'string' || !AMOUNT_HEADER.test(head.v)) continue;
    for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0';
    }
  }
}

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

function buildSheet(key: string): Omit<ExportSheet, 'dataRows' | 'key'> | null {
  switch (key) {
    case 'customers': {
      const idx = buildCustomerStatsIndex(); // 저장 증분값이 아니라 기록 재계산값 — 화면 목록과 같은 숫자 (10차 숫자 점검 #H1)
      return {
        name: '고객',
        rows: CustomerStore.getAll().filter(c => !c.id.startsWith('sample_')).map(c => ({ ...c, ...statsFor(c, idx) })).map(c => ({
          이름: c.name, 전화번호: phoneFor(c.phone), 이메일: privateFor(c.email), 주소: privateFor(c.address),
          성별: c.gender, 생년월일: privateFor(c.birthDate), 등급: c.grade,
          피부타입: c.skinType || '', 알레르기: c.allergies || '',
          방문횟수: c.totalVisits, 누적결제액: c.totalSpent,
          최근방문일: c.lastVisitDate || '', 등록일: localISODate(c.registeredAt), // ISO(UTC)를 그대로 쓰면 새벽 등록이 전날로 — 다른 날짜 열과 같은 "YYYY-MM-DD" (산출물 감사·리뷰 2026-11-20)
          유입경로: c.referralSource || '', 태그: (c.tags || []).join(', '), 메모: privateFor(c.memo),
        })),
      };
    }
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
          환불처리일: refundedOn(p) || '', 묶음ID: (p.referenceId || p.id).slice(-8), // 분할 결제는 묶음ID 가 같다 — 화면 "결제 건수"(묶음 수)와 행 수를 맞춰 볼 수 있게 (10차 #M10)
          메모: memoWithoutRefundTag(p.memo),
        })),
      };
    case 'expenses':
      return {
        name: '지출(매입)',
        rows: ExpenseStore.getAll()
          .slice()
          .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate))
          .map(x => ({
            지출일: x.expenseDate, 분류: x.category,
            손익구분: COGS_CATEGORIES.includes(x.category) ? '매출원가' : '판매비와관리비',
            거래처: x.vendor || '', 내용: x.description,
            금액: x.amount, 지불수단: x.paymentMethod, 메모: x.memo || '',
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
          // 매장이 직접 추가한 커스텀 결제수단(상품권 등)은 '기타'로 합산
          기타: Object.entries(sums)
            .filter(([k]) => !['카드', '현금', '계좌이체', '카카오페이', '혼합'].includes(k))
            .reduce((a, [, v]) => a + v, 0),
          합계: Object.values(sums).reduce((a, b) => a + b, 0),
        })),
      };
    }
    case 'customer_programs': {
      // 환불된 회차권 id 집합을 한 번만 — 프로그램마다 전체 결제를 훑지 않게 (리뷰 2026-11-20)
      const refundedPrograms = new Set(PaymentStore.getAll()
        .filter(p => p.type === 'program' && p.status === 'refunded' && p.referenceId)
        .map(p => p.referenceId as string));
      return {
        name: '정액권잔여원장',
        rows: CustomerProgramStore.getAll().map(cp => {
          const total = cp.totalSessions;
          // 완료(소진·수동 완료·환불로 종료)·만료된 회차권은 선수금이 남지 않는다 — 잔여를 0으로 (금액 감사 2026-11-20)
          const expired = isProgramExpired(cp);
          const closed = cp.isCompleted || expired;
          const refunded = refundedPrograms.has(cp.id);
          const remaining = total === null ? '' : (closed ? 0 : Math.max(0, total - cp.usedSessions));
          const remainingValue = total && total > 0
            ? (closed ? 0 : Math.round((cp.pricePaid / total) * Math.max(0, total - cp.usedSessions)))
            : '';
          return {
            고객명: cp.customerName, 프로그램명: cp.programName, 카테고리: cp.category,
            구매일: cp.purchaseDate, 결제금액: cp.pricePaid, 결제수단: cp.paymentMethod,
            구분: total === null ? '기간제(무제한)' : '회차권', 총회차: total ?? '', 사용회차: cp.usedSessions, 잔여회차: remaining, // 숫자 열에 '무제한' 글자를 섞지 않는다(SUM 깨짐)
            잔여금액추정: remainingValue, 만료일: cp.expiryDate || '',
            상태: refunded ? '환불' : cp.isCompleted ? '완료' : expired ? '만료' : '이용중', 비고: cp.notes || '',
          };
        }),
      };
    }
    case 'products':
      return {
        name: '제품재고',
        rows: ProductStore.getAll().map(p => ({
          제품명: p.name, 카테고리: p.category, 브랜드: p.brand || '',
          판매가: p.price, 원가: p.cost, 현재고: p.stock, 안전재고: p.minStock,
          단위: p.unit, 활성: p.isActive ? 'Y' : 'N', 설명: p.description || '',
        })),
      };
    case 'product_sales': {
      const canceled = canceledSaleIds(PaymentStore.getAll()); // 상태 열이 있으면 합계 행은 '완료'만 더한다 — 취소(환불) 판매가 합계를 부풀리지 않게 (리뷰 2026-11-23)
      return {
        name: '제품판매',
        rows: ProductSaleStore.getAll().map(s => ({
          판매일: s.saleDate, 제품명: s.productName, 고객명: s.customerName || '',
          수량: s.quantity, 단가: s.unitPrice, 합계: s.totalPrice,
          결제수단: s.paymentMethod, 담당: s.staffName || '', 상태: canceled.has(s.id) ? '취소(환불)' : '완료', 비고: s.notes || '',
        })),
      };
    }
    case 'reservations':
      return {
        name: '예약이력',
        rows: ReservationStore.getAll().map(r => ({
          날짜: r.date, 시작: r.startTime, 종료: r.endTime,
          고객명: r.customerName, 전화번호: phoneFor(r.customerPhone), 담당: r.staffName,
          시술: (r.services || []).map(s => s.serviceName).join(', '),
          금액: r.totalPrice,
          상태: ({ confirmed: '확정', pending: '대기', completed: '완료', cancelled: '취소', noshow: '노쇼' } as Record<string, string>)[r.status] || r.status,
          예약경로: SOURCE_LABELS[r.source] || r.source, 메모: r.memo || '',
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
          // 발송일은 ISO·옛 toLocaleString 행이 섞여 있어 한 표기로(87); 87에서 이 줄 주석이 '템플릿' 열을 먹었던 회귀를 복구(88)
          발송일: formatDateTime(h.sentAt), 유형: MESSAGE_TYPE_LABELS[h.type] || h.type, 템플릿: h.templateName || '직접 작성',
          제목: h.title || '', 대상수: h.recipients, 성공: h.successCount, 실패: h.failCount,
          상태: MESSAGE_STATUS_LABELS[h.status] || h.status, 비용: h.cost ?? '',
        })),
      };
    case 'dormant_customers': {
      const today = new Date();
      const idx = buildCustomerStatsIndex();
      return {
        name: '휴면고객',
        rows: CustomerStore.getAll()
          .filter(c => !c.id.startsWith('sample_'))
          .map(c => ({ ...c, ...statsFor(c, idx) }))
          .filter(c => c.lastVisitDate)
          .map(c => ({
            customer: c,
            days: Math.floor((today.getTime() - new Date(c.lastVisitDate! + 'T00:00:00').getTime()) / 86400000),
          }))
          .filter(({ days }) => days >= 60)
          .sort((a, b) => b.days - a.days)
          .map(({ customer: c, days }) => ({
            고객명: c.name, 전화번호: phoneFor(c.phone), 최근방문일: c.lastVisitDate || '',
            경과일수: days, 등급: c.grade, 누적결제액: c.totalSpent,
            피부타입: c.skinType || '',
          })),
      };
    }
    case 'login_logs':
      return {
        name: '로그인기록',
        rows: getLocalLogs().map(log => ({
          일시: formatDateTime(log.logged_in_at), 이메일: log.email, 지점: log.branch_name || '',
          결과: log.status === 'success' ? '성공' : '실패',
          실패사유: log.fail_reason || '', 기기정보: log.device_info || '',
        })),
      };
    default:
      return null;
  }
}

/** 선택한 데이터셋들의 시트 데이터 생성 (테스트 가능하도록 분리) */
export function buildExportSheets(keys: string[], role: ExportRole): ExportSheet[] {
  exportRole = role;
  try {
    const sheets: ExportSheet[] = [];
    for (const key of keys) {
      const sheet = buildSheet(key);
      if (!sheet) continue;
      // 세무·정산용 시트의 합계 행은 여기서 붙여 엑셀·PDF가 같은 표를 낸다 (리뷰 2026-11-20)
      const rows = TOTAL_SHEETS.has(key) && sheet.rows.length > 0 ? withTotalsRow(sheet.rows) : sheet.rows;
      sheets.push({ ...sheet, key, rows, dataRows: sheet.rows.length });
    }
    return sheets;
  } finally { exportRole = 'owner'; }
}

/**
 * 워크북 저장 공통 경로 — PC/브라우저는 내려받기, 모바일 앱(WebView)은 <a download>가 동작하지 않으므로
 * 캐시에 쓰고 공유 시트(카카오톡·메일·파일 앱). 고객 목록·업로드 양식·데이터 내보내기가 같은 결정을 쓴다 (2026-11-17)
 */
export type ExportDelivery = 'shared' | 'cancelled' | 'downloaded';

export async function writeWorkbook(workbook: WorkBook, fileName: string): Promise<ExportDelivery> {
  const XLSX = await loadXlsx();
  if (IS_MOBILE_APP) {
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string;
    return saveOrShareFile(fileName, base64);
  }
  XLSX.writeFile(workbook, fileName);
  return 'downloaded';
}

export interface ExportResult {
  fileName: string;
  /** 시트별 행 수 (0행 시트도 헤더 안내와 함께 포함됨) */
  counts: Record<string, number>;
  /** 파일이 실제로 어디로 갔는지 — 모바일 공유 시트 취소는 '저장 완료'가 아니다 */
  delivery: ExportDelivery;
}

/** 선택 데이터셋을 하나의 xlsx 파일로 다운로드 */
export async function exportDatasetsToXlsx(keys: string[], role: ExportRole): Promise<ExportResult> {
  const sheets = buildExportSheets(keys, role);
  if (sheets.length === 0) throw new Error('내보낼 데이터를 선택해주세요.');
  const XLSX = await loadXlsx();

  const workbook = XLSX.utils.book_new();
  const counts: Record<string, number> = {};
  const sensitiveKeys = new Set(EXPORT_DATASETS.filter(d => d.sensitive).map(d => d.key));

  sheets.forEach(sheet => { // 위에서 한 번 만든 시트를 그대로 — 역할 마스킹·합계 행 포함, 다시 만들지 않음 (리뷰 2026-11-20)
    const key = sheet.key;
    const dataset = EXPORT_DATASETS.find(d => d.key === key);
    if (!dataset) return;
    counts[dataset.label] = sheet.dataRows;

    const rows = sheet.rows.length > 0
      ? sheet.rows
      : [{ 안내: '해당 데이터가 없습니다.' }];
    let worksheet: WorkSheet;
    const sensitive = sensitiveKeys.has(key) && sheet.rows.length > 0;
    if (sensitive) {
      // 민감정보 경고행을 1행(최상단)에 두고, 데이터(헤더 포함)는 2행부터 — 자동 필터는 머리글(2행)에 건다
      worksheet = XLSX.utils.aoa_to_sheet([[SENSITIVE_NOTICE]]);
      XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A2' });
      const ref = worksheet['!ref'];
      if (ref) { const rg = XLSX.utils.decode_range(ref); worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: rg.e.r, c: rg.e.c } }) }; }
    } else {
      worksheet = XLSX.utils.json_to_sheet(rows);
    }
    if (sheet.rows.length > 0) applyAmountFormats(XLSX, worksheet, sensitive ? 1 : 0);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  });

  const shopName = (SettingsStore.get().name || 'CRM').replace(/[\\/:*?"<>|]/g, '');
  const fileName = `${shopName}_데이터내보내기_${todayISO()}.xlsx`;
  const delivery = await writeWorkbook(workbook, fileName);
  return { fileName, counts, delivery };
}
