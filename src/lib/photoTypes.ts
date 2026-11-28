// 사진 타입만 (228) — 의존성 0.
// 순수 규칙 모듈(photoBackupRule)과 저장소 모듈(photoStore)이 같은 타입을 쓰되,
// 규칙 쪽이 저장소·네트워크 모듈을 끌고 오지 않게 타입을 따로 둔다.

export type PhotoAngle = 'front' | 'left' | 'right' | 'other';
export type PhotoLabel = 'before' | 'after';

export interface PhotoEntry {
  id: string;
  dataUrl: string;   // base64 data URL (리사이즈됨)
  label?: PhotoLabel | string; // 시술 전/후 (구데이터 호환으로 string 허용)
  angle?: PhotoAngle;          // 촬영 각도 — 같은 각도끼리 Before/After 비교·촬영 가이드 (2026-11-17)
  takenAt: string;   // ISO 날짜 (촬영/업로드 시각)
}
