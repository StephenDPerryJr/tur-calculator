/** App state types, defaults and the worked examples (shared by the UI, the report and the tests). */
import type { Dist, GuardMethod, K95Mode, Spec, ToleranceInput, UComponent } from './types-reexport';
export type { Dist, GuardMethod, K95Mode, Spec, ToleranceInput, UComponent };
import { emptySpec } from './tur';

export interface PointState {
  title: string;
  unit: string;
  tolerance: ToleranceInput;
  uMode: 'direct' | 'components';
  U: number; // direct: expanded uncertainty as stated
  k: number; // direct: its coverage factor
  dof: number; // direct: effective dof if known (for t95), Infinity otherwise
  components: UComponent[];
  k95Mode: K95Mode;
  required: number; // required TUR, default 4
  refAccuracy: number; // for legacy TAR: reference standard accuracy (±, same unit)
  eopr: number; // in-tolerance probability, fraction
  eoprType: 'true' | 'observed';
  guard: GuardMethod;
  r: number; // multiple for 'multiple'
  targetPfa: number; // fraction, for 'target'
  measured: number | null; // optional measured value for specific risk
}

export interface TableRow {
  id: string;
  label: string;
  nominal: number;
  range: number;
  spec: Spec;
  U: number;
  k: number;
}

export interface TableState {
  title: string;
  unit: string;
  k95Mode: K95Mode;
  required: number;
  eopr: number; // fraction; used for PFA per point
  guard: GuardMethod;
  rows: TableRow[];
}

let counter = 0;
export const uid = (p = 'id') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

const spec = (s: Partial<Spec>): Spec => ({ ...emptySpec(), ...s });
const comp = (name: string, value: number, dist: Dist, k = 2, dof = Infinity): UComponent => ({ id: uid('c'), name, value, dist, k, dof });

const base = (over: Partial<PointState>): PointState => ({
  title: 'Test point',
  unit: 'V',
  tolerance: { kind: 'symmetric', nominal: 10, range: 10, spec: spec({}), minus: 0, plus: 0, limit: 0 },
  uMode: 'components',
  U: 0,
  k: 2,
  dof: Infinity,
  components: [],
  k95Mode: 'k2',
  required: 4,
  refAccuracy: 0,
  eopr: 0.95,
  eoprType: 'true',
  guard: 'method6',
  r: 1,
  targetPfa: 0.02,
  measured: null,
  ...over,
});

export interface Example { key: string; label: string; blurb: string; make: () => PointState }

export const EXAMPLES: Example[] = [
  {
    key: 'dmm',
    label: '10 V DMM point',
    blurb: '6½-digit DMM, 10 V range, spec ±(0.0035 % rdg + 0.0005 % range), checked with a multifunction calibrator.',
    make: () =>
      base({
        title: 'DMM 10 V DC range @ 10 V',
        unit: 'V',
        tolerance: { kind: 'symmetric', nominal: 10, range: 10, spec: spec({ pctReading: 0.0035, pctRange: 0.0005 }), minus: 0, plus: 0, limit: 0 },
        components: [
          comp('Calibrator 10 V output (certificate U, k = 2)', 0.00009, 'normal', 2),
          comp('UUT resolution (½ of 10 µV digit)', 0.000005, 'rectangular'),
          comp('Repeatability (std dev of mean, 10 readings)', 0.000004, 'standard', 1, 9),
          comp('Thermal EMF / leads', 0.000003, 'rectangular'),
        ],
        refAccuracy: 0.00009,
      }),
  },
  {
    key: 'caliper',
    label: '150 mm caliper @ 100 mm',
    blurb: 'Digital caliper, resolution 0.01 mm, tolerance ±0.02 mm, checked on a 100 mm gauge block.',
    make: () =>
      base({
        title: 'Caliper 0–150 mm @ 100 mm',
        unit: 'mm',
        tolerance: { kind: 'symmetric', nominal: 100, range: 150, spec: spec({ absolute: 0.02 }), minus: 0, plus: 0, limit: 0 },
        components: [
          comp('Gauge block 100 mm (certificate U, k = 2)', 0.0001, 'normal', 2),
          comp('UUT resolution (½ of 0.01 mm)', 0.005, 'rectangular'),
          comp('Repeatability (std dev, single reading)', 0.003, 'standard', 1, 9),
          comp('Temperature difference block / caliper', 0.0012, 'rectangular'),
        ],
        refAccuracy: 0.0001,
      }),
  },
  {
    key: 'pressure',
    label: 'Pressure gauge 0–300 psi',
    blurb: 'Analog gauge, accuracy ±0.25 % of full scale, test point 150 psi, digital reference gauge.',
    make: () =>
      base({
        title: 'Pressure gauge 0–300 psi @ 150 psi',
        unit: 'psi',
        tolerance: { kind: 'symmetric', nominal: 150, range: 300, spec: spec({ pctRange: 0.25 }), minus: 0, plus: 0, limit: 0 },
        components: [
          comp('Reference gauge (certificate U, k = 2)', 0.03, 'normal', 2),
          comp('Reference stability between calibrations', 0.05, 'rectangular'),
          comp('UUT readability (1/5 of 1 psi division, ±0.1)', 0.1, 'rectangular'),
          comp('Repeatability / hysteresis (std dev)', 0.05, 'standard', 1, 5),
          comp('Head height correction residual', 0.02, 'rectangular'),
        ],
        refAccuracy: 0.075,
      }),
  },
  {
    key: 'onesided',
    label: 'One-sided: leak rate ≤ 1.0',
    blurb: 'Maximum-only limit (e.g. leak rate ≤ 1.0 sccm, expected 0.6), U = 0.08 sccm (k = 2).',
    make: () =>
      base({
        title: 'Leak rate ≤ 1.0 sccm',
        unit: 'sccm',
        tolerance: { kind: 'upper', nominal: 0.6, range: 0, spec: spec({}), minus: 0, plus: 0, limit: 1.0 },
        uMode: 'direct',
        U: 0.08,
        k: 2,
        components: [],
        refAccuracy: 0.05,
        guard: 'u95',
      }),
  },
];

export const defaultPoint = (): PointState => EXAMPLES[0].make();

const row = (label: string, nominal: number, range: number, s: Partial<Spec>, U: number, k = 2): TableRow => ({ id: uid('r'), label, nominal, range, spec: spec(s), U, k });

export interface TableExample { key: string; label: string; make: () => TableState }

export const TABLE_EXAMPLES: TableExample[] = [
  {
    key: 'pressure',
    label: 'Pressure gauge 0–300 psi (±0.25 % FS)',
    make: () => ({
      title: 'Pressure gauge 0–300 psi, ±0.25 % FS',
      unit: 'psi',
      k95Mode: 'k2',
      required: 4,
      eopr: 0.95,
      guard: 'method6',
      rows: [0, 60, 120, 180, 240, 300].map((p) => row(`${p} psi`, p, 300, { pctRange: 0.25 }, Number((0.12 + 0.0003 * p).toFixed(4)))),
    }),
  },
  {
    key: 'dmm',
    label: 'DMM 10 V range (±(0.0035 % rdg + 0.0005 % range))',
    make: () => ({
      title: 'DMM DC voltage, 10 V range',
      unit: 'V',
      k95Mode: 'k2',
      required: 4,
      eopr: 0.95,
      guard: 'method6',
      rows: [
        row('+1 V', 1, 10, { pctReading: 0.0035, pctRange: 0.0005 }, 0.000016),
        row('+5 V', 5, 10, { pctReading: 0.0035, pctRange: 0.0005 }, 0.000048),
        row('+10 V', 10, 10, { pctReading: 0.0035, pctRange: 0.0005 }, 0.000091),
        row('−10 V', -10, 10, { pctReading: 0.0035, pctRange: 0.0005 }, 0.000091),
      ],
    }),
  },
];

export const defaultTable = (): TableState => TABLE_EXAMPLES[0].make();
export const newRow = (unit = ''): TableRow => row(`Point ${unit}`.trim(), 0, 0, {}, 0);
