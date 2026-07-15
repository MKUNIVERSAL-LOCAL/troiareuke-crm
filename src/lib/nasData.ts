/**
 * nasData.ts — NAS 중앙 서버 데이터 동기화 드라이버
 *
 * store.ts의 Supabase 헬퍼(sbInsert/sbUpdate/sbDelete/sbUpsert/loadFromSupabase)와
 * 동일한 의미론을 제공한다: 쓰기는 fire-and-forget, 실패는 콘솔 로그.
 * 행 형식은 클라이언트 toDb*()가 만드는 snake_case 행 그대로이며,
 * 서버(crm_records)가 세션의 지점(branch) 스코프를 강제한다.
 */
import { apiRequest, isAuthApiConfigured } from './authApi';

export const isNasDataConfigured = isAuthApiConfigured;

/** 컬렉션 전체 로드. 실패 시 null (localStorage 폴백 신호). */
export async function nasLoad(collection: string): Promise<Record<string, any>[] | null> {
  try {
    const response = await apiRequest<{ rows: Record<string, any>[] }>(`/api/data/${collection}`);
    return response.rows;
  } catch (e) {
    console.error(`[NAS] ${collection} 로드 실패:`, e);
    return null;
  }
}

/** 대량 이관용 upsert (NAS 최초 전환 시 localStorage → 서버 1회 이관) */
export function nasBulkUpsert(collection: string, rows: Record<string, any>[]): void {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    apiRequest(`/api/data/${collection}`, {
      method: 'PUT',
      body: JSON.stringify({ rows: chunk }),
    }).catch(e => console.error(`[NAS] ${collection} 이관 실패:`, e));
  }
}

export function nasUpsert(collection: string, row: Record<string, any>): void {
  apiRequest(`/api/data/${collection}`, {
    method: 'PUT',
    body: JSON.stringify({ rows: [row] }),
  }).catch(e => console.error(`[NAS] ${collection} upsert 실패:`, e));
}

export function nasUpdate(collection: string, id: string, updates: Record<string, any>): void {
  apiRequest(`/api/data/${collection}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ updates }),
  }).catch(e => console.error(`[NAS] ${collection} update 실패:`, e));
}

export function nasDelete(collection: string, id: string): void {
  apiRequest(`/api/data/${collection}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).catch(e => console.error(`[NAS] ${collection} delete 실패:`, e));
}
