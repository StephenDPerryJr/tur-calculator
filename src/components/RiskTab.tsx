import { useMemo, useState } from 'react';
import { Explain, NumberField, SelectField } from './inputs';
import { GUARD_INFO, method6M, riskFromTur, worstCasePfa, type GuardMethod } from '../lib/risk';
import { fmt, fmtPct, fmtRatio, type K95Mode } from '../lib/tur';
import { normCdf, normInv } from '../lib/stats';
import type { PointState } from '../lib/model';
import type { PointResult } from '../lib/compute';
import { K95_OPTS } from './PointCalc';

type Upd = (fn: (s: PointState) => PointState) => void;
const GUARD_OPTS = (Object.keys(GUARD_INFO) as GuardMethod[]).map((g) => ({ value: g, label: GUARD_INFO[g].label }));

export function RiskTab({ s, r, update }: { s: PointState; r: PointResult; update: Upd }) {
  const unit = s.unit;
  const twoSided = r.limits.kind === 'symmetric' || r.limits.kind === 'asymmetric';
  return (
    <div className="stack">
      <div className="card">
        <h3>Measurement decision risk for the current test point</h3>
        <p className="muted small">{s.title} · limits {fmt(r.limits.lower, 7)} … {fmt(r.limits.upper, 7)} {unit} · U95 {fmt(r.unc.U95, 4)} {unit} · {r.tur ? `${r.tur.method === 'z540' ? 'TUR' : 'one-sided ratio'} ${fmtRatio(r.tur.tur)}` : 'incomplete'}</p>
        <div className="grid4">
          <NumberField label="In-tolerance probability / EOPR" value={Number((s.eopr * 100).toPrecision(10))} onChange={(v) => update((x) => ({ ...x, eopr: (v ?? 95) / 100 }))} suffix="%" testId="eopr" hint="As-received in-tolerance rate" />
          <SelectField label="EOPR is…" value={s.eoprType} options={[{ value: 'true', label: 'True (model value)' }, { value: 'observed', label: 'Observed (from cal records)' }]} onChange={(v) => update((x) => ({ ...x, eoprType: v }))} />
          <SelectField label="Decision rule / guard band" value={s.guard} options={GUARD_OPTS} onChange={(v) => update((x) => ({ ...x, guard: v }))} testId="guard" />
          {s.guard === 'multiple' ? <NumberField label="Multiple r (w = r·U95)" value={s.r} onChange={(v) => update((x) => ({ ...x, r: v ?? 1 }))} /> : null}
          {s.guard === 'target' ? <NumberField label="Target PFA" value={Number((s.targetPfa * 100).toPrecision(10))} onChange={(v) => update((x) => ({ ...x, targetPfa: (v ?? 2) / 100 }))} suffix="%" /> : null}
        </div>
        {r.eoprTrue !== undefined && s.eoprType === 'observed' ? <p className="small">Observed {(s.eopr * 100).toFixed(2)} % → true EOPR <b>{(r.eoprTrue * 100).toFixed(2)} %</b> (σ²true = σ²observed − u², Mimbs 2011).</p> : null}
        {r.errors.length ? <p className="err">{r.errors.join(' ')}</p> : null}
        {r.noGuard ? (
          <>
            <div className="outs">
              <div className="out"><span>PFA, no guard band</span><b>{fmtPct(r.noGuard.pfa)}</b></div>
              <div className="out"><span>PFR, no guard band</span><b>{fmtPct(r.noGuard.pfr)}</b></div>
              {r.worst ? <div className="out"><span>Worst-case PFA over any EOPR</span><b>{fmtPct(r.worst.pfa)}</b><small>at EOPR {(r.worst.eopr * 100).toFixed(1)} %</small></div> : null}
              <div className={`out ${r.noGuard.pfa <= 0.02 ? 'good' : 'badbg'}`}><span>Z540.3 5.3 (PFA ≤ 2 %)</span><b>{r.noGuard.pfa <= 0.02 ? 'met without guard band' : 'NOT met – guard band'}</b></div>
            </div>
            <h4>Guard-band methods compared</h4>
            <div className="table-wrap">
              <table className="budget" data-testid="guard-table">
                <thead><tr><th>Method</th><th>Formula</th><th className="n">Guard band w</th><th className="n">Acceptance limits</th><th className="n">PFA</th><th className="n">PFR</th><th className="n">Accepted that are bad</th><th>Reference</th></tr></thead>
                <tbody>
                  {r.guards.map((g) => (
                    <tr key={g.method} className={g.method === s.guard ? 'sel' : ''} onClick={() => update((x) => ({ ...x, guard: g.method }))}>
                      <td><b>{GUARD_INFO[g.method].label}</b>{g.note ? <div className="small muted">{g.note}</div> : null}{g.M !== undefined ? <div className="small muted">M = {g.M.toFixed(4)}</div> : null}</td>
                      <td className="mono small">{GUARD_INFO[g.method].formula.replace('r·', `${s.r}·`)}</td>
                      <td className="n">{Number.isFinite(g.w) ? fmt(g.w, 4) : '—'}</td>
                      <td className="n">{g.valid ? `${fmt(g.accLower, 7)} … ${fmt(g.accUpper, 7)}` : 'n/a'}</td>
                      <td className={`n ${g.risk && g.risk.pfa > 0.02 ? 'err' : ''}`}>{g.risk ? fmtPct(g.risk.pfa) : '—'}</td>
                      <td className="n">{g.risk ? fmtPct(g.risk.pfr) : '—'}</td>
                      <td className="n">{g.risk ? fmtPct(g.risk.cfa) : '—'}</td>
                      <td className="small">{GUARD_INFO[g.method].reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.selected ? <Explain title={GUARD_INFO[r.selected.method].label}>{GUARD_INFO[r.selected.method].note}</Explain> : null}
            {!twoSided ? <Explain tone="warn" title="One-sided limit">Method 6 and RSS were derived for two-sided symmetric tolerances; they are shown for reference only. Prefer w = U95 or a target-PFA guard band with a credible EOPR.</Explain> : null}
            {r.limits.kind === 'asymmetric' ? <Explain tone="warn" title="Asymmetric tolerance">TUR-based guard bands (Method 6, RSS) use the span-based TUR and apply the same w to both limits. The risk figures here are computed exactly for the asymmetric limits, with the UUT population centred on the nominal.</Explain> : null}
          </>
        ) : null}
      </div>

      <div className="calc-cols">
        <SpecificRisk s={s} r={r} update={update} />
        <PfaCurve s={s} r={r} />
      </div>
      <QuickPfa />
      <div className="card">
        <h3>How these numbers are computed</h3>
        <ul className="small">
          <li><b>Model</b> (Z540.3 Handbook Method 1; JCGM 106 9.5 eqs. 17–19; NASA-HDBK-8739.19-4 "UFAR"): true UUT values are normal, centred on nominal, with the spread that gives the stated in-tolerance probability; measurement errors are normal with standard uncertainty u = U95 / k95. PFA = P(out of tolerance and accepted), PFR = P(in tolerance and rejected), computed by adaptive Gauss–Kronrod integration (no tables, no Monte Carlo).</li>
          <li><b>Verified</b> against Keysight/Dobbert Table 2 (worst-case PFA at 17 TURs, to 3 decimals), NASA-HDBK-8739.19-4 Table 5-1 (1 % PFA guard bands and PFR) and Table 5-2 (PFR), Mimbs 2011 (4.6:1 → 2 %, observed vs true EOPR) and ILAC G8 Table 1 (specific risks). See the test suite in the repository.</li>
          <li><b>Assumptions</b>: normal distributions, no measurement bias, UUT population centred on nominal. Real populations can be skewed or biased; then the risk can differ (Sandia SAND2021-8069; Delker 2020).</li>
          <li>Published risk curves use U95 = 1.96 u; Z540.3/ILAC practice uses k = 2. Choose under "Convert to U95 with" on the calculator tab.</li>
        </ul>
      </div>
    </div>
  );
}

function SpecificRisk({ s, r, update }: { s: PointState; r: PointResult; update: Upd }) {
  return (
    <div className="card">
      <h3>Specific risk for one reading</h3>
      <p className="muted small">Probability that <i>this</i> item is out of tolerance, given its measured value and the process uncertainty (normal, no prior information – JCGM 106 7.3–7.4, ILAC G8 Table 1).</p>
      <NumberField label="Measured value" value={s.measured} onChange={(v) => update((x) => ({ ...x, measured: v }))} allowEmpty suffix={s.unit} placeholder={`e.g. ${fmt(r.limits.nominal, 6)}`} testId="measured" />
      {r.specific !== undefined ? (
        <div className="outs">
          <div className="out"><span>P(out of tolerance)</span><b data-testid="specific">{fmtPct(r.specific)}</b></div>
          <div className="out"><span>Conformance probability</span><b>{fmtPct(1 - r.specific)}</b></div>
          {r.selected?.valid && s.measured !== null ? <div className="out"><span>Decision ({GUARD_INFO[r.selected.method].label.split(' (')[0]})</span><b>{s.measured >= r.selected.accLower && s.measured <= r.selected.accUpper ? 'ACCEPT' : 'REJECT'}</b></div> : null}
        </div>
      ) : null}
      <table className="mini" style={{ marginTop: 8 }}>
        <thead><tr><th>ILAC G8 Table 1 rule</th><th>w</th><th>Specific PFA at A</th></tr></thead>
        <tbody>
          {[['6 sigma', 3], ['3 sigma', 1.5], ['ILAC G8:2009 rule', 1], ['ISO 14253-1:2017', 0.83], ['Simple acceptance', 0]].map(([n, k]) => (
            <tr key={n as string}><td>{n}</td><td>{k}U</td><td>{fmtPct(1 - normCdf(2 * (k as number)), 3)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Computed for U = 2u: risk = 1 − Φ(2r). Matches ILAC G8's bounds (&lt; 1 ppm, &lt; 0.16 %, &lt; 2.5 %, &lt; 5 %, 50 %).</p>
    </div>
  );
}


function PfaCurve({ s, r }: { s: PointState; r: PointResult }) {
  const tur = r.tur?.tur;
  const k95 = r.unc.k95;
  const sel = r.selected;
  const wFrac = sel && sel.valid && r.limits.halfWidth > 0 ? sel.w / r.limits.halfWidth : 0;
  const data = useMemo(() => {
    if (!tur || !(tur > 0) || !(r.limits.kind === 'symmetric' || r.limits.kind === 'asymmetric')) return null;
    const pts: Array<[number, number, number]> = [];
    for (let i = 1; i <= 50; i++) {
      const R = 0.5 + (0.499 * i) / 50;
      pts.push([R, riskFromTur(tur, R, k95, 0).pfa, riskFromTur(tur, R, k95, wFrac).pfa]);
    }
    return pts;
  }, [tur, k95, wFrac, r.limits.kind]);
  if (!data) return <div className="card"><h3>PFA vs EOPR</h3><p className="muted">Available for two-sided tolerances.</p></div>;
  const W = 420, H = 220, P = 36;
  const ymax = Math.max(0.03, ...data.map((d) => d[1])) * 1.1;
  const x = (R: number) => P + ((R - 0.5) / 0.5) * (W - P - 10);
  const y = (p: number) => H - P + 4 - (p / ymax) * (H - P - 10);
  const line = (j: 1 | 2) => data.map((d, i) => `${i ? 'L' : 'M'}${x(d[0]).toFixed(1)},${y(d[j]).toFixed(1)}`).join(' ');
  return (
    <div className="card">
      <h3>PFA vs EOPR at TUR {fmtRatio(tur!)}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="PFA versus EOPR">
        <line x1={P} y1={y(0)} x2={W - 10} y2={y(0)} stroke="#94a3b8" />
        <line x1={P} y1={y(0)} x2={P} y2={8} stroke="#94a3b8" />
        <line x1={P} y1={y(0.02)} x2={W - 10} y2={y(0.02)} stroke="#b42318" strokeDasharray="4 3" />
        <text x={W - 12} y={y(0.02) - 4} textAnchor="end" fontSize="10" fill="#b42318">2 % limit</text>
        {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((R) => <text key={R} x={x(R)} y={H - 18} fontSize="10" textAnchor="middle" fill="#475569">{R * 100}%</text>)}
        {[0, ymax / 2, ymax].map((p) => <text key={p} x={P - 4} y={y(p) + 3} fontSize="10" textAnchor="end" fill="#475569">{(p * 100).toFixed(1)}</text>)}
        <path d={line(1)} fill="none" stroke="#1d4ed8" strokeWidth="2" />
        {wFrac !== 0 ? <path d={line(2)} fill="none" stroke="#0f7b4b" strokeWidth="2" strokeDasharray="6 3" /> : null}
        <line x1={x(s.eopr)} x2={x(s.eopr)} y1={y(0)} y2={8} stroke="#64748b" strokeDasharray="2 3" />
        <text x={W / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="#475569">true EOPR (in-tolerance probability)</text>
        <text x={P + 6} y={14} fontSize="10" fill="#475569">PFA %</text>
      </svg>
      <p className="small"><span className="swatch blue" /> no guard band {wFrac !== 0 ? <><span className="swatch green" /> with {sel ? GUARD_INFO[sel.method].label : ''}</> : null} · dotted line: your EOPR</p>
    </div>
  );
}

function QuickPfa() {
  const [tur, setTur] = useState<number | null>(4);
  const [eopr, setEopr] = useState<number | null>(95);
  const [k95, setK95] = useState<K95Mode>('k2');
  const kv = k95 === 'k2' ? 2 : normInv(0.975);
  const ok = tur !== null && tur > 0 && eopr !== null && eopr > 0 && eopr < 100;
  const res = useMemo(() => {
    if (!ok) return null;
    const none = riskFromTur(tur!, eopr! / 100, kv, 0);
    const M = method6M(tur!);
    const w6 = M > 0 ? (M / tur!) : 0;
    const m6 = riskFromTur(tur!, eopr! / 100, kv, w6);
    const worst = worstCasePfa(tur!, kv);
    const u95 = 1 / tur! < 1 ? riskFromTur(tur!, eopr! / 100, kv, 1 / tur!) : null;
    return { none, M, m6, worst, u95 };
  }, [ok, tur, eopr, kv]);
  return (
    <div className="card" data-testid="quick-pfa">
      <h3>Quick PFA from TUR and EOPR</h3>
      <p className="muted small">Symmetric tolerance, normal model. Use it to answer "what PFA does a 3:1 TUR give at 90 % EOPR?" without entering a full test point.</p>
      <div className="grid3">
        <NumberField label="TUR (N:1)" value={tur} onChange={setTur} testId="q-tur" />
        <NumberField label="True EOPR" value={eopr} onChange={setEopr} suffix="%" testId="q-eopr" />
        <SelectField label="U95 =" value={k95} options={K95_OPTS.filter((o) => o.value !== 't95')} onChange={setK95} />
      </div>
      {res ? (
        <div className="outs">
          <div className="out"><span>PFA, no guard band</span><b data-testid="q-pfa">{fmtPct(res.none.pfa)}</b></div>
          <div className="out"><span>PFR, no guard band</span><b>{fmtPct(res.none.pfr)}</b></div>
          <div className="out"><span>Worst-case PFA</span><b>{fmtPct(res.worst.pfa)}</b><small>at EOPR {(res.worst.eopr * 100).toFixed(1)} %</small></div>
          <div className="out"><span>Method 6 M2%</span><b>{res.M > 0 ? res.M.toFixed(4) : '≤ 0 (none)'}</b></div>
          <div className="out"><span>PFA / PFR with Method 6</span><b>{fmtPct(res.m6.pfa)} / {fmtPct(res.m6.pfr)}</b></div>
          {res.u95 ? <div className="out"><span>PFA / PFR with w = U95</span><b>{fmtPct(res.u95.pfa)} / {fmtPct(res.u95.pfr)}</b></div> : null}
        </div>
      ) : <p className="err small">Enter TUR &gt; 0 and EOPR between 0 and 100 %.</p>}
    </div>
  );
}
