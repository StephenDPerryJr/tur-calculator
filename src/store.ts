import { useEffect, useState } from 'react';
import { defaultPoint, defaultTable, type PointState, type TableState } from './lib/model';

const P_KEY = 'tur.point.v1';
const T_KEY = 'tur.table.v1';

// JSON can't hold Infinity: store it as the string "inf"
const replacer = (_k: string, v: unknown) => (v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v);
const reviver = (_k: string, v: unknown) => (v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v);

function load<T>(key: string, fallback: () => T, check: (x: any) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw, reviver);
      if (check(v)) return v as T;
    }
  } catch { /* ignore */ }
  return fallback();
}

export function usePersisted() {
  const [point, setPoint] = useState<PointState>(() => load(P_KEY, defaultPoint, (x) => x && x.tolerance && Array.isArray(x.components)));
  const [table, setTable] = useState<TableState>(() => load(T_KEY, defaultTable, (x) => x && Array.isArray(x.rows)));
  useEffect(() => { try { localStorage.setItem(P_KEY, JSON.stringify(point, replacer)); } catch { /* quota */ } }, [point]);
  useEffect(() => { try { localStorage.setItem(T_KEY, JSON.stringify(table, replacer)); } catch { /* quota */ } }, [table]);
  return { point, setPoint, table, setTable };
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const safeFileName = (s: string) => s.replace(/[^\w\-.]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'tur';
