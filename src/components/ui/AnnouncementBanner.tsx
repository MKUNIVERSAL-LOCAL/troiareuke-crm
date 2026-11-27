import { useState, useEffect } from 'react';
import { isAuthApiConfigured } from '../../lib/authApi';
import { fetchAnnouncements } from '../../lib/adminApi';
import { X, Megaphone, AlertTriangle, RefreshCw, Gift } from 'lucide-react';
import { readJson } from '../../lib/safeJson';

const DISMISSED_KEY = 'troiareuke_announcements_dismissed'; // 닫은 공지 id — 새로고침마다 다시 뜨지 않게 기기에 기억 (UX 점검 2026-11-19)

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
}

const typeStyles: Record<string, { bg: string; icon: React.ElementType; iconColor: string }> = {
  // 325: 흰 글자 대비 실측 — blue-600 5.17 · emerald-600 **3.77** · amber-500 **2.15** · purple-600 5.38(기준 4.5:1).
  // 본사 공지 띠는 **서버에 공지가 있어야** 뜨므로 로컬 모드 게이트가 한 번도 재지 않았다(어드민 창과 같은 사각지대).
  info:    { bg: 'bg-blue-600',   icon: Megaphone,      iconColor: 'text-blue-200' },
  update:  { bg: 'bg-emerald-700', icon: RefreshCw,     iconColor: 'text-emerald-200' },
  warning: { bg: 'bg-amber-700',  icon: AlertTriangle,  iconColor: 'text-amber-200' },
  event:   { bg: 'bg-purple-600', icon: Gift,           iconColor: 'text-purple-200' },
};

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set(readJson<string[]>(DISMISSED_KEY, [])));
  const [expanded, setExpanded] = useState(false);
  const dismiss = (id: string) => {
    setDismissed(d => {
      const next = new Set([...d, id]);
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next].slice(-50))); } catch { /* 기억만 건너뜀 */ }
      return next;
    });
    setExpanded(false);
  };

  useEffect(() => {
    if (!isAuthApiConfigured) return;
    loadAnnouncements();
    // 프로그램은 하루 종일 켜 둔다 — 한 번만 읽으면 영업 중 올린 긴급 공지가 다음 날에야 보였다 (9차 점검 #26)
    const iv = setInterval(loadAnnouncements, 30 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') loadAnnouncements(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  async function loadAnnouncements() {
    // 공지는 NAS 중앙 서버에만 있다 (로컬 모드는 배너 없음)
    if (isAuthApiConfigured) {
      try {
        const { announcements } = await fetchAnnouncements();
        setAnnouncements(announcements.slice(0, 5).map(a => ({
          id: a.id, title: a.title, content: a.content, type: a.type,
        })));
      } catch (e: any) {
        console.warn('[Announcement] NAS 공지 로드 실패(배너 생략):', e?.message);
      }
      return;
    }
  }

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const ann = visible[current % visible.length];
  const style = typeStyles[ann.type] || typeStyles.info;
  const Icon = style.icon;

  return (
    <div className={`w-full ${style.bg} text-white px-4 py-2.5 flex items-center gap-3 shadow-sm`}>
      <Icon size={15} className={`shrink-0 ${style.iconColor}`} />
      {/* 인라인 span의 truncate는 줄임 없이 한 줄로 밀려 폰 폭을 넘쳤다 — block으로 줄이고, 눌러서 전문을 펼친다 */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className={`flex-1 min-w-0 text-left text-xs ${expanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
        title={expanded ? '접기' : '전체 보기'}
      >
        <span className="font-bold mr-2">{ann.title}</span>
        <span className="text-white/80">{ann.content}</span>
      </button>
      {visible.length > 1 && (
        <button
          type="button"
          onClick={() => { setCurrent(c => (c + 1) % visible.length); setExpanded(false); }}
          aria-label={`다음 공지 (${current % visible.length + 1}/${visible.length})`}
          className="text-xs text-white/70 hover:text-white shrink-0 px-2"
        >
          {current % visible.length + 1}/{visible.length}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismiss(ann.id)}
        aria-label="이 공지 닫기"
        className="text-white/70 hover:text-white shrink-0 p-1"
      >
        <X size={14} />
      </button>
    </div>
  );
}
