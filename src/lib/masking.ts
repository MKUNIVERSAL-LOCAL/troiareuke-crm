/**
 * UI 레이어 마스킹 유틸 — RLS와 무관, 렌더링 시 적용
 * staff 권한: 010-****-1234 (중간 4자리 마스킹)
 * admin/superadmin: 그대로 표시
 */
export function maskPhone(
  phone: string,
  role: 'staff' | 'admin' | 'superadmin',
): string {
  if (role !== 'staff') return phone;

  // 010-1234-5678 or 01012345678 패턴 처리
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-****-${digits.slice(6)}`;
  }
  // 패턴 불일치 — 중간 부분 마스킹 시도
  const parts = phone.split('-');
  if (parts.length === 3) {
    return `${parts[0]}-****-${parts[2]}`;
  }
  return phone.replace(/.(?=.{4})/g, '*');
}
