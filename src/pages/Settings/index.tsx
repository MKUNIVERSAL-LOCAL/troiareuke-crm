import { useState } from 'react';
import { Link2, Bell, CreditCard, Store, Palette, Clock } from 'lucide-react';
import Header from '../../components/layout/Header';
import { mockShopSettings } from '../../data/mockData';
import clsx from 'clsx';

type SettingTab = 'shop' | 'integrations' | 'notifications' | 'services' | 'hours';

const tabs = [
  { key: 'shop' as SettingTab, label: '샵 정보', icon: <Store size={16} /> },
  { key: 'hours' as SettingTab, label: '영업시간', icon: <Clock size={16} /> },
  { key: 'integrations' as SettingTab, label: '연동 설정', icon: <Link2 size={16} /> },
  { key: 'notifications' as SettingTab, label: '알림 설정', icon: <Bell size={16} /> },
  { key: 'services' as SettingTab, label: '시술 관리', icon: <Palette size={16} /> },
];

const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

export default function Settings() {
  const [tab, setTab] = useState<SettingTab>('shop');
  const s = mockShopSettings;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="설정" subtitle="샵 운영 환경을 설정하세요" />

      <div className="p-8 flex-1">
        <div className="flex gap-6">
          {/* Sidebar tabs */}
          <div className="w-48 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 space-y-0.5">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                    tab === t.key
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <span className={tab === t.key ? 'text-purple-500' : 'text-gray-400'}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            {tab === 'shop' && (
              <SettingCard title="샵 기본 정보">
                <div className="space-y-4">
                  <FormRow label="샵 이름">
                    <input type="text" defaultValue={s.name} className="form-input" />
                  </FormRow>
                  <FormRow label="샵 유형">
                    <select defaultValue={s.type} className="form-input">
                      {['피부관리실', '에스테틱샵', '메디컬 에스테틱', '홈케어 에스테틱', '스파 에스테틱', '기타'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </FormRow>
                  <FormRow label="대표 전화">
                    <input type="tel" defaultValue={s.phone} className="form-input" />
                  </FormRow>
                  <FormRow label="주소">
                    <input type="text" defaultValue={s.address} className="form-input" />
                  </FormRow>
                  <FormRow label="포인트 적립률">
                    <div className="flex items-center gap-2">
                      <input type="number" defaultValue={s.pointRate} className="form-input w-24" />
                      <span className="text-sm text-gray-500">% (결제금액의 N%)</span>
                    </div>
                  </FormRow>
                  <div className="pt-4">
                    <button className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-xl shadow-md hover:from-purple-600 hover:to-pink-600 transition-all">
                      저장하기
                    </button>
                  </div>
                </div>
              </SettingCard>
            )}

            {tab === 'hours' && (
              <SettingCard title="영업시간 설정">
                <div className="space-y-3">
                  {dayLabels.map(day => {
                    const hours = s.businessHours[day];
                    return (
                      <div key={day} className="flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-700 w-6">{day}</span>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" defaultChecked={!hours.isOff} className="rounded text-purple-500" />
                          <span className="text-xs text-gray-500">영업</span>
                        </label>
                        <input type="time" defaultValue={hours.open} disabled={hours.isOff} className="form-input text-sm w-28 disabled:opacity-40" />
                        <span className="text-gray-400 text-sm">~</span>
                        <input type="time" defaultValue={hours.close} disabled={hours.isOff} className="form-input text-sm w-28 disabled:opacity-40" />
                        {hours.isOff && <span className="text-xs text-red-400 font-medium">휴무</span>}
                      </div>
                    );
                  })}
                  <div className="pt-4">
                    <button className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-xl shadow-md">
                      저장하기
                    </button>
                  </div>
                </div>
              </SettingCard>
            )}

            {tab === 'integrations' && (
              <div className="space-y-4">
                {/* Naver */}
                <SettingCard title="네이버 예약 연동">
                  <div className="space-y-4">
                    <div className={clsx(
                      'flex items-center gap-3 p-4 rounded-xl border',
                      s.naverBooking.isConnected ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                    )}>
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold', s.naverBooking.isConnected ? 'bg-green-500' : 'bg-gray-300')}>
                        N
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">네이버 예약</p>
                        {s.naverBooking.isConnected ? (
                          <p className="text-xs text-green-600 mt-0.5">연동됨 · {s.naverBooking.placeName} · 마지막 동기화: {s.naverBooking.lastSyncAt}</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">연동되지 않음</p>
                        )}
                      </div>
                      <button className={clsx(
                        'px-4 py-2 text-sm font-medium rounded-xl',
                        s.naverBooking.isConnected
                          ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      )}>
                        {s.naverBooking.isConnected ? '연동 해제' : '연동하기'}
                      </button>
                    </div>
                    {s.naverBooking.isConnected && (
                      <FormRow label="네이버 플레이스 ID">
                        <input type="text" defaultValue={s.naverBooking.placeId} className="form-input" />
                      </FormRow>
                    )}
                  </div>
                </SettingCard>

                {/* Kakao */}
                <SettingCard title="카카오 연동">
                  <div className="space-y-4">
                    <div className={clsx(
                      'flex items-center gap-3 p-4 rounded-xl border',
                      s.kakao.channelConnected ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'
                    )}>
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold', s.kakao.channelConnected ? 'bg-yellow-400' : 'bg-gray-300')}>
                        K
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">카카오 채널</p>
                        {s.kakao.channelConnected ? (
                          <p className="text-xs text-yellow-600 mt-0.5">연동됨 · {s.kakao.channelName}</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">연동되지 않음</p>
                        )}
                      </div>
                      <button className={clsx(
                        'px-4 py-2 text-sm font-medium rounded-xl',
                        s.kakao.channelConnected ? 'bg-gray-100 text-gray-600' : 'bg-yellow-400 text-white'
                      )}>
                        {s.kakao.channelConnected ? '연동 해제' : '연동하기'}
                      </button>
                    </div>

                    <div className="flex items-center gap-3 p-4 rounded-xl border bg-gray-50 border-gray-200">
                      <div className="w-10 h-10 rounded-xl bg-gray-300 flex items-center justify-center text-white text-lg font-bold">K</div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">카카오 오픈채팅</p>
                        <p className="text-xs text-gray-400 mt-0.5">연동되지 않음</p>
                      </div>
                      <button className="px-4 py-2 text-sm font-medium rounded-xl bg-yellow-400 text-white">연동하기</button>
                    </div>
                  </div>
                </SettingCard>

                {/* SMS */}
                <SettingCard title="SMS 발송 설정 (엔포+)">
                  <div className="space-y-4">
                    <FormRow label="API Key">
                      <input type="password" defaultValue="••••••••••••" className="form-input" />
                    </FormRow>
                    <FormRow label="발신번호">
                      <input type="tel" defaultValue={s.smsCallerId} className="form-input" />
                    </FormRow>
                    <div className="flex gap-3">
                      <button className="px-4 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100">
                        테스트 발송
                      </button>
                      <button className="px-6 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl shadow-md">
                        저장하기
                      </button>
                    </div>
                  </div>
                </SettingCard>
              </div>
            )}

            {tab === 'notifications' && (
              <SettingCard title="자동 알림 설정">
                <div className="space-y-4">
                  {[
                    { key: 'reservationConfirm', label: '예약 확인 문자', desc: '예약 등록 시 즉시 발송', value: s.notificationSettings.reservationConfirm },
                    { key: 'reservationReminder', label: '예약 리마인더', desc: '예약 전날 오전 9시 발송', value: s.notificationSettings.reservationReminder },
                    { key: 'birthdayMessage', label: '생일 축하 메시지', desc: '생일 당일 오전 10시 카카오 발송', value: s.notificationSettings.birthdayMessage },
                    { key: 'novisitMessage', label: '미방문 고객 케어', desc: '60일 미방문 시 카카오 발송', value: s.notificationSettings.novisitMessage },
                  ].map(n => (
                    <div key={n.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{n.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{n.desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked={n.value} />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                      </label>
                    </div>
                  ))}
                  <div className="pt-2">
                    <button className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-xl shadow-md">
                      저장하기
                    </button>
                  </div>
                </div>
              </SettingCard>
            )}

            {tab === 'services' && (
              <SettingCard title="시술 항목 관리">
                <p className="text-sm text-gray-500 mb-4">시술 항목을 추가, 수정, 삭제할 수 있습니다.</p>
                <button className="mb-4 px-4 py-2 text-sm font-medium bg-purple-50 text-purple-700 rounded-xl border border-purple-200 hover:bg-purple-100">
                  + 시술 추가
                </button>
                <div className="space-y-2">
                  {['피부관리', '마사지', '왁싱', '각질관리'].map(cat => (
                    <div key={cat}>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 py-2">{cat}</p>
                      <div className="space-y-1">
                        {/* Service items would go here */}
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                          <span className="text-gray-700">기본 {cat} 관리</span>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500">60분</span>
                            <span className="font-semibold text-gray-800">80,000원</span>
                            <button className="text-xs text-purple-600 hover:text-purple-800">수정</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SettingCard>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .form-input {
          width: 100%;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          outline: none;
          transition: all 0.15s;
        }
        .form-input:focus {
          ring: 2px solid #c4b5fd;
          border-color: transparent;
          box-shadow: 0 0 0 2px #c4b5fd;
        }
      `}</style>
    </div>
  );
}

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <label className="text-sm font-medium text-gray-600 w-32 flex-shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
