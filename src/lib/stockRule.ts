import type { Product } from '../types';

/** 재고 부족 — 판매 중인 제품만(단종·비활성은 입고 권유 대상이 아니다). 헤더 수·대시보드 알림·'재고 부족만 보기' 필터가 같은 규칙을 쓴다 (10차 숫자 점검 #M6, 2026-11-20) */
export function isLowStock(p: Pick<Product, 'isActive' | 'stock' | 'minStock'>): boolean {
  return p.isActive !== false && p.stock <= p.minStock;
}
