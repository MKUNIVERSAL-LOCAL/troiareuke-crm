import { maskPhone } from '../../lib/masking';
import { IS_MOBILE_APP } from '../../lib/platform';
import { copyText } from '../../lib/clipboard';
import { notify } from '../../lib/notify';

/**
 * 전화번호 표시 — 폰에서는 눌러서 바로 전화, PC에서는 눌러서 복사 (UI 품질 기준 2026-11-18)
 * 직원(staff) 역할은 마스킹 정책대로 번호를 보지도 걸지도 못한다(표시만).
 */
export default function PhoneLink({ phone, role, className }: { phone: string; role: 'staff' | 'admin' | 'superadmin'; className?: string }) {
  const shown = maskPhone(phone, role);
  if (!phone) return <span className={className}>-</span>;
  if (role === 'staff') return <span className={className}>{shown}</span>;
  const digits = phone.replace(/\D/g, '');
  if (IS_MOBILE_APP) {
    return <a href={`tel:${digits}`} className={`${className ?? ''} underline decoration-dotted underline-offset-2`} aria-label={`${shown}로 전화 걸기`}>{shown}</a>;
  }
  return (
    <button
      type="button"
      onClick={async () => { notify((await copyText(phone)) ? '전화번호를 복사했습니다.' : '복사하지 못했습니다 — 번호를 드래그해 복사하세요.'); }}
      className={`${className ?? ''} text-left hover:underline decoration-dotted underline-offset-2`}
      title="클릭하면 전화번호가 복사됩니다"
    >
      {shown}
    </button>
  );
}
