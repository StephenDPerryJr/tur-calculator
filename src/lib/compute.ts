/** Glue: turn app state into every number the UI / report shows. */
import { GUARD_INFO, globalRisk, guardBand, sigmaFromEopr, specificRiskOutside, trueFromObservedEopr, worstCasePfa, type GuardMethod, type RiskResult } from './risk';
import { combineComponents, computeTar, computeTur, directU95, specAt, toleranceLimits, type Limits, type TurResult, type UncertaintyResult } from './tur';
import type { PointState, TableRow, TableState } from './model';

export interface GuardOutcome {
  method: GuardMethod;
  w: number;
  accLower: number;
  accUpper: number;
  valid: boolean;
  note?: string;
  M?: number;
  risk?: RiskResult;
}

export interface PointResult {
  limits: Limits;
  unc: UncertaintyResult;
  tur?: TurResult;
  tar?: number;
  sigmaUut?: number;
  eoprTrue?: number;
  noGuard?: RiskResult;
  worst?: { pfa: number; eopr: number };
  guards: GuardOutcome[];
  selected?: GuardOutcome;
  specific?: number;
  errors: string[];
}

const ALL: GuardMethod[] = ['none', 'u95', 'method6', 'rss', 'multiple', 'target'];

export function computePoint(s: PointState): PointResult {
  const limits = toleranceLimits(s.tolerance);
  const unc = s.uMode === 'direct' ? directU95(s.U, s.k, s.k95Mode, s.dof) : combineComponents(s.components, s.k95Mode);
  const errors = [...limits.errors, ...unc.errors];
  const out: PointResult = { limits, unc, guards: [], errors };
  if (errors.length || !(unc.U95 > 0)) return out;
  out.tur = computeTur(limits, unc.U95, s.required);
  if (s.refAccuracy > 0) out.tar = computeTar(limits.halfWidth, s.refAccuracy);

  const { lower, upper, nominal } = limits;
  const u = unc.uc;
  if (s.eopr > 0 && s.eopr < 1) {
    if (s.eoprType === 'observed') {
      const t = trueFromObservedEopr(lower, upper, nominal, s.eopr, u);
      out.sigmaUut = t.sigma;
      out.eoprTrue = t.eopr;
    } else {
      out.sigmaUut = sigmaFromEopr(lower, upper, nominal, s.eopr);
      out.eoprTrue = s.eopr;
    }
  }
  const sigma = out.sigmaUut;
  const riskBase = sigma && sigma > 0 ? { lower, upper, mean: nominal, sigmaUut: sigma, uMeas: u } : undefined;
  const riskAt = (aL: number, aU: number) => (riskBase ? globalRisk({ ...riskBase, accLower: aL, accUpper: aU }) : undefined);
  out.noGuard = riskAt(lower, upper);
  if (limits.kind === 'symmetric' || limits.kind === 'asymmetric') {
    const k95 = unc.U95 / u;
    out.worst = worstCasePfa(out.tur.tur, k95);
  }
  for (const m of ALL) {
    const g = guardBand({ method: m, halfTol: limits.halfWidth, U95: unc.U95, tur: out.tur.tur, r: s.r, targetPfa: s.targetPfa, riskBase });
    const accLower = lower + g.w;
    const accUpper = upper - g.w;
    const valid = g.valid && Number.isFinite(g.w) && (accUpper > accLower);
    const o: GuardOutcome = { method: m, w: g.w, accLower, accUpper, valid, note: g.note, M: g.M, risk: valid ? riskAt(accLower, accUpper) : undefined };
    out.guards.push(o);
  }
  out.selected = out.guards.find((g) => g.method === s.guard);
  if (s.measured !== null && Number.isFinite(s.measured)) out.specific = specificRiskOutside(s.measured, lower, upper, u);
  return out;
}

export interface RowResult {
  tol: number;
  lower: number;
  upper: number;
  U95: number;
  uc: number;
  tur: number;
  pass: boolean;
  accLower: number;
  accUpper: number;
  w: number;
  guardValid: boolean;
  pfa?: number;
  pfaGuarded?: number;
  errors: string[];
}

export function computeRow(r: TableRow, t: TableState): RowResult {
  const tol = specAt(r.spec, r.nominal, r.range).total;
  const unc = directU95(r.U, r.k, t.k95Mode);
  const errors = [...unc.errors];
  if (!(tol > 0)) errors.push('Tolerance is zero.');
  const lower = r.nominal - tol;
  const upper = r.nominal + tol;
  const tur = tol / unc.U95; // (2 tol)/(2 U95)
  const res: RowResult = { tol, lower, upper, U95: unc.U95, uc: unc.uc, tur, pass: tur >= t.required, accLower: lower, accUpper: upper, w: 0, guardValid: true, errors };
  if (errors.length) return res;
  const g = guardBand({ method: t.guard === 'target' ? 'method6' : t.guard, halfTol: tol, U95: unc.U95, tur, r: 1 });
  res.w = g.w;
  res.accLower = lower + g.w;
  res.accUpper = upper - g.w;
  res.guardValid = g.valid;
  if (t.eopr > 0 && t.eopr < 1) {
    const sigma = sigmaFromEopr(lower, upper, r.nominal, t.eopr);
    const b = { lower, upper, mean: r.nominal, sigmaUut: sigma, uMeas: unc.uc };
    res.pfa = globalRisk({ ...b, accLower: lower, accUpper: upper }).pfa;
    if (g.valid) res.pfaGuarded = globalRisk({ ...b, accLower: res.accLower, accUpper: res.accUpper }).pfa;
  }
  return res;
}

export const TABLE_GUARDS: GuardMethod[] = ['none', 'u95', 'method6', 'rss'];
export { GUARD_INFO };
