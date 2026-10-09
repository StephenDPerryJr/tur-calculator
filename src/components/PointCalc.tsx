import { Explain, NumberField, SelectField, TextField } from './inputs';
import { DIST_INFO, K95_INFO, fmt, fmtRatio, specAt, type Dist, type K95Mode, type Spec, type ToleranceKind, type UComponent } from '../lib/tur';
import { EXAMPLES, uid, type PointState } from '../lib/model';
import type { PointResult } from '../lib/compute';
import { WHEN_LOW } from '../lib/guidance';
import { fmtPct } from '../lib/tur';

type Upd = (fn: (s: PointState) => PointState) => void;

const KIND_OPTS: Array<{ value: ToleranceKind; label: string }> = [
  { value: 'symmetric', label: 'Symmetric ± (from spec: % rdg, % range, ppm, counts, fixed)' },
  { value: 'asymmetric', label: 'Asymmetric (−a / +b)' },
  { value: 'upper', label: 'One-sided: maximum only (≤ limit)' },
  { value: 'lower', label: 'One-sided: minimum only (≥ limit)' },
];

const DIST_OPTS = (Object.keys(DIST_INFO) as Dist[]).map((d) => ({ value: d, label: `${DIST_INFO[d].label.split(' (')[0]} ${DIST_INFO[d].divisorText}` }));
export const K95_OPTS = (Object.keys(K95_INFO) as K95Mode[]).map((k) => ({ value: k, label: K95_INFO[k] }));

const PRESETS: Array<{ label: string; make: () => Omit<UComponent, 'id'> }> = [
  { label: '+ Reference certificate (U, k)', make: () => ({ name: 'Reference standard (certificate U)', value: 0, dist: 'normal', k: 2, dof: Infinity }) },
  { label: '+ Reference spec / drift (±a)', make: () => ({ name: 'Reference spec / stability (±a)', value: 0, dist: 'rectangular', k: 2, dof: Infinity }) },
  { label: '+ UUT resolution (½ digit)', make: () => ({ name: 'UUT resolution (½ least significant digit)', value: 0, dist: 'rectangular', k: 2, dof: Infinity }) },
  { label: '+ Repeatability (s)', make: () => ({ name: 'Repeatability (standard deviation)', value: 0, dist: 'standard', k: 1, dof: 9 }) },
  { label: '+ Environment (±a)', make: () => ({ name: 'Temperature / environment (±a)', value: 0, dist: 'rectangular', k: 2, dof: Infinity }) },
  { label: '+ Cycling effect (U-shaped)', make: () => ({ name: 'Cycling effect (±a)', value: 0, dist: 'ushaped', k: 2, dof: Infinity }) },
];

export function PointCalc({ s, r, update, goRisk }: { s: PointState; r: PointResult; update: Upd; goRisk: () => void }) {
  const t = s.tolerance;
  const setTol = (p: Partial<PointState['tolerance']>) => update((x) => ({ ...x, tolerance: { ...x.tolerance, ...p } }));
  const setSpec = (p: Partial<Spec>) => setTol({ spec: { ...t.spec, ...p } });
  const b = specAt(t.spec, t.nominal, t.range);
  const unit = s.unit;
  const setComp = (id: string, p: Partial<UComponent>) => update((x) => ({ ...x, components: x.components.map((c) => (c.id === id ? { ...c, ...p } : c)) }));

  return (
    <div className="stack">
      <div className="card">
        <h3>Start from a worked example (or edit the fields below)</h3>
        <div className="chips">
          {EXAMPLES.map((e) => (
            <button key={e.key} className="chip" title={e.blurb} onClick={() => update(() => e.make())} data-testid={`ex-${e.key}`}>{e.label}</button>
          ))}
        </div>
      </div>

      <div className="calc-cols">
        <div className="stack">
          <div className="card">
            <h3><span className="stepnum">1</span> Test point and UUT tolerance</h3>
            <p className="muted small">From the UUT specification sheet (accuracy table for this function, range and calibration interval) or the customer's tolerance.</p>
            <div className="grid2">
              <TextField label="Description" value={s.title} onChange={(v) => update((x) => ({ ...x, title: v }))} />
              <TextField label="Unit" value={s.unit} onChange={(v) => update((x) => ({ ...x, unit: v }))} />
            </div>
            <SelectField label="Tolerance type" value={t.kind} options={KIND_OPTS} onChange={(v) => setTol({ kind: v })} testId="tol-kind" />
            {t.kind === 'symmetric' && (
              <>
                <div className="grid2">
                  <NumberField label="Nominal / test point" value={t.nominal} onChange={(v) => setTol({ nominal: v ?? 0 })} suffix={unit} testId="nominal" />
                  <NumberField label="Range / full scale" value={t.range} onChange={(v) => setTol({ range: v ?? 0 })} suffix={unit} hint="Used by % range / ppm range terms" testId="range" />
                </div>
                <h4>Specification ± ( … ) — fill in only the terms your spec has</h4>
                <div className="grid4">
                  <NumberField label="% of reading" value={t.spec.pctReading} onChange={(v) => setSpec({ pctReading: v ?? 0 })} suffix="%" testId="pct-rdg" />
                  <NumberField label="% of range / FS" value={t.spec.pctRange} onChange={(v) => setSpec({ pctRange: v ?? 0 })} suffix="%" testId="pct-range" />
                  <NumberField label="ppm of reading" value={t.spec.ppmReading} onChange={(v) => setSpec({ ppmReading: v ?? 0 })} suffix="ppm" />
                  <NumberField label="ppm of range" value={t.spec.ppmRange} onChange={(v) => setSpec({ ppmRange: v ?? 0 })} suffix="ppm" />
                  <NumberField label="Counts / digits" value={t.spec.counts} onChange={(v) => setSpec({ counts: v ?? 0 })} />
                  <NumberField label="Value of 1 count" value={t.spec.resolution} onChange={(v) => setSpec({ resolution: v ?? 0 })} suffix={unit} hint="Least significant digit on this range" />
                  <NumberField label="Fixed ± (absolute)" value={t.spec.absolute} onChange={(v) => setSpec({ absolute: v ?? 0 })} suffix={unit} testId="abs" />
                </div>
                <div className="calc-strip" data-testid="tol-breakdown">
                  <span>% / ppm rdg: <b>{fmt(b.reading)}</b></span>
                  <span>% / ppm range: <b>{fmt(b.range)}</b></span>
                  <span>counts: <b>{fmt(b.counts)}</b></span>
                  <span>fixed: <b>{fmt(b.absolute)}</b></span>
                  <span>Tolerance: <b>± {fmt(b.total, 5)} {unit}</b></span>
                </div>
              </>
            )}
            {t.kind === 'asymmetric' && (
              <>
                <div className="grid3">
                  <NumberField label="Nominal / test point" value={t.nominal} onChange={(v) => setTol({ nominal: v ?? 0 })} suffix={unit} />
                  <NumberField label="Allowed below nominal (−a)" value={t.minus} onChange={(v) => setTol({ minus: Math.abs(v ?? 0) })} suffix={unit} />
                  <NumberField label="Allowed above nominal (+b)" value={t.plus} onChange={(v) => setTol({ plus: Math.abs(v ?? 0) })} suffix={unit} />
                </div>
                <Explain title="Asymmetric tolerances">Z540.3 defines TUR with the tolerance <b>span</b> (upper − lower limit), so TUR = (a + b) / (2·U95) still applies. Because the nearer limit is what drives risk, the app also shows the <b>near-side ratio</b> min(a, b) / U95 and the risk tab centres the UUT population on the nominal.</Explain>
              </>
            )}
            {(t.kind === 'upper' || t.kind === 'lower') && (
              <>
                <div className="grid2">
                  <NumberField label="Nominal / expected value" value={t.nominal} onChange={(v) => setTol({ nominal: v ?? 0 })} suffix={unit} hint="Target, typical or mean of repeated measurements" />
                  <NumberField label={t.kind === 'upper' ? 'Maximum limit' : 'Minimum limit'} value={t.limit} onChange={(v) => setTol({ limit: v ?? 0 })} suffix={unit} />
                </div>
                <Explain tone="warn" title="One-sided limits">Z540.3 3.11 notes that TUR applies to two-sided tolerances; there is no official one-sided TUR. The app shows the commonly used practical ratio <b>|limit − nominal| / U95</b>, labelled as such. For the decision, use a guard band of U95 (ILAC G8 w = U; the only option when nothing is known about the population) or compute the risk with an EOPR on the Risk tab.</Explain>
              </>
            )}
            {r.limits.errors.length ? <p className="err small">{r.limits.errors.join(' ')}</p> : <p className="small">Limits: <b>{fmt(r.limits.lower, 7)}</b> … <b>{fmt(r.limits.upper, 7)}</b> {unit}{Number.isFinite(r.limits.span) ? <> · span {fmt(r.limits.span, 5)} {unit}</> : null}</p>}
          </div>

          <div className="card">
            <h3><span className="stepnum">2</span> Measurement process uncertainty (U95)</h3>
            <p className="muted small">From your uncertainty budget for this procedure and point. Include the reference standard, UUT resolution and repeatability, environment and method — but <b>not</b> the UUT's own accuracy spec or drift (that is the tolerance).</p>
            <div className="seg" role="radiogroup">
              <button className={s.uMode === 'direct' ? 'on' : ''} onClick={() => update((x) => ({ ...x, uMode: 'direct' }))} data-testid="mode-direct">Enter U and k</button>
              <button className={s.uMode === 'components' ? 'on' : ''} onClick={() => update((x) => ({ ...x, uMode: 'components' }))} data-testid="mode-components">Build from components</button>
            </div>
            {s.uMode === 'direct' ? (
              <div className="grid3">
                <NumberField label="Expanded uncertainty U" value={s.U} onChange={(v) => update((x) => ({ ...x, U: v ?? 0 }))} suffix={unit} testId="U" />
                <NumberField label="Coverage factor k (as stated)" value={s.k} onChange={(v) => update((x) => ({ ...x, k: v ?? 0 }))} testId="k" />
                <NumberField label="νeff (optional)" value={s.dof} onChange={(v) => update((x) => ({ ...x, dof: v ?? Infinity }))} allowEmpty hint="Only used for the t95 option; 'inf' if unknown" />
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="comp-table">
                    <thead><tr><th>Component</th><th>Value</th><th>Distribution</th><th>k</th><th>ν</th><th className="n">u</th><th>Share</th><th></th></tr></thead>
                    <tbody>
                      {s.components.map((c, i) => {
                        const cr = r.unc.components[i];
                        return (
                          <tr key={c.id}>
                            <td><input value={c.name} onChange={(e) => setComp(c.id, { name: e.target.value })} aria-label="Component name" /></td>
                            <td className="w-num"><NumberField label="" value={c.value} onChange={(v) => setComp(c.id, { value: v ?? 0 })} /></td>
                            <td><select value={c.dist} onChange={(e) => setComp(c.id, { dist: e.target.value as Dist })} aria-label="Distribution">{DIST_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                            <td className="w-k">{c.dist === 'normal' ? <NumberField label="" value={c.k} onChange={(v) => setComp(c.id, { k: v ?? 0 })} /> : <span className="muted">—</span>}</td>
                            <td className="w-k"><NumberField label="" value={c.dof} onChange={(v) => setComp(c.id, { dof: v ?? Infinity })} allowEmpty /></td>
                            <td className="n">{cr ? fmt(cr.u, 3) : ''}</td>
                            <td><div className="bar" title={cr ? `${(cr.share * 100).toFixed(1)} %` : ''}><div style={{ width: `${cr ? cr.share * 100 : 0}%` }} /></div><span className="small muted">{cr ? `${(cr.share * 100).toFixed(0)} %` : ''}</span></td>
                            <td><button className="btn small danger" aria-label="Remove" onClick={() => update((x) => ({ ...x, components: x.components.filter((y) => y.id !== c.id) }))}>×</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="chips" style={{ marginTop: 8 }}>
                  {PRESETS.map((p) => (
                    <button key={p.label} className="chip" onClick={() => update((x) => ({ ...x, components: [...x.components, { id: uid('c'), ...p.make() }] }))}>{p.label}</button>
                  ))}
                </div>
                <p className="hint">Value = U for "Normal", half-width ±a for rectangular / triangular / U-shaped, u for "Standard". All in {unit || 'the measurand unit'} (sensitivity coefficient 1). Use ν (degrees of freedom) for Type A data; leave 'inf' otherwise.</p>
              </>
            )}
            <SelectField label="Convert to U95 with" value={s.k95Mode} options={K95_OPTS} onChange={(v) => update((x) => ({ ...x, k95Mode: v }))} testId="k95" />
            <div className="calc-strip">
              <span>uc = <b>{fmt(r.unc.uc, 4)}</b> {unit}</span>
              {s.uMode === 'components' || s.k95Mode === 't95' ? <span>νeff = <b>{Number.isFinite(r.unc.veff) ? r.unc.veff.toFixed(1) : '∞'}</b></span> : null}
              <span>k95 = <b>{r.unc.k95.toFixed(3)}</b></span>
              <span>U95 = <b data-testid="U95">{fmt(r.unc.U95, 4)}</b> {unit}</span>
            </div>
            {r.unc.errors.length ? <p className="err small">{r.unc.errors.join(' ')}</p> : null}
          </div>
        </div>

        <div className="stack">
          <ResultCard s={s} r={r} update={update} goRisk={goRisk} />
        </div>
      </div>
    </div>
  );
}

function ResultCard({ s, r, update, goRisk }: { s: PointState; r: PointResult; update: Upd; goRisk: () => void }) {
  const unit = s.unit;
  const tur = r.tur;
  return (
    <>
      <div className={`card result ${tur ? (tur.pass ? 'pass' : 'fail') : ''}`} data-testid="result">
        <h3><span className="stepnum">3</span> Result</h3>
        {!tur ? (
          <p className="err">{r.errors.join(' ') || 'Enter a tolerance and an uncertainty.'}</p>
        ) : (
          <>
            <div className="big-ratio">
              <span className="lbl">{tur.method === 'z540' ? 'TUR (Z540.3)' : 'One-sided ratio'}</span>
              <b data-testid="tur">{fmtRatio(tur.tur)}</b>
              <span className={`pill ${tur.pass ? 'ok' : 'bad'}`} data-testid="verdict">{tur.pass ? `PASS ≥ ${s.required}:1` : `BELOW ${s.required}:1`}</span>
            </div>
            <div className="formula mono">
              {tur.method === 'z540' ? (
                <>TUR = (UL − LL) / (2 × U95) = ({fmt(r.limits.upper, 7)} − {fmt(r.limits.lower, 7)}) / (2 × {fmt(r.unc.U95, 4)}) = {fmt(r.limits.span, 5)} / {fmt(2 * r.unc.U95, 4)} = <b>{tur.tur.toFixed(3)}</b></>
              ) : (
                <>ratio = |limit − nominal| / U95 = {fmt(r.limits.halfWidth, 5)} / {fmt(r.unc.U95, 4)} = <b>{tur.tur.toFixed(3)}</b></>
              )}
            </div>
            {tur.nearSideRatio !== undefined ? <p className="small">Near-side ratio (nearer limit / U95): <b>{fmtRatio(tur.nearSideRatio)}</b></p> : null}
            <p className="small muted">{tur.note}</p>
            <div className="grid2 tight">
              <NumberField label="Required ratio (N:1)" value={s.required} onChange={(v) => update((x) => ({ ...x, required: v ?? 4 }))} hint="4:1 per Z540.3 5.3 b; some programs use 3:1 or 10:1" testId="required" />
            </div>
          </>
        )}
      </div>

      {tur && (
        <div className="card">
          <h3>Legacy TAR comparison</h3>
          <NumberField label="Reference standard accuracy (±)" value={s.refAccuracy} onChange={(v) => update((x) => ({ ...x, refAccuracy: v ?? 0 }))} suffix={unit} hint="Accuracy spec or certificate U of the reference alone" testId="ref-acc" />
          {r.tar !== undefined ? (
            <p>TAR = {fmt(r.limits.halfWidth, 4)} / {fmt(s.refAccuracy, 4)} = <b data-testid="tar">{fmtRatio(r.tar)}</b> &nbsp; vs &nbsp; TUR <b>{fmtRatio(tur.tur)}</b></p>
          ) : null}
          <Explain tone={r.tar !== undefined && r.tar > 1.5 * tur.tur ? 'warn' : 'info'} title="Why TUR, not TAR">
            TAR compares the tolerance with the reference standard's accuracy only. TUR uses the uncertainty of the <i>whole measurement process</i> — reference, UUT resolution and repeatability, environment, method — which is what actually limits how well you can tell good units from bad ones. TAR is deprecated: Z540.3 (2006) defines TUR, and ISO/IEC 17025 requires decision rules based on measurement uncertainty.
            {r.tar !== undefined && r.tar > 1.5 * tur.tur ? <p><b>Here the TAR overstates the ratio by {(r.tar / tur.tur).toFixed(1)}×.</b></p> : null}
          </Explain>
        </div>
      )}

      {tur && (
        <div className="card">
          <h3>Risk at a glance</h3>
          {r.noGuard ? (
            <div className="outs">
              <div className="out"><span>PFA, no guard band</span><b data-testid="pfa">{fmtPct(r.noGuard.pfa)}</b></div>
              <div className="out"><span>PFR, no guard band</span><b>{fmtPct(r.noGuard.pfr)}</b></div>
              {r.worst ? <div className="out"><span>Worst-case PFA (any EOPR)</span><b>{fmtPct(r.worst.pfa)}</b></div> : null}
              {r.selected?.valid ? <div className="out"><span>{r.selected.method === 'none' ? 'Acceptance limits' : 'Acceptance limits (guarded)'}</span><b>{fmt(r.selected.accLower, 6)} … {fmt(r.selected.accUpper, 6)}</b></div> : null}
            </div>
          ) : <p className="muted">Enter an EOPR on the Risk tab to estimate PFA.</p>}
          <p className="small muted">At EOPR {(s.eopr * 100).toFixed(1)} % ({s.eoprType}). Z540.3 5.3 b: PFA ≤ 2 %, or TUR ≥ 4:1 where PFA estimation is not practicable.</p>
          <button className="btn" onClick={goRisk}>Open risk &amp; guard band calculator →</button>
        </div>
      )}

      {tur && !tur.pass && (
        <div className="card">
          <h3>TUR below {s.required}:1 — what to do</h3>
          <ol className="todo">
            {WHEN_LOW.map((w) => <li key={w.title}><b>{w.title.replace(/^\d+\.\s*/, '')}</b> — {w.body}</li>)}
          </ol>
        </div>
      )}
    </>
  );
}
