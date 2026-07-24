// ⚠️ 자동 생성 파일 — scripts/prepare-portable-update.mjs가 릴리스 때마다 갱신.
// 공지 게시판의 오프라인/CORS 차단 시 fallback (서버 응답이 있으면 서버본 우선).
export interface ReleaseHistoryEntry {
  version: string;
  releaseDate?: string;
  notes?: string;
}

const releaseHistory: ReleaseHistoryEntry[] = [
  {
    version: '1.0.34',
    releaseDate: '2026-07-22',
    notes: 'v1.0.34 업데이트 내용\n\n■ 새 기능\n• 공지사항 게시판 — 설정 > 공지사항에서 지난 업데이트 소식과 변경 내용을 언제든 확인할 수 있습니다\n• 업데이트가 더 간편해졌습니다 — [지금 업데이트]를 누르면 진행 상황이 표시되고, 완료되면 자동으로 다시 시작됩니다\n\n■ 포함된 최근 개선 (v1.0.31~33)\n• 지점용 CRM과 관리자 어드민 프로그램 완전 분리\n• 고객 엑셀 업로드 가이드 + 양식 다운로드\n• 중앙 서버 연결 오류 수정, 예약 완료 시 결제 자동 등록, 매출 환불 기록',
  },
  {
    version: '1.0.33',
    releaseDate: '2026-07-22',
    notes: '■ 프로그램 분리 완성\n• 지점용 CRM과 관리자 어드민 프로그램이 완전히 분리되었습니다\n• 지점용 프로그램에서는 관리자 화면이 나타나지 않습니다\n\n■ 새 기능\n• 고객 엑셀 업로드 가이드 + 양식 다운로드\n• 업데이트 알림 개선 — 변경 내용 확인 후 클릭 한 번으로 업데이트\n\n■ 개선·수정\n• 중앙 서버 연결 오류 수정 (로그인·데이터 저장)\n• 예약 완료 시 결제 자동 등록, 매출 환불 기록\n• 설정 > 데이터 백업 > 기존 계정 데이터 가져오기',
  },
];

export default releaseHistory;
