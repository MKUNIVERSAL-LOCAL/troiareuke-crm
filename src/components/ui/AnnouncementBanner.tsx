import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { X, Megaphone, AlertTriangle, RefreshCw, Gift } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
}

const typeStyles: Record<string, { bg: string; icon: React.ElementType; iconColor: string }> = {
  info:    { bg: 'bg-blue-600',   icon: Megaphone,      iconColor: 'text-blue-200' },
  update:  { bg: 'bg-emerald-600', icon: RefreshCw,     iconColor: 'text-emerald-200' },
  warning: { bg: 'bg-amber-500',  icon: AlertTriangle,  iconColor: 'text-amber-200' },
  event:   { bg: 'bg-purple-600', icon: Gift,           iconColor: 'text-purple-200' },
};

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    loadAnnouncements();
  }, []);

  async function loadAnnouncements() {
    const { data } = await supabase
      .from('announcements')
      .select('id, title, content, type')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);
    setAnnouncements(data || []);
  }

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const ann = visible[current % visible.length];
  const style = typeStyles[ann.type] || typeStyles.info;
  const Icon = style.icon;

  return (
    <div className={`w-full ${style.bg} text-white px-4 py-2.5 flex items-center gap-3 shadow-sm`}>
      <Icon size={15} className={`shrink-0 ${style.iconColor}`} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-bold mr-2">{ann.title}</span>
        <span className="text-xs text-white/80 truncate">{ann.content}</span>
      </div>
      {visible.length > 1 && (
        <button
          onClick={() => setCurrent(c => (c + 1) % visible.length)}
          className="text-xs text-white/70 hover:text-white shrink-0 px-2"
        >
          {current % visible.length + 1}/{visible.length}
        </button>
      )}
      <button
        onClick={() => setDismissed(d => new Set([...d, ann.id]))}
        className="text-white/70 hover:text-white shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
