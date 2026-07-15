import { useEffect, useState } from 'react';
import { SettingsStore } from '../lib/store';

export const SHOP_SETTINGS_CHANGED_EVENT = 'crm:shop-settings-changed';

const DEFAULT_SHOP_PLACEHOLDER = '내 에스테틱 샵';
const DEFAULT_PROGRAM_NAME = '트로이아르케 CRM';

function cleanShopName(value?: string | null): string {
  return (value || '').trim().replace(/\s*CRM\s*$/i, '').trim();
}

function resolveShopName(fallbackShopName?: string): string {
  const savedName = cleanShopName(SettingsStore.get().name);
  if (savedName && savedName !== DEFAULT_SHOP_PLACEHOLDER) return savedName;
  return cleanShopName(fallbackShopName);
}

export function formatCrmProgramName(shopName?: string | null): string {
  const cleaned = cleanShopName(shopName);
  return cleaned ? `${cleaned} CRM` : DEFAULT_PROGRAM_NAME;
}

export function useCrmBrand(fallbackShopName?: string) {
  const [shopName, setShopName] = useState(() => resolveShopName(fallbackShopName));

  useEffect(() => {
    setShopName(resolveShopName(fallbackShopName));
  }, [fallbackShopName]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      setShopName(cleanShopName(detail?.name) || resolveShopName(fallbackShopName));
    };

    window.addEventListener(SHOP_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(SHOP_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
  }, [fallbackShopName]);

  return {
    shopName,
    programName: formatCrmProgramName(shopName),
  };
}
