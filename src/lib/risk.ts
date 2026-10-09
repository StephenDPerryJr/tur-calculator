/**
 * Measurement decision risk (global / average and specific) for normally distributed
 * UUT values and measurement errors.
 *
 * Global risk (Z540.3 Handbook Method 1, NASA-HDBK-8739.19-4 "UFAR", JCGM 106:2012 eqs. 17 & 19):
 *   UUT value x ~ N(mean, sigmaUut)        (a-priori / end-of-period population, set from EOPR)
 *   measured  y = x + e, e ~ N(0, uMeas)   (measurement process standard uncertainty)
 *   PFA = P(x outside [lower, upper]  AND  y inside [accLower, accUpper])   (unconditional, joint)
 *   PFR = P(x inside  [lower, upper]  AND  y outside [accLower, accUpper])
 * Computed by 1-D adaptive Gauss-Kronrod integration over x of f(x) * P(accept | x); the inner
 * integral over e is exact (normal CDF). No Monte Carlo, no lookup tables.
 *
 * Specific risk (JCGM 106 7.3 / ILAC G8:09/2019 Table 1): for one measured value y with standard
 * uncertainty u (normal, no prior information), the probability the true value is outside the limits.
 */
import { normCdf, normInv } from './stats';

// ------------------------------------------------------------ integration
const XK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440, 0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0];
const WK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919, 0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];

function gk15(f: (x: number) => number, a: number, b: number): [number, number] {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const fc = f(c);
  let k = fc * WK[7];
  let g = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XK[j];
    const s = f(c - dx) + f(c + dx);
    k += WK[j] * s;
    if (j % 2 === 1) g += WG[(j - 1) / 2] * s;
  }
  return [k * h, Math.abs((k - g) * h)];
}

function adapt(f: (x: number) => number, a: number, b: number, tol: number, depth: number): number {
  const [v, err] = gk15(f, a, b);
  if (err <= tol || depth > 40 || b - a < 1e-300) return v;
  const m = (a + b) / 2;
  return adapt(f, a, m, tol / 2, depth + 1) + adapt(f, m, b, tol / 2, depth + 1);
}

/** Integrate f over [a,b], splitting at the given breakpoints. */
export function integrate(f: (x: number) => number, a: number, b: number, breaks: number[] = [], tol = 1e-15): number {
  if (!(b > a)) return 0;
  const pts = [a, ...breaks.filter((x) => Number.isFinite(x) && x > a && x < b).sort((p, q) => p - q), b];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1] > pts[i]) s += adapt(f, pts[i], pts[i + 1], tol, 0);
  return s;
}

// ------------------------------------------------------------ EOPR <-> sigma
function probInside(lower: number, upper: number, mean: number, sigma: number): number {
  const pu = upper === Infinity ? 1 : normCdf((upper - mean) / sigma);
  const pl = lower === -Infinity ? 0 : normCdf((lower - mean) / sigma);
  return pu - pl;
}

/**
 * Standard deviation of a normal population centred at `mean` that has probability `eopr` of lying
 * inside [lower, upper] (either limit may be infinite for one-sided tolerances).
 */
export function sigmaFromEopr(lower: number, upper: number, mean: number, eopr: number): number {
  if (!(eopr > 0 && eopr < 1)) return NaN;
  if (Number.isFinite(lower) && Number.isFinite(upper) && Math.abs(mean - (lower + upper) / 2) < 1e-15 * Math.max(1, Math.abs(mean)))
    return (upper - lower) / 2 / normInv((1 + eopr) / 2);
  if (!Number.isFinite(lower) && Number.isFinite(upper)) return eopr > 0.5 ? (upper - mean) / normInv(eopr) : NaN;
  if (!Number.isFinite(upper) && Number.isFinite(lower)) return eopr > 0.5 ? (mean - lower) / normInv(eopr) : NaN;
  // asymmetric two-sided: P(inside) decreases monotonically with sigma; bisect on log(sigma)
  const w = upper - lower;
  let lo = Math.log(w * 1e-9);
  let hi = Math.log(w * 1e6);
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (probInside(lower, upper, mean, Math.exp(m)) > eopr) lo = m;
    else hi = m;
  }
  return Math.exp((lo + hi) / 2);
}

export function eoprFromSigma(lower: number, upper: number, mean: number, sigma: number): number {
  return probInside(lower, upper, mean, sigma);
}

/**
 * "Observed" (as-received, i.e. as measured) EOPR includes the measurement error; the "true" EOPR used
 * in the risk model does not. With normal distributions the observed spread is sqrt(sigma^2 + u^2), so
 * sigma_true = sqrt(sigma_obs^2 - u^2) (Mimbs, "Using Reliability to Meet Z540.3's 2% Rule", NASA 2011).
 */
export function trueFromObservedEopr(lower: number, upper: number, mean: number, observed: number, uMeas: number): { sigma: number; eopr: number } {
  const sObs = sigmaFromEopr(lower, upper, mean, observed);
  const s2 = sObs * sObs - uMeas * uMeas;
  if (!(s2 > 0)) return { sigma: 0, eopr: 1 };
  const sigma = Math.sqrt(s2);
  return { sigma, eopr: eoprFromSigma(lower, upper, mean, sigma) };
}

// ------------------------------------------------------------ global risk
export interface RiskInput {
  lower: number; // tolerance limits (may be +/-Infinity for one-sided)
  upper: number;
  accLower: number; // acceptance limits
  accUpper: number;
  mean: number; // centre of the UUT population (normally the nominal)
  sigmaUut: number; // UUT population standard deviation (from EOPR)
  uMeas: number; // measurement process standard uncertainty
}

export interface RiskResult {
  pfa: number; // unconditional probability of false accept
  pfr: number; // unconditional probability of false reject
  pIn: number; // true in-tolerance probability (EOPR)
  pAccept: number; // probability of an accept decision
  cfa: number; // conditional false accept risk = PFA / P(accept)
}

export function globalRisk(r: RiskInput): RiskResult {
  const { lower, upper, accLower, accUpper, mean, sigmaUut: s, uMeas: u } = r;
  const pdf = (x: number) => Math.exp(-0.5 * ((x - mean) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const acc = (x: number) => (accUpper === Infinity ? 1 : normCdf((accUpper - x) / u)) - (accLower === -Infinity ? 0 : normCdf((accLower - x) / u));
  const rej = (x: number) => (accUpper === Infinity ? 0 : normCdf((x - accUpper) / u)) + (accLower === -Infinity ? 0 : normCdf((accLower - x) / u));
  const lo = mean - 14 * s;
  const hi = mean + 14 * s;
  const breaks: number[] = [mean];
  for (const p of [lower, upper, accLower, accUpper]) {
    if (!Number.isFinite(p)) continue;
    breaks.push(p);
    for (const m of [1, 2, 4, 7, 11]) breaks.push(p - m * u, p + m * u, p - m * s, p + m * s);
  }
  const fa = (x: number) => pdf(x) * acc(x);
  const fr = (x: number) => pdf(x) * rej(x);
  const L = Math.max(lo, lower);
  const U = Math.min(hi, upper);
  let pfa = 0;
  if (lower > lo) pfa += integrate(fa, lo, lower, breaks);
  if (upper < hi) pfa += integrate(fa, upper, hi, breaks);
  const pfr = U > L ? integrate(fr, L, U, breaks) : 0;
  const pIn = probInside(lower, upper, mean, s);
  const pAccept = pIn - pfr + pfa;
  return { pfa, pfr, pIn, pAccept, cfa: pAccept > 0 ? pfa / pAccept : NaN };
}

/**
 * Convenience: risk for a symmetric tolerance in normalised units.
 * tur = Z540.3 TUR, eopr = true in-tolerance probability, k95 = U95/u, guardBand w as a fraction
 * of the tolerance half-width L (acceptance limit A = L - w).
 */
export function riskFromTur(tur: number, eopr: number, k95 = 2, w = 0): RiskResult {
  const L = 1;
  const U95 = L / tur;
  const sigma = sigmaFromEopr(-L, L, 0, eopr);
  return globalRisk({ lower: -L, upper: L, accLower: -(L - w), accUpper: L - w, mean: 0, sigmaUut: sigma, uMeas: U95 / k95 });
}

/** Maximum PFA over all in-tolerance probabilities for a given TUR (Z540.3 Handbook Method 6 basis). */
export function worstCasePfa(tur: number, k95 = 2, w = 0): { pfa: number; eopr: number } {
  const f = (R: number) => riskFromTur(tur, R, k95, w).pfa;
  // coarse scan then golden-section refinement
  let bestR = 0.5;
  let best = -1;
  for (let R = 0.02; R < 0.9995; R += 0.02) {
    const v = f(R);
    if (v > best) { best = v; bestR = R; }
  }
  let a = Math.max(0.0005, bestR - 0.02);
  let b = Math.min(0.9995, bestR + 0.02);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < 40; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  const R = (a + b) / 2;
  return { pfa: f(R), eopr: R };
}

// ------------------------------------------------------------ guard bands
export type GuardMethod = 'none' | 'u95' | 'method6' | 'rss' | 'multiple' | 'target';

export const GUARD_INFO: Record<GuardMethod, { label: string; formula: string; reference: string; note: string }> = {
  none: {
    label: 'No guard band (simple acceptance)',
    formula: 'A = L',
    reference: 'ILAC G8:09/2019 1.9 & Table 1 (w = 0); ASME B89.7.3.1',
    note: 'Specific false-accept risk can be up to 50 % for a reading right at the limit. Acceptable when the TUR (or global PFA) requirement is met and agreed with the customer.',
  },
  u95: {
    label: 'Guard band = U95 (A = L − U)',
    formula: 'A = L − U95',
    reference: 'ILAC G8:09/2019 Table 1 ("ILAC G8:2009 rule", w = 1U); Z540.3 Handbook Method 5',
    note: 'Specific false-accept risk < 2.5 % for any reading (normal, k = 2). Very conservative: high false-reject risk at low TUR. Only option for one-sided limits with no knowledge of the UUT population.',
  },
  method6: {
    label: 'Z540.3 Handbook Method 6 (managed risk, Dobbert)',
    formula: 'A = L − M·U95,  M = 1.04 − exp(0.38·ln(TUR) − 0.54)',
    reference: 'ANSI/NCSL Z540.3 Handbook Method 6; Dobbert, NCSLI Measure 3(4) 2008 / Keysight 5991-1267EN',
    note: 'Keeps global PFA ≤ 2 % for any EOPR without needing to know it. M ≤ 0 for TUR ≥ ≈4.6, where no guard band is needed (we use A = L there rather than widening the limits).',
  },
  rss: {
    label: 'RSS guard band',
    formula: 'A = L·√(1 − 1/TUR²) = √(L² − U95²)',
    reference: 'Sandia SAND2021-8069 (PSL practice); Deaver, "Guardbanding with confidence", NCSLI 1994',
    note: 'About 0.6 % global PFA at 95 % EOPR for TUR < 4 (Sandia). Undefined for TUR ≤ 1.',
  },
  multiple: {
    label: 'Custom multiple of U (w = r·U95)',
    formula: 'A = L − r·U95',
    reference: 'ILAC G8:09/2019 5.2 & Table 1 (r = 3, 1.5, 1, 0.83, 0, −1)',
    note: 'r = 1.5 → specific PFA < 0.16 %; r = 0.83 → < 5 % (ISO 14253-1:2017); r = −1 → "uncritical" (PFR < 2.5 %).',
  },
  target: {
    label: 'Target global PFA (solved numerically)',
    formula: 'Find A such that PFA(A; TUR, EOPR) = target',
    reference: 'NASA-HDBK-8739.19-4 5.3.2.2 & Table 5-1; Z540.3 Handbook Method 1 risk model',
    note: 'Needs a credible EOPR. A can fall outside the tolerance (negative guard band) when uncertainty is small.',
  },
};

/** Z540.3 Handbook Method 6 guard-band multiplier M2% (unclamped). */
export function method6M(tur: number): number {
  return 1.04 - Math.exp(0.38 * Math.log(tur) - 0.54);
}

export interface GuardInput {
  method: GuardMethod;
  halfTol: number; // L (half the tolerance span, or the one-sided distance)
  U95: number;
  tur: number;
  r?: number; // for 'multiple'
  // for 'target'
  targetPfa?: number;
  riskBase?: Omit<RiskInput, 'accLower' | 'accUpper'>;
}

export interface GuardResult { w: number; valid: boolean; note?: string; M?: number }

/** Guard band w (amount the acceptance limit is moved inside each tolerance limit). */
export function guardBand(g: GuardInput): GuardResult {
  const { halfTol: L, U95, tur } = g;
  switch (g.method) {
    case 'none':
      return { w: 0, valid: true };
    case 'u95':
      return { w: U95, valid: U95 < L, note: U95 >= L ? 'U95 ≥ tolerance: no acceptance zone remains.' : undefined };
    case 'method6': {
      const M = method6M(tur);
      if (M <= 0) return { w: 0, valid: true, M, note: 'TUR ≥ ≈4.6: M ≤ 0, no guard band needed (A = L).' };
      return { w: M * U95, valid: M * U95 < L, M };
    }
    case 'rss': {
      if (!(tur > 1)) return { w: L, valid: false, note: 'RSS guard band is undefined for TUR ≤ 1.' };
      return { w: L - L * Math.sqrt(1 - 1 / (tur * tur)), valid: true };
    }
    case 'multiple': {
      const r = g.r ?? 1;
      return { w: r * U95, valid: r * U95 < L };
    }
    case 'target': {
      const base = g.riskBase;
      const t = g.targetPfa ?? 0.02;
      if (!base || !(base.sigmaUut > 0)) return { w: NaN, valid: false, note: 'Needs an EOPR to solve for a target PFA.' };
      const pfaAt = (w: number) => globalRisk({ ...base, accLower: base.lower + w, accUpper: base.upper - w }).pfa;
      // PFA decreases as w increases. Search w in [wLo, wHi].
      let lo = -(L + 12 * base.uMeas + 6 * base.sigmaUut);
      let hi = L * (1 - 1e-9);
      if (pfaAt(hi) > t) return { w: hi, valid: false, note: 'Target PFA cannot be reached even with the acceptance zone shrunk to zero.' };
      if (pfaAt(lo) < t) return { w: lo, valid: true, note: 'PFA is below the target even with very wide acceptance limits.' };
      for (let i = 0; i < 100; i++) {
        const m = (lo + hi) / 2;
        if (pfaAt(m) > t) lo = m;
        else hi = m;
      }
      return { w: (lo + hi) / 2, valid: true };
    }
  }
}

// ------------------------------------------------------------ specific risk
/**
 * Specific (conditional on one reading) probability that the true value lies outside [lower, upper],
 * given measured value y and standard uncertainty u, normal distribution, no prior (JCGM 106 7.3,
 * ILAC G8:09/2019 Table 1).
 */
export function specificRiskOutside(y: number, lower: number, upper: number, u: number): number {
  const above = upper === Infinity ? 0 : normCdf((y - upper) / u);
  const below = lower === -Infinity ? 0 : normCdf((lower - y) / u);
  return above + below;
}
