import { describe, expect, test } from 'vitest';
import { combineComponents, computeTar, computeTur, directU95, emptySpec, fmtRatio, specAt, toleranceLimits } from '../tur';
import { computePoint, computeRow } from '../compute';
import { EXAMPLES, TABLE_EXAMPLES } from '../model';

const spec = (s: Partial<ReturnType<typeof emptySpec>>) => ({ ...emptySpec(), ...s });

describe('tolerance from specifications', () => {
  test('% reading + % range at 10 V on the 10 V range: 0.0035 % + 0.0005 % -> ±400 µV', () => {
    const b = specAt(spec({ pctReading: 0.0035, pctRange: 0.0005 }), 10, 10);
    expect(b.reading).toBeCloseTo(350e-6, 12);
    expect(b.range).toBeCloseTo(50e-6, 12);
    expect(b.total).toBeCloseTo(400e-6, 12);
  });
  test('% rdg uses |reading|, so -10 V gives the same tolerance', () => {
    expect(specAt(spec({ pctReading: 0.0035, pctRange: 0.0005 }), -10, 10).total).toBeCloseTo(400e-6, 12);
  });
  test('% of full scale is constant over the range: 0.25 % of 300 psi = ±0.75 psi at any point', () => {
    for (const p of [0, 30, 150, 300]) expect(specAt(spec({ pctRange: 0.25 }), p, 300).total).toBeCloseTo(0.75, 12);
  });
  test('ppm and counts: 10 ppm rdg + 2 counts of 1 µV at 1 V -> 10 µV + 2 µV', () => {
    expect(specAt(spec({ ppmReading: 10, counts: 2, resolution: 1e-6 }), 1, 1).total).toBeCloseTo(12e-6, 15);
  });
  test('% rdg + % range + digits (handheld DMM style): ±(0.5 % rdg + 0.1 % range + 3 counts), 1 V on 4 V range, 1 mV digit', () => {
    // 0.005 + 0.004 + 0.003 = 0.012 V
    expect(specAt(spec({ pctReading: 0.5, pctRange: 0.1, counts: 3, resolution: 0.001 }), 1, 4).total).toBeCloseTo(0.012, 12);
  });
});

describe('TUR per ANSI/NCSL Z540.3-2006 3.11: span / (2 × U95)', () => {
  test('symmetric ±1 with U95 = 0.25 -> 4:1', () => {
    const lim = toleranceLimits({ kind: 'symmetric', nominal: 0, range: 0, spec: spec({ absolute: 1 }), minus: 0, plus: 0, limit: 0 });
    expect(lim.span).toBe(2);
    const t = computeTur(lim, 0.25);
    expect(t.tur).toBeCloseTo(4, 12);
    expect(t.pass).toBe(true);
    expect(computeTur(lim, 0.26).pass).toBe(false);
  });
  test('asymmetric -1/+3 uses the full span: 4 / (2 × 0.5) = 4:1, near-side ratio 1/0.5 = 2', () => {
    const lim = toleranceLimits({ kind: 'asymmetric', nominal: 10, range: 0, spec: spec({}), minus: 1, plus: 3, limit: 0 });
    expect(lim.lower).toBe(9);
    expect(lim.upper).toBe(13);
    const t = computeTur(lim, 0.5);
    expect(t.tur).toBeCloseTo(4, 12);
    expect(t.nearSideRatio).toBeCloseTo(2, 12);
  });
  test('one-sided limit: practical ratio |limit − nominal| / U95, flagged as not a Z540.3 TUR', () => {
    const lim = toleranceLimits({ kind: 'upper', nominal: 95, range: 0, spec: spec({}), minus: 0, plus: 0, limit: 100 });
    const t = computeTur(lim, 2);
    expect(t.tur).toBeCloseTo(2.5, 12); // ISOBudgets interim example: (100 − 95)/2 = 2.5
    expect(t.method).toBe('one-sided');
  });
  test('required ratio is configurable', () => {
    const lim = toleranceLimits({ kind: 'symmetric', nominal: 0, range: 0, spec: spec({ absolute: 1 }), minus: 0, plus: 0, limit: 0 });
    expect(computeTur(lim, 0.3, 3).pass).toBe(true);
  });
  test('ratio formatting', () => {
    expect(fmtRatio(4)).toBe('4:1');
    expect(fmtRatio(4.4137)).toBe('4.4:1');
    expect(fmtRatio(10.96)).toBe('11:1');
    expect(fmtRatio(12.34)).toBe('12.3:1');
  });
});

describe('expanded uncertainty at ~95 %', () => {
  test('U = 30 µV at k = 2 -> u = 15 µV; U95(k=2) = 30, U95(k=1.96) = 29.4 µV', () => {
    expect(directU95(30, 2, 'k2').U95).toBeCloseTo(30, 12);
    expect(directU95(30, 2, 'k196').U95).toBeCloseTo(29.3995, 4);
  });
  test('U at k = 1 (standard uncertainty) is multiplied up, not used as-is', () => {
    expect(directU95(10, 1, 'k2').U95).toBeCloseTo(20, 12);
  });
  test('Student t: t95(ν=10) = 2.28 (GUM Table G.2), so U95 = 2.28 u', () => {
    expect(directU95(1, 1, 't95', 10).k95).toBeCloseTo(2.228, 3); // 95.00 %: 2.228; GUM's 95.45 % column gives 2.28
  });
  test('RSS of components with divisors: normal ÷k, rectangular ÷√3, triangular ÷√6, U-shaped ÷√2', () => {
    const r = combineComponents([
      { id: 'a', name: 'cert', value: 2, dist: 'normal', k: 2, dof: Infinity }, // 1
      { id: 'b', name: 'rect', value: Math.sqrt(3), dist: 'rectangular', k: 2, dof: Infinity }, // 1
      { id: 'c', name: 'tri', value: Math.sqrt(6), dist: 'triangular', k: 2, dof: Infinity }, // 1
      { id: 'd', name: 'U', value: Math.SQRT2, dist: 'ushaped', k: 2, dof: Infinity }, // 1
    ], 'k2');
    expect(r.uc).toBeCloseTo(2, 12);
    expect(r.U95).toBeCloseTo(4, 12);
    r.components.forEach((c) => expect(c.share).toBeCloseTo(0.25, 12));
  });
  test('Welch–Satterthwaite νeff and t95 coverage', () => {
    const r = combineComponents([
      { id: 'a', name: 'A', value: 1, dist: 'standard', k: 1, dof: 4 },
      { id: 'b', name: 'B', value: 1, dist: 'standard', k: 1, dof: Infinity },
    ], 't95');
    // uc^4 / (1/4) = 4 * 4 = 16
    expect(r.veff).toBeCloseTo(16, 10);
    expect(r.k95).toBeCloseTo(2.1199, 4); // t_0.975(16) = 2.1199
  });
});

describe('legacy TAR', () => {
  test('TAR = UUT tolerance / reference accuracy', () => {
    expect(computeTar(0.02, 0.0001)).toBeCloseTo(200, 9);
  });
});

describe('worked examples used in the How-to (numbers shown in the app are computed, these pin them)', () => {
  const get = (k: string) => computePoint(EXAMPLES.find((e) => e.key === k)!.make());
  test('10 V DMM: tolerance ±400 µV, U95 ≈ 90.6 µV, TUR ≈ 4.4:1 (pass), TAR 4.4:1', () => {
    const r = get('dmm');
    expect(r.limits.halfWidth).toBeCloseTo(400e-6, 12);
    expect(r.unc.U95 * 1e6).toBeCloseTo(90.6, 1);
    expect(r.tur!.tur).toBeCloseTo(4.41, 2);
    expect(r.tur!.pass).toBe(true);
    expect(r.tar!).toBeCloseTo(4.44, 2);
  });
  test('caliper: TAR 200:1 looks great but TUR ≈ 2.4:1 because UUT resolution and repeatability dominate', () => {
    const r = get('caliper');
    expect(r.tar!).toBeCloseTo(200, 6);
    expect(r.unc.U95).toBeCloseTo(0.00844, 5);
    expect(r.tur!.tur).toBeCloseTo(2.37, 2);
    expect(r.tur!.pass).toBe(false);
  });
  test('pressure gauge: ±0.75 psi (0.25 % FS), TUR ≈ 4.47:1', () => {
    const r = get('pressure');
    expect(r.limits.halfWidth).toBeCloseTo(0.75, 12);
    expect(r.tur!.tur).toBeCloseTo(4.47, 2);
  });
  test('one-sided example uses the practical ratio and U95 guard band', () => {
    const r = get('onesided');
    expect(r.tur!.method).toBe('one-sided');
    expect(r.tur!.tur).toBeCloseTo(5, 12);
    const g = r.selected!;
    expect(g.method).toBe('u95');
    expect(g.accUpper).toBeCloseTo(0.92, 12);
    expect(g.accLower).toBe(-Infinity);
  });
  test('multi-point tables compute a TUR for every row', () => {
    for (const ex of TABLE_EXAMPLES) {
      const t = ex.make();
      for (const row of t.rows) {
        const r = computeRow(row, t);
        expect(r.errors).toEqual([]);
        expect(r.tur).toBeGreaterThan(1);
        expect(r.pfa!).toBeGreaterThan(0);
      }
    }
  });
});
