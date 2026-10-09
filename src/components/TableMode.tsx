import { NumberField, SelectField, TextField, Explain } from './inputs';
import { computeRow, GUARD_INFO, TABLE_GUARDS } from '../lib/compute';
import { TABLE_EXAMPLES, newRow, uid, type TableRow, type TableState } from '../lib/model';
import { fmt, fmtPct, fmtRatio, type Spec } from '../lib/tur';
import { K95_OPTS } from './PointCalc';
import { tableToCSV } from '../lib/report';
import { downloadFile, safeFileName } from '../store';

type Upd = (fn: (t: TableState) => TableState) => void;

function Cell({ v, on, w = 'num', label }: { v: number; on: (n: number) => void; w?: string; label: string }) {
  return <td className={`w-${w}`}><NumberField label="" value={v} onChange={(n) => on(n ?? 0)} placeholder={label} /></td>;
}

export function TableMode({ t, update, goReport }: { t: TableState; update: Upd; goReport: () => void }) {
  const setRow = (id: string, p: Partial<TableRow>) => update((x) => ({ ...x, rows: x.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  const setSpec = (r: TableRow, p: Partial<Spec>) => setRow(r.id, { spec: { ...r.spec, ...p } });
  const results = t.rows.map((r) => computeRow(r, t));
  const nFail = results.filter((r) => !r.errors.length && !r.pass).length;
  return (
    <div className="stack">
      <div className="card">
        <h3>Multi-point TUR table</h3>
        <p className="muted small">One row per test point. Tolerance = |nominal|·(% rdg + ppm rdg) + range·(% range) + counts × resolution + fixed. U and k as stated in your budget/certificate for that point. Symmetric ± tolerances only (use the single-point calculator for asymmetric or one-sided limits).</p>
        <div className="chips">
          {TABLE_EXAMPLES.map((e) => <button key={e.key} className="chip" onClick={() => update(() => e.make())} data-testid={`tex-${e.key}`}>Load: {e.label}</button>)}
          <button className="chip ghost" onClick={() => update((x) => ({ ...x, title: 'New table', rows: [newRow()] }))}>Clear table</button>
        </div>
        <div className="grid4">
          <TextField label="Title" value={t.title} onChange={(v) => update((x) => ({ ...x, title: v }))} />
          <TextField label="Unit" value={t.unit} onChange={(v) => update((x) => ({ ...x, unit: v }))} />
          <NumberField label="Required ratio (N:1)" value={t.required} onChange={(v) => update((x) => ({ ...x, required: v ?? 4 }))} />
          <SelectField label="Convert to U95 with" value={t.k95Mode === 't95' ? 'k2' : t.k95Mode} options={K95_OPTS.filter((o) => o.value !== 't95')} onChange={(v) => update((x) => ({ ...x, k95Mode: v }))} />
          <NumberField label="EOPR for PFA" value={Number((t.eopr * 100).toPrecision(10))} onChange={(v) => update((x) => ({ ...x, eopr: (v ?? 95) / 100 }))} suffix="%" />
          <SelectField label="Guard band" value={t.guard} options={TABLE_GUARDS.map((g) => ({ value: g, label: GUARD_INFO[g].label }))} onChange={(v) => update((x) => ({ ...x, guard: v }))} />
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="budget points" data-testid="points-table">
            <thead>
              <tr>
                <th>Point</th><th>Nominal</th><th>Range/FS</th><th>% rdg</th><th>% range</th><th>ppm rdg</th><th>Counts</th><th>1 count =</th><th>Fixed ±</th><th>U</th><th>k</th>
                <th className="n">Tol ±</th><th className="n">U95</th><th className="n">TUR</th><th>Result</th><th className="n">Acceptance limits</th><th className="n">PFA</th><th className="n">PFA (GB)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => {
                const c = results[i];
                return (
                  <tr key={r.id} className={c.errors.length ? 'row-bad' : c.pass ? '' : 'row-fail'}>
                    <td className="w-label"><input value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} aria-label="Point label" /></td>
                    <Cell v={r.nominal} on={(n) => setRow(r.id, { nominal: n })} label="nominal" />
                    <Cell v={r.range} on={(n) => setRow(r.id, { range: n })} label="range" />
                    <Cell v={r.spec.pctReading} on={(n) => setSpec(r, { pctReading: n })} w="k" label="%rdg" />
                    <Cell v={r.spec.pctRange} on={(n) => setSpec(r, { pctRange: n })} w="k" label="%rng" />
                    <Cell v={r.spec.ppmReading} on={(n) => setSpec(r, { ppmReading: n })} w="k" label="ppm" />
                    <Cell v={r.spec.counts} on={(n) => setSpec(r, { counts: n })} w="k" label="cts" />
                    <Cell v={r.spec.resolution} on={(n) => setSpec(r, { resolution: n })} label="res" />
                    <Cell v={r.spec.absolute} on={(n) => setSpec(r, { absolute: n })} label="fixed" />
                    <Cell v={r.U} on={(n) => setRow(r.id, { U: n })} label="U" />
                    <Cell v={r.k} on={(n) => setRow(r.id, { k: n })} w="k" label="k" />
                    <td className="n">{c.tol > 0 ? fmt(c.tol, 4) : '—'}</td>
                    <td className="n">{c.U95 > 0 ? fmt(c.U95, 3) : '—'}</td>
                    <td className="n"><b>{c.errors.length ? '—' : fmtRatio(c.tur)}</b></td>
                    <td>{c.errors.length ? <span className="err small">{c.errors[0]}</span> : <span className={`pill ${c.pass ? 'ok' : 'bad'}`}>{c.pass ? 'Meets' : 'Below'}</span>}</td>
                    <td className="n small">{!c.errors.length && c.guardValid ? `${fmt(c.accLower, 7)} … ${fmt(c.accUpper, 7)}` : 'n/a'}</td>
                    <td className="n">{c.pfa !== undefined ? fmtPct(c.pfa, 2) : ''}</td>
                    <td className="n">{c.pfaGuarded !== undefined ? fmtPct(c.pfaGuarded, 2) : ''}</td>
                    <td className="nowrap">
                      <button className="btn small" aria-label="Duplicate" title="Duplicate row" onClick={() => update((x) => { const rows = [...x.rows]; rows.splice(i + 1, 0, { ...r, id: uid('r'), label: `${r.label} (copy)` }); return { ...x, rows }; })}>⧉</button>
                      <button className="btn small danger" aria-label="Remove" title="Remove row" onClick={() => update((x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) }))}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => update((x) => ({ ...x, rows: [...x.rows, x.rows.length ? { ...x.rows[x.rows.length - 1], id: uid('r'), label: `Point ${x.rows.length + 1}` } : newRow()] }))} data-testid="add-row">+ Add test point</button>
          <button className="btn" onClick={() => downloadFile(`${safeFileName(t.title)}_TUR.csv`, tableToCSV(t), 'text/csv;charset=utf-8')} data-testid="csv">Download CSV</button>
          <button className="btn primary" onClick={goReport}>Printable report</button>
        </div>
        {nFail ? <Explain tone="warn" title={`${nFail} point${nFail > 1 ? 's' : ''} below ${t.required}:1`}>Apply the guard band shown (acceptance limits column), reduce the uncertainty at those points, or show PFA ≤ 2 % with a credible EOPR; agree the decision rule with the customer (ISO/IEC 17025 7.1.3) and report it (7.8.6). See How-to → "TUR below 4:1".</Explain> : <Explain tone="ok">All points meet {t.required}:1.</Explain>}
      </div>
    </div>
  );
}
