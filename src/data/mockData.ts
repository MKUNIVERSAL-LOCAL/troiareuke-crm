import type { Customer, Staff, Service, Reservation, TreatmentRecord, Product, MessageTemplate, MessageHistory, ShopSettings } from '../types';

export const mockCustomers: Customer[] = [
  { id: 'c1', shopId: 'demo', name: '김지수', phone: '010-1234-5678', email: 'jisu@email.com', birthDate: '1990-03-15', gender: '여성', grade: 'VIP', skinType: '복합성', memo: 'VIP 고객, 피부 민감', totalVisits: 24, totalSpent: 1850000, lastVisitDate: '2026-02-28', registeredAt: '2024-01-10', tags: ['VIP', '민감성', '정기회원'], isActive: true, referralSource: '네이버' },
  { id: 'c2', shopId: 'demo', name: '이민지', phone: '010-2345-6789', email: 'minji@email.com', birthDate: '1995-07-22', gender: '여성', grade: '골드', skinType: '건성', memo: '', totalVisits: 12, totalSpent: 780000, lastVisitDate: '2026-02-20', registeredAt: '2024-06-15', tags: ['골드', '건성'], isActive: true, referralSource: '지인소개' },
  { id: 'c3', shopId: 'demo', name: '박서연', phone: '010-3456-7890', birthDate: '1988-11-08', gender: '여성', grade: '일반', skinType: '지성', memo: '알레르기: 향료', allergies: '향료', totalVisits: 6, totalSpent: 390000, lastVisitDate: '2026-01-15', registeredAt: '2024-09-20', tags: ['지성', '알레르기'], isActive: true, referralSource: '인스타그램' },
  { id: 'c4', shopId: 'demo', name: '최수아', phone: '010-4567-8901', birthDate: '1992-05-30', gender: '여성', grade: '일반', skinType: '정상', memo: '', totalVisits: 3, totalSpent: 180000, lastVisitDate: '2026-02-10', registeredAt: '2025-11-05', tags: [], isActive: true, referralSource: '네이버' },
  { id: 'c5', shopId: 'demo', name: '정하윤', phone: '010-5678-9012', birthDate: '2000-01-20', gender: '여성', grade: '신규', skinType: '복합성', memo: '첫 방문', totalVisits: 1, totalSpent: 75000, lastVisitDate: '2026-03-01', registeredAt: '2026-03-01', tags: ['신규'], isActive: true, referralSource: '카카오' },
  { id: 'c6', shopId: 'demo', name: '강예진', phone: '010-6789-0123', birthDate: '1985-09-12', gender: '여성', grade: 'VIP', skinType: '건성', memo: 'VIP 특별관리', totalVisits: 36, totalSpent: 3200000, lastVisitDate: '2026-03-03', registeredAt: '2023-05-20', tags: ['VIP', '정기회원', '장기고객'], isActive: true },
  { id: 'c7', shopId: 'demo', name: '윤다은', phone: '010-7890-1234', birthDate: '1997-04-25', gender: '여성', grade: '골드', skinType: '복합성', memo: '', totalVisits: 8, totalSpent: 540000, lastVisitDate: '2026-02-25', registeredAt: '2025-03-10', tags: ['골드'], isActive: true },
  { id: 'c8', shopId: 'demo', name: '신아름', phone: '010-8901-2345', birthDate: '1993-08-17', gender: '여성', grade: '일반', skinType: '지성', memo: '', totalVisits: 4, totalSpent: 260000, lastVisitDate: '2026-01-30', registeredAt: '2025-07-22', tags: [], isActive: true },
];

export const mockStaff: Staff[] = [
  { id: 's1', shopId: 'demo', name: '김예린', role: '원장', phone: '010-1111-2222', email: 'yerin@shop.com', specialty: ['피부관리', '림프마사지', '메디컬스킨'], color: '#8B5CF6', isActive: true, hireDate: '2022-01-01' },
  { id: 's2', shopId: 'demo', name: '이소희', role: '피부관리사', phone: '010-2222-3333', specialty: ['피부관리', '왁싱', '눈썹관리'], color: '#EC4899', isActive: true, hireDate: '2023-03-15' },
  { id: 's3', shopId: 'demo', name: '박지은', role: '네일아티스트', phone: '010-3333-4444', specialty: ['젤네일', '네일아트', '페디큐어'], color: '#06B6D4', isActive: true, hireDate: '2023-06-01' },
  { id: 's4', shopId: 'demo', name: '최민아', role: '피부관리사', phone: '010-4444-5555', specialty: ['피부관리', '각질관리'], color: '#10B981', isActive: true, hireDate: '2024-01-10' },
];

export const mockServices: Service[] = [
  { id: 'sv1', name: '기본 피부관리', category: '피부관리', duration: 90, price: 80000, description: '클렌징 + 각질 + 수분케어', isActive: true },
  { id: 'sv2', name: '프리미엄 피부관리', category: '피부관리', duration: 120, price: 120000, description: '기본관리 + 앰플 + 마스크팩', isActive: true },
  { id: 'sv3', name: '메디컬 스킨케어', category: '피부관리', duration: 90, price: 150000, description: '의료기기 활용 피부케어', isActive: true },
  { id: 'sv4', name: '림프 마사지', category: '마사지', duration: 60, price: 70000, description: '림프순환 마사지', isActive: true },
  { id: 'sv5', name: '등·어깨 마사지', category: '마사지', duration: 60, price: 65000, isActive: true },
  { id: 'sv6', name: '젤네일 (손)', category: '네일', duration: 60, price: 45000, isActive: true },
  { id: 'sv7', name: '젤네일 (발)', category: '네일', duration: 60, price: 40000, isActive: true },
  { id: 'sv8', name: '네일아트 추가', category: '네일', duration: 30, price: 15000, isActive: true },
  { id: 'sv9', name: '왁싱 (눈썹)', category: '왁싱', duration: 30, price: 20000, isActive: true },
  { id: 'sv10', name: '왁싱 (팔/다리)', category: '왁싱', duration: 45, price: 35000, isActive: true },
];

export const mockReservations: Reservation[] = [
  { id: 'r1', customerId: 'c1', customerName: '김지수', customerPhone: '010-1234-5678', staffId: 's1', staffName: '김예린', services: [{ serviceId: 'sv2', serviceName: '프리미엄 피부관리', price: 120000, duration: 120 }], date: '2026-03-06', startTime: '10:00', endTime: '12:00', status: 'confirmed', source: 'naver', totalPrice: 120000, naverBookingId: 'NB2026030601' },
  { id: 'r2', customerId: 'c6', customerName: '강예진', customerPhone: '010-6789-0123', staffId: 's2', staffName: '이소희', services: [{ serviceId: 'sv3', serviceName: '메디컬 스킨케어', price: 150000, duration: 90 }], date: '2026-03-06', startTime: '11:00', endTime: '12:30', status: 'confirmed', source: 'manual', totalPrice: 150000 },
  { id: 'r3', customerId: 'c2', customerName: '이민지', customerPhone: '010-2345-6789', staffId: 's3', staffName: '박지은', services: [{ serviceId: 'sv6', serviceName: '젤네일 (손)', price: 45000, duration: 60 }, { serviceId: 'sv8', serviceName: '네일아트 추가', price: 15000, duration: 30 }], date: '2026-03-06', startTime: '13:00', endTime: '14:30', status: 'confirmed', source: 'kakao', totalPrice: 60000 },
  { id: 'r4', customerId: 'c5', customerName: '정하윤', customerPhone: '010-5678-9012', staffId: 's4', staffName: '최민아', services: [{ serviceId: 'sv1', serviceName: '기본 피부관리', price: 80000, duration: 90 }], date: '2026-03-06', startTime: '14:00', endTime: '15:30', status: 'pending', source: 'naver', totalPrice: 80000 },
  { id: 'r5', customerId: 'c7', customerName: '윤다은', customerPhone: '010-7890-1234', staffId: 's1', staffName: '김예린', services: [{ serviceId: 'sv4', serviceName: '림프 마사지', price: 70000, duration: 60 }], date: '2026-03-06', startTime: '15:00', endTime: '16:00', status: 'confirmed', source: 'phone', totalPrice: 70000 },
  { id: 'r6', customerId: 'c3', customerName: '박서연', customerPhone: '010-3456-7890', staffId: 's2', staffName: '이소희', services: [{ serviceId: 'sv1', serviceName: '기본 피부관리', price: 80000, duration: 90 }], date: '2026-03-07', startTime: '10:00', endTime: '11:30', status: 'confirmed', source: 'naver', totalPrice: 80000 },
  { id: 'r7', customerId: 'c4', customerName: '최수아', customerPhone: '010-4567-8901', staffId: 's3', staffName: '박지은', services: [{ serviceId: 'sv7', serviceName: '젤네일 (발)', price: 40000, duration: 60 }], date: '2026-03-07', startTime: '13:00', endTime: '14:00', status: 'confirmed', source: 'manual', totalPrice: 40000 },
  { id: 'r8', customerId: 'c8', customerName: '신아름', customerPhone: '010-8901-2345', staffId: 's4', staffName: '최민아', services: [{ serviceId: 'sv2', serviceName: '프리미엄 피부관리', price: 120000, duration: 120 }], date: '2026-03-05', startTime: '11:00', endTime: '13:00', status: 'completed', source: 'naver', totalPrice: 120000 },
];

export const mockTreatments: TreatmentRecord[] = [
  { id: 't1', customerId: 'c8', customerName: '신아름', date: '2026-03-05', services: [{ serviceId: 'sv2', serviceName: '프리미엄 피부관리', price: 120000 }], staffId: 's4', staffName: '최민아', totalAmount: 120000, paidAmount: 120000, paymentMethod: '카드', memo: '피부 상태 양호, 수분 부족', skinCondition: '건조함, 모공 확장', nextVisitRecommended: '2026-03-19', photos: [], usedPoints: 0, earnedPoints: 1200, reservationId: 'r8' },
  { id: 't2', customerId: 'c1', customerName: '김지수', date: '2026-02-28', services: [{ serviceId: 'sv3', serviceName: '메디컬 스킨케어', price: 150000 }], staffId: 's1', staffName: '김예린', totalAmount: 150000, paidAmount: 150000, paymentMethod: '카드', memo: '트러블 진정 완료', skinCondition: '민감, 트러블', nextVisitRecommended: '2026-03-14', photos: [], usedPoints: 5000, earnedPoints: 1500 },
  { id: 't3', customerId: 'c6', customerName: '강예진', date: '2026-03-03', services: [{ serviceId: 'sv2', serviceName: '프리미엄 피부관리', price: 120000 }, { serviceId: 'sv4', serviceName: '림프 마사지', price: 70000 }], staffId: 's1', staffName: '김예린', totalAmount: 190000, paidAmount: 190000, paymentMethod: '카드', memo: 'VIP 패키지', skinCondition: '정상', nextVisitRecommended: '2026-03-17', photos: [], usedPoints: 0, earnedPoints: 1900 },
];

export const mockProducts: Product[] = [
  { id: 'p1', shopId: 'demo', name: '수분크림 (50ml)', category: '크림', brand: 'Dr. Jart', price: 45000, cost: 20000, stock: 15, minStock: 5, unit: '개', isActive: true },
  { id: 'p2', shopId: 'demo', name: '토너 (150ml)', category: '스킨', brand: 'COSRX', price: 28000, cost: 12000, stock: 8, minStock: 10, unit: '개', isActive: true },
  { id: 'p3', shopId: 'demo', name: '선크림 SPF50+', category: '선케어', brand: 'Anessa', price: 32000, cost: 15000, stock: 20, minStock: 8, unit: '개', isActive: true },
  { id: 'p4', shopId: 'demo', name: '앰플 (30ml)', category: '앰플', brand: '자체제작', price: 65000, cost: 28000, stock: 12, minStock: 5, unit: '개', isActive: true },
  { id: 'p5', shopId: 'demo', name: '폼클렌저 (150ml)', category: '클렌저', brand: 'CeraVe', price: 18000, cost: 8000, stock: 3, minStock: 8, unit: '개', isActive: true },
  { id: 'p6', shopId: 'demo', name: '스쿠알란 오일', category: '오일', brand: '자체제작', price: 55000, cost: 22000, stock: 7, minStock: 4, unit: '개', isActive: true },
];

export const mockMessageTemplates: MessageTemplate[] = [
  { id: 'mt1', name: '예약 확인', type: 'sms', content: '[뷰티샵] {고객명}님, {날짜} {시간} 예약이 확인되었습니다. 문의: {전화번호}', variables: ['고객명', '날짜', '시간', '전화번호'], category: '예약' },
  { id: 'mt2', name: '예약 리마인더', type: 'sms', content: '[뷰티샵] {고객명}님, 내일 {시간} 예약 잊지 마세요! 변경/취소: {전화번호}', variables: ['고객명', '시간', '전화번호'], category: '예약' },
  { id: 'mt3', name: '생일 축하', type: 'kakao-channel', title: '생일 축하 혜택', content: '{고객명}님, 생일을 진심으로 축하드립니다! 🎂\n이번 달 방문 시 10% 할인 혜택을 드립니다.\n예약: {예약링크}', variables: ['고객명', '예약링크'], category: '이벤트' },
  { id: 'mt4', name: '미방문 고객 케어', type: 'kakao-channel', title: '보고싶어요 ♥', content: '{고객명}님, 마지막 방문 후 {기간}이 지났네요.\n다시 뵙고 싶습니다! 재방문 시 5,000포인트 드립니다.', variables: ['고객명', '기간'], category: '리텐션' },
  { id: 'mt5', name: '이벤트 공지', type: 'lms', content: '[뷰티샵] 봄맞이 특별 이벤트!\n3월 한 달간 피부관리 20% 할인\n예약 문의: {전화번호}\n\n*수신거부 {거부번호}', variables: ['전화번호', '거부번호'], category: '이벤트' },
  { id: 'mt6', name: '시술 후 케어 안내', type: 'sms', content: '[뷰티샵] {고객명}님, 오늘 시술 감사합니다. 귀가 후 수분크림을 충분히 발라주세요. 다음 예약: {다음날짜}', variables: ['고객명', '다음날짜'], category: '케어' },
];

export const mockMessageHistory: MessageHistory[] = [
  { id: 'mh1', type: 'sms', templateName: '예약 리마인더', content: '[뷰티샵] 내일 예약 리마인더', recipients: 12, successCount: 11, failCount: 1, sentAt: '2026-03-05 09:00', status: 'sent', cost: 1320 },
  { id: 'mh2', type: 'kakao-channel', templateName: '생일 축하', title: '생일 축하 혜택', content: '3월 생일 축하 메시지', recipients: 5, successCount: 5, failCount: 0, sentAt: '2026-03-01 10:00', status: 'sent', cost: 250 },
  { id: 'mh3', type: 'lms', templateName: '이벤트 공지', content: '봄맞이 특별 이벤트 공지', recipients: 85, successCount: 83, failCount: 2, sentAt: '2026-03-03 10:00', status: 'sent', cost: 12750 },
];

export const mockSalesData = [
  { date: '2026-02-01', revenue: 580000, cost: 120000, profit: 460000, reservationCount: 7, newCustomers: 2 },
  { date: '2026-02-02', revenue: 420000, cost: 90000, profit: 330000, reservationCount: 5, newCustomers: 1 },
  { date: '2026-02-03', revenue: 750000, cost: 160000, profit: 590000, reservationCount: 9, newCustomers: 3 },
  { date: '2026-02-04', revenue: 630000, cost: 130000, profit: 500000, reservationCount: 8, newCustomers: 1 },
  { date: '2026-02-05', revenue: 890000, cost: 190000, profit: 700000, reservationCount: 11, newCustomers: 4 },
  { date: '2026-02-06', revenue: 710000, cost: 150000, profit: 560000, reservationCount: 9, newCustomers: 2 },
  { date: '2026-02-07', revenue: 480000, cost: 100000, profit: 380000, reservationCount: 6, newCustomers: 1 },
  { date: '2026-02-08', revenue: 920000, cost: 200000, profit: 720000, reservationCount: 12, newCustomers: 5 },
  { date: '2026-02-09', revenue: 670000, cost: 140000, profit: 530000, reservationCount: 8, newCustomers: 2 },
  { date: '2026-02-10', revenue: 840000, cost: 175000, profit: 665000, reservationCount: 10, newCustomers: 3 },
  { date: '2026-02-11', revenue: 590000, cost: 125000, profit: 465000, reservationCount: 7, newCustomers: 1 },
  { date: '2026-02-12', revenue: 1050000, cost: 220000, profit: 830000, reservationCount: 13, newCustomers: 6 },
  { date: '2026-02-13', revenue: 780000, cost: 165000, profit: 615000, reservationCount: 10, newCustomers: 2 },
  { date: '2026-02-14', revenue: 1200000, cost: 250000, profit: 950000, reservationCount: 15, newCustomers: 4 },
  { date: '2026-02-15', revenue: 860000, cost: 180000, profit: 680000, reservationCount: 11, newCustomers: 3 },
  { date: '2026-02-16', revenue: 720000, cost: 150000, profit: 570000, reservationCount: 9, newCustomers: 2 },
  { date: '2026-02-17', revenue: 650000, cost: 135000, profit: 515000, reservationCount: 8, newCustomers: 1 },
  { date: '2026-02-18', revenue: 940000, cost: 195000, profit: 745000, reservationCount: 12, newCustomers: 5 },
  { date: '2026-02-19', revenue: 810000, cost: 170000, profit: 640000, reservationCount: 10, newCustomers: 3 },
  { date: '2026-02-20', revenue: 1100000, cost: 230000, profit: 870000, reservationCount: 14, newCustomers: 4 },
  { date: '2026-02-21', revenue: 760000, cost: 160000, profit: 600000, reservationCount: 10, newCustomers: 2 },
  { date: '2026-02-22', revenue: 880000, cost: 185000, profit: 695000, reservationCount: 11, newCustomers: 3 },
  { date: '2026-02-23', revenue: 540000, cost: 115000, profit: 425000, reservationCount: 7, newCustomers: 1 },
  { date: '2026-02-24', revenue: 970000, cost: 205000, profit: 765000, reservationCount: 12, newCustomers: 4 },
  { date: '2026-02-25', revenue: 1050000, cost: 220000, profit: 830000, reservationCount: 13, newCustomers: 5 },
  { date: '2026-02-26', revenue: 820000, cost: 172000, profit: 648000, reservationCount: 10, newCustomers: 2 },
  { date: '2026-02-27', revenue: 690000, cost: 145000, profit: 545000, reservationCount: 9, newCustomers: 2 },
  { date: '2026-02-28', revenue: 930000, cost: 195000, profit: 735000, reservationCount: 12, newCustomers: 3 },
  { date: '2026-03-01', revenue: 750000, cost: 158000, profit: 592000, reservationCount: 10, newCustomers: 2 },
  { date: '2026-03-02', revenue: 880000, cost: 185000, profit: 695000, reservationCount: 11, newCustomers: 3 },
  { date: '2026-03-03', revenue: 1020000, cost: 215000, profit: 805000, reservationCount: 13, newCustomers: 4 },
  { date: '2026-03-04', revenue: 690000, cost: 145000, profit: 545000, reservationCount: 9, newCustomers: 1 },
  { date: '2026-03-05', revenue: 850000, cost: 178000, profit: 672000, reservationCount: 11, newCustomers: 2 },
];

export const mockShopSettings: ShopSettings = {
  id: 'shop1',
  name: '뷰티 케어 샵',
  type: '복합샵',
  phone: '02-1234-5678',
  address: '서울시 강남구 테헤란로 123',
  businessHours: {
    월: { open: '10:00', close: '20:00', isOff: false },
    화: { open: '10:00', close: '20:00', isOff: false },
    수: { open: '10:00', close: '20:00', isOff: false },
    목: { open: '10:00', close: '20:00', isOff: false },
    금: { open: '10:00', close: '21:00', isOff: false },
    토: { open: '10:00', close: '18:00', isOff: false },
    일: { open: '10:00', close: '18:00', isOff: true },
  },
  holidays: [],
  naverBooking: { isConnected: true, placeId: 'nv_1234567', placeName: '뷰티 케어 샵', lastSyncAt: '2026-03-06 08:00' },
  kakao: { channelConnected: true, channelId: 'beautycareshop', channelName: '뷰티케어샵', openchatConnected: false },
  smsApiKey: '****',
  smsCallerId: '0212345678',
  pointRate: 1,
  notificationSettings: {
    reservationConfirm: true,
    reservationReminder: true,
    birthdayMessage: true,
    novisitMessage: true,
  },
};
