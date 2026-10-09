/**
 * Risk / guard-band math checked against published values.
 * Each describe() names the source; values are copied from the published tables/text.
 */
import { describe, expect, test } from 'vitest';
import { globalRisk, guardBand, method6M, riskFromTur, sigmaFromEopr, specificRiskOutside, trueFromObservedEopr, worstCasePfa } from '../risk';
import { normInv } from '../stats';

const K196 = normInv(0.975); // 1.959964...
const pct = (p: number) => p * 100;

describe('Keysight 5991-1267EN (Dobbert, basis of Z540.3 Handbook Method 6), Table 2: maximum PFA over in-tolerance probability, no guard band', () => {
  // TUR, ITP at the maximum (%), maximum false-accept risk (%) -- as published
  const table: Array<[number, number, number]> = [
    [1.1, 57.15, 6.956], [1.2, 57.89, 6.495], [1.3, 58.54, 6.092], [1.5, 59.62, 5.42], [1.75, 60.67, 4.763],
    [2, 61.5, 4.249], [2.5, 62.71, 3.495], [3, 63.55, 2.968], [3.5, 64.18, 2.579], [4, 64.65, 2.281],
    [5, 65.34, 1.852], [6, 65.8, 1.559], [8, 66.4, 1.184], [10, 66.76, 0.955], [12, 67.01, 0.8], [15, 67.26, 0.643], [19, 67.47, 0.51],
  ];
  test.each(table)('TUR %s:1 -> ITP %s %%, max PFA %s %% (U95 = 1.96 u)', (tur, itp, maxPfa) => {
    const w = worstCasePfa(tur, K196);
    expect(pct(w.pfa)).toBeCloseTo(maxPfa, 3); // published to 3 decimals
    expect(Math.abs(pct(w.eopr) - itp)).toBeLessThan(0.03); // location of a flat maximum
  });
});

describe('Keysight 5991-1267EN Table 2: guard-band multiplier M giving exactly 2 % PFA at the worst-case ITP', () => {
  const table: Array<[number, number, number]> = [[1.5, 59.62, 35.89], [2, 61.5, 27.93], [3, 63.55, 15.36], [4, 64.65, 5.32], [5, 65.34, -3.23], [10, 66.76, -35.73]];
  test.each(table)('TUR %s:1 at ITP %s %% -> M = %s %%', (tur, itp, Mpct) => {
    const L = 1;
    const U95 = L / tur;
    const base = { lower: -L, upper: L, mean: 0, sigmaUut: sigmaFromEopr(-L, L, 0, itp / 100), uMeas: U95 / K196 };
    const g = guardBand({ method: 'target', halfTol: L, U95, tur, targetPfa: 0.02, riskBase: base });
    expect(100 * (g.w / U95)).toBeCloseTo(Mpct, 1);
  });
});

describe('Z540.3 Handbook Method 6: M2% = 1.04 - exp(0.38 ln TUR - 0.54) keeps worst-case PFA at ~2 %', () => {
  test('formula values: TUR 2 -> M = 0.2816, TUR 4 -> M = 0.0531 (Keysight Table 2 fitted points 27.93 %, 5.32 %)', () => {
    expect(method6M(2)).toBeCloseTo(0.2816, 4);
    expect(method6M(4)).toBeCloseTo(0.0531, 4);
    // zero crossing near 4.6:1 -- the TUR above which no guard band is needed
    expect(method6M(4.6)).toBeGreaterThan(-0.002);
    expect(method6M(4.6)).toBeLessThan(0.002);
  });
  test.each([1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5])('TUR %s:1: max PFA over all EOPR with Method 6 limits is 2 %% within the curve-fit error', (tur) => {
    const M = method6M(tur);
    const worst = worstCasePfa(tur, K196, M / tur);
    expect(pct(worst.pfa)).toBeGreaterThan(1.9);
    expect(pct(worst.pfa)).toBeLessThan(2.06);
  });
  test('guardBand(): Method 6 clamps to no guard band for TUR >= 4.6', () => {
    expect(guardBand({ method: 'method6', halfTol: 1, U95: 1 / 6, tur: 6 }).w).toBe(0);
  });
});

describe('Mimbs, "Using Reliability to Meet Z540.3\'s 2% Rule" (NASA NTRS 20110014475)', () => {
  test('TUR 4.6:1 guarantees PFA <= 2 % for any EOPR; 3.33:1 corresponds to 2.7 %', () => {
    expect(pct(worstCasePfa(4.6, K196).pfa)).toBeCloseTo(2.0, 1);
    expect(pct(worstCasePfa(3.33, K196).pfa)).toBeCloseTo(2.7, 1);
  });
  // Observed 89 % EOPR -> true EOPR (table "Observed vs True EOPR")
  test.each([[10, 89.1], [4, 89.7], [3, 90.3], [2, 92.0], [1, 99.4]])('TUR %s:1, observed 89 %% -> true %s %%', (tur, truePct) => {
    const U95 = 1 / tur;
    const r = trueFromObservedEopr(-1, 1, 0, 0.89, U95 / K196);
    expect(pct(r.eopr)).toBeCloseTo(truePct, 1);
  });
  test('TUR 0.7:1, observed 89 % -> true 100 %', () => {
    expect(trueFromObservedEopr(-1, 1, 0, 0.89, 1 / 0.7 / K196).eopr).toBe(1);
  });
});

describe('NASA-HDBK-8739.19-4 (2010) Tables 5-1 and 5-2: ±100 um, 95 % in-tolerance, UUT bias u = 51.0214 um, UFAR', () => {
  const sigma = 51.0214;
  test('UUT bias uncertainty for 95 % in-tolerance of ±100', () => {
    expect(sigmaFromEopr(-100, 100, 0, 0.95)).toBeCloseTo(sigma, 3);
  });
  // process uncertainty u, guardband multiplier (A = g * 100), false reject % -- Table 5-1 (1 % false accept)
  const t51: Array<[number, number, number]> = [[5.1021, 1.0464835, 0.1262], [10.2043, 1.0285771, 0.8061], [25.5107, 0.9339747, 6.1568], [51.0214, 0.7391005, 26.5683]];
  test.each(t51)('Table 5-1: u = %s um, multiplier %s -> PFA 1.000 %%, PFR %s %%', (u, g, pfr) => {
    const r = globalRisk({ lower: -100, upper: 100, accLower: -100 * g, accUpper: 100 * g, mean: 0, sigmaUut: sigma, uMeas: u });
    expect(pct(r.pfa)).toBeCloseTo(1.0, 3);
    expect(pct(r.pfr)).toBeCloseTo(pfr, 3);
  });
  test.each(t51)('Table 5-1 inverse: target 1 %% PFA solves to multiplier for u = %s um', (u, g) => {
    const res = guardBand({ method: 'target', halfTol: 100, U95: 2 * u, tur: 100 / (2 * u), targetPfa: 0.01, riskBase: { lower: -100, upper: 100, mean: 0, sigmaUut: sigma, uMeas: u } });
    expect(1 - res.w / 100).toBeCloseTo(g, 5);
  });
  // Table 5-2 (guard band = 2u): false reject %
  const t52: Array<[number, number]> = [[0.5102, 0.2406], [1.0204, 0.4931], [5.1021, 3.0], [10.2043, 7.6273], [25.5107, 34.0917]];
  test.each(t52)('Table 5-2: u = %s um, A = 100 - 2u -> PFR %s %%', (u, pfr) => {
    const r = globalRisk({ lower: -100, upper: 100, accLower: -(100 - 2 * u), accUpper: 100 - 2 * u, mean: 0, sigmaUut: sigma, uMeas: u });
    expect(pct(r.pfr)).toBeCloseTo(pfr, 3);
  });
  // NOTE: the False Accept column of Table 5-2 (0.00106, 0.00209, 0.00101, 0.00110, 0.00598 %) is not
  // monotonic and is NOT reproduced by this model (nor is it consistent with Table 5-1 on the same scenario);
  // it is deliberately not used as a test value.
});

describe('Morehouse "Why a 4:1 TUR is not enough" and Sandia SAND2021-8069 (text statements)', () => {
  test('4:1 TUR, k = 2, 95 % EOPR: PFA < 1 % and PFR slightly over 1.5 %', () => {
    const r = riskFromTur(4, 0.95, 2);
    expect(pct(r.pfa)).toBeLessThan(1);
    expect(pct(r.pfa)).toBeCloseTo(0.86, 2);
    expect(pct(r.pfr)).toBeGreaterThan(1.5);
    expect(pct(r.pfr)).toBeLessThan(1.6);
  });
  test('RSS guard band at 95 % ITP: PFA ≈ 0.6 % for TUR < 4; PFR ≈ 2 % at TUR 4 rising to ≈ 18 % at 1.5', () => {
    for (const tur of [1.5, 2, 3, 3.9]) {
      const w = guardBand({ method: 'rss', halfTol: 1, U95: 1 / tur, tur }).w;
      const p = pct(riskFromTur(tur, 0.95, 2, w).pfa);
      expect(p).toBeGreaterThan(0.5);
      expect(p).toBeLessThan(0.7);
    }
    const w4 = guardBand({ method: 'rss', halfTol: 1, U95: 0.25, tur: 4 }).w;
    expect(pct(riskFromTur(4, 0.95, 2, w4).pfr)).toBeCloseTo(2, 0);
    const w15 = guardBand({ method: 'rss', halfTol: 1, U95: 1 / 1.5, tur: 1.5 }).w;
    expect(pct(riskFromTur(1.5, 0.95, 2, w15).pfr)).toBeCloseTo(18, -0.5);
  });
});

describe('ILAC G8:09/2019 Table 1: specific risk at the acceptance limit A = TL - rU (U = 2u, single-sided)', () => {
  const u = 1;
  const U = 2 * u;
  const TL = 100;
  test.each([[3, 1e-6], [1.5, 0.0016], [1, 0.025], [0.83, 0.05], [0, 0.5000001]])('w = %sU -> specific PFA < %s', (r, bound) => {
    const p = specificRiskOutside(TL - r * U, -Infinity, TL, u);
    expect(p).toBeLessThan(bound);
  });
  test('w = 1U gives 2.28 % (1 - Phi(2)); simple acceptance at the limit gives exactly 50 %', () => {
    expect(specificRiskOutside(TL - U, -Infinity, TL, u)).toBeCloseTo(0.02275, 5);
    expect(specificRiskOutside(TL, -Infinity, TL, u)).toBeCloseTo(0.5, 12);
  });
  test('"uncritical" w = -U: a reading at TL + U has < 2.5 % chance of being in tolerance', () => {
    expect(1 - specificRiskOutside(TL + U, -Infinity, TL, u)).toBeLessThan(0.025);
  });
});

describe('internal consistency', () => {
  test('PFA + correct accepts = P(accept); PFR + correct accepts = P(in tolerance)', () => {
    const r = riskFromTur(2.5, 0.9, 2, 0.1);
    expect(r.pIn).toBeCloseTo(0.9, 12);
    expect(r.pAccept).toBeGreaterThan(0);
    expect(r.cfa).toBeCloseTo(r.pfa / r.pAccept, 12);
  });
  test('asymmetric EOPR solve reproduces the requested probability', () => {
    const s = sigmaFromEopr(-1, 3, 0, 0.9);
    expect(globalRisk({ lower: -1, upper: 3, accLower: -1, accUpper: 3, mean: 0, sigmaUut: s, uMeas: 1e-9 }).pIn).toBeCloseTo(0.9, 10);
  });
  test('one-sided limit: EOPR -> sigma and risk are finite and sensible', () => {
    const s = sigmaFromEopr(-Infinity, 1, 0, 0.95);
    expect(s).toBeCloseTo(1 / normInv(0.95), 12);
    const r = globalRisk({ lower: -Infinity, upper: 1, accLower: -Infinity, accUpper: 1, mean: 0, sigmaUut: s, uMeas: 0.125 });
    expect(r.pfa).toBeGreaterThan(0);
    expect(r.pfa).toBeLessThan(0.02);
  });
  test('symmetric TUR model is invariant to the scale and offset of the tolerance', () => {
    const a = riskFromTur(3, 0.95, 2).pfa;
    const s = sigmaFromEopr(9.99, 10.01, 10, 0.95);
    const b = globalRisk({ lower: 9.99, upper: 10.01, accLower: 9.99, accUpper: 10.01, mean: 10, sigmaUut: s, uMeas: 0.01 / 3 / 2 }).pfa;
    expect(b).toBeCloseTo(a, 9);
  });
});
