/**
 * TUR / TAR math (pure functions, no UI).
 *
 *  - Tolerance at a test point from manufacturer-style specs
 *    (absolute, % of reading, % of range / full scale, ppm, counts/digits).
 *  - Expanded uncertainty of the measurement process at ~95 %, either from a stated U and k
 *    or from an RSS of a few components (normal / rectangular / triangular / U-shaped).
 *  - TUR per ANSI/NCSL Z540.3-2006 3.11 (and its Handbook):
 *        TUR = (upper tolerance limit - lower tolerance limit) / (2 * U95)
 *  - Legacy TAR = UUT tolerance / reference-standard accuracy.
 */
import { tFactor } from './stats';

/** A manufacturer-style accuracy specification; all terms add (linear sum, as specs are written). */
export interface Spec {
  pctReading: number; // % of reading
  ppmReading: number; // ppm of reading
  pctRange: number; // % of range / full scale
  ppmRange: number; // ppm of range
  counts: number; // number of counts / digits
  resolution: number; // value of one count (least significant digit) in units
  absolute: number; // fixed +/- term in units (floor)
}

export const emptySpec = (): Spec => ({ pctReading: 0, ppmReading: 0, pctRange: 0, ppmRange: 0, counts: 0, resolution: 0, absolute: 0 });

export interface SpecBreakdown {
  reading: number; // contribution of %rdg + ppm rdg
  range: number; // contribution of %range + ppm range
  counts: number; // counts * resolution
  absolute: number;
  total: number; // +/- half width at this point
}

/** Evaluate a +/- spec at a test point (nominal reading) on a given range / full scale. */
export function specAt(spec: Spec, nominal: number, range: number): SpecBreakdown {
  const n = Math.abs(nominal);
  const r = Math.abs(range);
  const reading = n * (spec.pctReading / 100 + spec.ppmReading / 1e6);
  const rng = r * (spec.pctRange / 100 + spec.ppmRange / 1e6);
  const counts = Math.abs(spec.counts * spec.resolution);
  const absolute = Math.abs(spec.absolute);
  return { reading, range: rng, counts, absolute, total: reading + rng + counts + absolute };
}

export type ToleranceKind = 'symmetric' | 'asymmetric' | 'upper' | 'lower';

export interface ToleranceInput {
  kind: ToleranceKind;
  nominal: number; // test point / nominal value
  range: number; // range or full scale (for % range terms)
  spec: Spec; // used for 'symmetric'
  minus: number; // asymmetric: amount below nominal (positive number)
  plus: number; // asymmetric: amount above nominal (positive number)
  limit: number; // one-sided: the single limit value (absolute)
}

export interface Limits {
  kind: ToleranceKind;
  lower: number; // -Infinity for 'upper' (max-only) tolerances
  upper: number; // +Infinity for 'lower' (min-only) tolerances
  nominal: number;
  span: number; // upper - lower (Infinity for one-sided)
  halfWidth: number; // span/2 for two-sided; |limit - nominal| for one-sided
  breakdown?: SpecBreakdown;
  errors: string[];
}

export function toleranceLimits(t: ToleranceInput): Limits {
  const errors: string[] = [];
  if (!Number.isFinite(t.nominal)) errors.push('Enter the nominal / test-point value.');
  switch (t.kind) {
    case 'symmetric': {
      const b = specAt(t.spec, t.nominal, t.range);
      if (!(b.total > 0)) errors.push('The tolerance works out to zero; enter at least one specification term.');
      return { kind: t.kind, lower: t.nominal - b.total, upper: t.nominal + b.total, nominal: t.nominal, span: 2 * b.total, halfWidth: b.total, breakdown: b, errors };
    }
    case 'asymmetric': {
      const lo = t.nominal - Math.abs(t.minus);
      const hi = t.nominal + Math.abs(t.plus);
      if (!(hi > lo)) errors.push('Upper limit must be above lower limit.');
      return { kind: t.kind, lower: lo, upper: hi, nominal: t.nominal, span: hi - lo, halfWidth: (hi - lo) / 2, errors };
    }
    case 'upper': {
      if (!(t.limit > t.nominal)) errors.push('For a maximum-only limit, the limit must be above the nominal / expected value.');
      return { kind: t.kind, lower: -Infinity, upper: t.limit, nominal: t.nominal, span: Infinity, halfWidth: t.limit - t.nominal, errors };
    }
    case 'lower': {
      if (!(t.limit < t.nominal)) errors.push('For a minimum-only limit, the limit must be below the nominal / expected value.');
      return { kind: t.kind, lower: t.limit, upper: Infinity, nominal: t.nominal, span: Infinity, halfWidth: t.nominal - t.limit, errors };
    }
  }
}

// ---------------------------------------------------------------- uncertainty

export type Dist = 'normal' | 'rectangular' | 'triangular' | 'ushaped' | 'standard';

export const DIST_INFO: Record<Dist, { label: string; divisor: (k: number) => number; divisorText: string; when: string }> = {
  normal: { label: 'Normal (U with stated k)', divisor: (k) => k, divisorText: '÷ k', when: 'Calibration-certificate uncertainty "U = …, k = 2" or a budget result. Divide by the k stated on the certificate.' },
  rectangular: { label: 'Rectangular (± limits)', divisor: () => Math.sqrt(3), divisorText: '÷ √3', when: 'Manufacturer specs or limits with no other information (equal chance anywhere inside ±a). Also digital resolution: a = half of one digit.' },
  triangular: { label: 'Triangular', divisor: () => Math.sqrt(6), divisorText: '÷ √6', when: 'Values more likely near the centre than near ±a (e.g. difference of two rectangular effects of equal size).' },
  ushaped: { label: 'U-shaped (arcsine)', divisor: () => Math.SQRT2, divisorText: '÷ √2', when: 'Sinusoidal / cycling effects: RF mismatch, temperature cycling of a controlled bath or room.' },
  standard: { label: 'Standard uncertainty (k = 1)', divisor: () => 1, divisorText: '÷ 1', when: 'Already a standard uncertainty, e.g. repeatability as the standard deviation of the mean s/√n.' },
};

export interface UComponent {
  id: string;
  name: string;
  value: number; // U (normal), half-width a (rect/tri/U), or u (standard)
  dist: Dist;
  k: number; // only for 'normal'
  dof: number; // degrees of freedom; Infinity if unknown/large
}

/** How to get from a standard uncertainty to the "95 %" expanded uncertainty U95. */
export type K95Mode = 'k2' | 'k196' | 't95';

export const K95_INFO: Record<K95Mode, string> = {
  k2: 'k = 2 (conventional ≈95 %; Z540.3 / ILAC G8 practice)',
  k196: 'k = 1.96 (exact 95 % for a normal distribution)',
  t95: 'k = t95(νeff) (Student-t, GUM G.3 / TN 1297 B.3)',
};

export function k95For(mode: K95Mode, veff: number): number {
  if (mode === 'k2') return 2;
  if (mode === 'k196') return tFactor(0.95, Infinity);
  return tFactor(0.95, veff > 0 ? veff : Infinity);
}

export interface ComponentResult { u: number; divisor: number; share: number }

export interface UncertaintyResult {
  uc: number; // combined standard uncertainty
  veff: number;
  k95: number;
  U95: number;
  components: ComponentResult[];
  errors: string[];
}

/** RSS of standard uncertainties (sensitivity coefficients = 1, inputs already in the measurand's unit). */
export function combineComponents(comps: UComponent[], mode: K95Mode): UncertaintyResult {
  const errors: string[] = [];
  const res: ComponentResult[] = comps.map((c) => {
    const div = DIST_INFO[c.dist].divisor(c.k);
    if (c.dist === 'normal' && !(c.k > 0)) errors.push(`${c.name || 'Component'}: coverage factor k must be > 0.`);
    const u = Math.abs(c.value) / (div > 0 ? div : NaN);
    return { u, divisor: div, share: 0 };
  });
  const sum2 = res.reduce((s, r) => s + (Number.isFinite(r.u) ? r.u * r.u : 0), 0);
  const uc = Math.sqrt(sum2);
  // Welch-Satterthwaite (GUM G.4.1)
  let den = 0;
  comps.forEach((c, i) => {
    if (Number.isFinite(c.dof) && c.dof > 0) den += res[i].u ** 4 / c.dof;
  });
  const veff = den > 0 ? uc ** 4 / den : Infinity;
  res.forEach((r) => (r.share = sum2 > 0 ? (r.u * r.u) / sum2 : 0));
  if (!(uc > 0)) errors.push('Add at least one non-zero uncertainty component.');
  const k95 = k95For(mode, veff);
  return { uc, veff, k95, U95: k95 * uc, components: res, errors };
}

/** Convert a stated expanded uncertainty (U at coverage factor k) to U95. */
export function directU95(U: number, k: number, mode: K95Mode, dof = Infinity): UncertaintyResult {
  const errors: string[] = [];
  if (!(U > 0)) errors.push('Enter the expanded uncertainty U (> 0).');
  if (!(k > 0)) errors.push('Enter the coverage factor k (> 0).');
  const uc = Math.abs(U) / k;
  const k95 = k95For(mode, dof);
  return { uc, veff: dof, k95, U95: k95 * uc, components: [], errors };
}

// ---------------------------------------------------------------- ratios

export interface TurResult {
  tur: number; // Z540.3 definition (two-sided) or the practical one-sided ratio
  method: 'z540' | 'one-sided';
  /** For asymmetric tolerances: ratio of the distance from nominal to the nearer limit over U95. */
  nearSideRatio?: number;
  pass: boolean;
  required: number;
  note: string;
}

/**
 * Z540.3-2006 3.11: TUR = span of tolerance / (2 * U95). Applies to two-sided tolerances (symmetric
 * or asymmetric, since it uses the span). For one-sided limits Z540.3 gives no definition; we report the
 * widely used practical ratio |limit - nominal| / U95 and say so.
 */
export function computeTur(lim: Limits, U95: number, required = 4): TurResult {
  if (lim.kind === 'upper' || lim.kind === 'lower') {
    const tur = lim.halfWidth / U95;
    return { tur, method: 'one-sided', pass: tur >= required, required, note: 'One-sided limit: Z540.3 3.11 applies to two-sided tolerances only, so this is the practical ratio |limit − nominal| / U95 (not a Z540.3 TUR).' };
  }
  const tur = lim.span / (2 * U95);
  const out: TurResult = { tur, method: 'z540', pass: tur >= required, required, note: 'TUR = (upper limit − lower limit) / (2 × U95), ANSI/NCSL Z540.3-2006 3.11.' };
  if (lim.kind === 'asymmetric') {
    out.nearSideRatio = Math.min(lim.upper - lim.nominal, lim.nominal - lim.lower) / U95;
    out.note += ' Tolerance is asymmetric: the span-based TUR is only approximately related to risk; check the near-side ratio too.';
  }
  return out;
}

/** Legacy test accuracy ratio: UUT tolerance (±) / reference standard accuracy (±). */
export function computeTar(uutHalfTol: number, refAccuracy: number): number {
  return Math.abs(uutHalfTol) / Math.abs(refAccuracy);
}

/** Format a ratio as "4.2:1". */
export function fmtRatio(r: number, digits = 2): string {
  if (!Number.isFinite(r)) return r === Infinity ? '∞:1' : '—';
  if (r >= 100) return `${Math.round(r)}:1`;
  return `${Number(r.toPrecision(digits + (r >= 10 ? 1 : 0))).toString()}:1`;
}

/** Engineering-ish number formatting with a given number of significant digits. */
export function fmt(v: number, sig = 4): string {
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e7 || a < 1e-6) return v.toExponential(sig - 1);
  return Number(v.toPrecision(sig)).toString();
}

export function fmtPct(p: number, sig = 3): string {
  if (!Number.isFinite(p)) return '—';
  const v = p * 100;
  if (v !== 0 && Math.abs(v) < 0.001) return `${v.toExponential(2)} %`;
  return `${Number(v.toPrecision(sig))} %`;
}
