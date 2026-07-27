/**
 * nasData.ts — NAS 중앙 서버 데이터 동기화 드라이버
 *
 * store.ts의 Supabase 헬퍼(sbInsert/sbUpdate/sbDelete/sbUpsert/loadFromSupabase)와
 * 동일한 의미론(동기 API, 예외를 던지지 않음)을 유지한다.
 * 쓰기는 nasOutbox 대기열에 기록된 뒤 순서대로 전송되며, 오프라인 중 실패분은
 * 큐에 보존된다. 원격 로드(nasLoad)는 대기열을 모두 비운 뒤에만 서버를 읽어
 * 오래된 서버 상태가 미전송 로컬 변경을 덮지 않게 한다.
 * 행 형식은 클라이언트 toDb*()가 만드는 snake_case 행 그대로이며,
 * 서버(crm_records)가 세션의 지점(branch) 스코프를 강제한다.
 */
import { apiRequest, isAuthApiConfigured } from './authApi';
import { enqueueNasMutation, flushNasOutbox } from './nasOutbox';

export const isNasDataConfigured = isAuthApiConfigured;

/** 컬렉션 전체 로드. 실패(대기열 잔존 포함) 시 null (localStorage 폴백 신호). */
export async function nasLoad(collection: string): Promise<Record<string, any>[] | null> {
  try {
    // 대기 변경을 먼저 반영한다. 비우지 못하면 원격을 읽지 않아 로컬 변경 덮어쓰기를 막는다.
    await flushNasOutbox();
    const response = await apiRequest<{ rows: Record<string, any>[] }>(`/api/data/${collection}`);
    return response.rows;
  } catch (e) {
    console.error(`[NAS] ${collection} 로드 실패:`, e);
    return null;
  }
}

/**
 * 대량 이관용 upsert (NAS 최초 전환 시 localStorage → 서버 1회 이관).
 * 500행 청크를 대기열에 순서대로 넣으므로 중간 청크가 실패해도 재시도되어
 * "청크 일부만 이관된 채 완료로 오인"되는 유실이 없다.
 */
export function nasBulkUpsert(collection: string, rows: Record<string, any>[]): void {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    enqueueNasMutation(`/api/data/${collection}`, 'PUT', JSON.stringify({ rows: chunk }));
  }
}

export function nasUpsert(collection: string, row: Record<string, any>): void {
  enqueueNasMutation(`/api/data/${collection}`, 'PUT', JSON.stringify({ rows: [row] }));
}

export function nasUpdate(collection: string, id: string, updates: Record<string, any>): void {
  enqueueNasMutation(`/api/data/${collection}/${encodeURIComponent(id)}`, 'PATCH', JSON.stringify({ updates }));
}

export function nasDelete(collection: string, id: string): void {
  enqueueNasMutation(`/api/data/${collection}/${encodeURIComponent(id)}`, 'DELETE');
}
