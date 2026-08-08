import { useState, useEffect } from 'react';

const ZONE_STORAGE = 'mingyue_bg_zones';

function loadZoneMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ZONE_STORAGE) || '{}');
  } catch {
    return {};
  }
}

export function usePageBackground(zoneKey: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => loadZoneMap()[zoneKey]);

  useEffect(() => {
    const check = () => {
      const map = loadZoneMap();
      setUrl(map[zoneKey] || undefined);
    };
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, [zoneKey]);

  return url;
}
