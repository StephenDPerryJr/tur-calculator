import { computePoint } from '../lib/compute';
import { EXAMPLES, type PointState } from '../lib/model';
import { MISTAKES, WHEN_LOW, WHERE_DATA } from '../lib/guidance';
import { DIST_INFO, fmt, fmtRatio } from '../lib/tur';
import { Explain } from './inputs';

export function HowTo({ load }: { load: (s: PointState) => void }) {
  return (
    <div className="stack guide">
      <div className="card">
        <h3>Calculating a TUR, step by step</h3>
        <ol className="steps">
          <li><b>Pick the test point.</b> Function, range and value (e.g. DC V, 10 V range, 10 V). TUR is evaluated per point — never once for a whole instrument.</li>
          <li><b>Find the UUT tolerance at that point.</b> From the spec sheet: add up every term (% of reading × reading, % of range × range, ppm, counts × value of one count, fixed term). Write the limits: lower = nominal − T, upper = nominal + T (or the asymmetric / one-sided limits).</li>
          <li><b>Get the measurement process uncertainty.</b> From your uncertainty budget for the procedure at that point: reference standard (certificate U ÷ its k, plus drift/spec if you use nominal values), UUT resolution (½ digit, rectangular ÷ √3), repeatability (standard deviation), environment, connections. Combine by root-sum-square: uc = √(Σ uᵢ²).</li>
          <li><b>Expand to ≈95 %.</b> U95 = k × uc with k = 2 (or 1.96, or t95(νeff) when degrees of freedom are low).</li>
          <li><b>Compute TUR = (upper limit − lower limit) / (2 × U95).</b> For ±T this is T / U95.</li>
          <li><b>Compare with the requirement</b> (usually ≥ 4:1, Z540.3 5.3 b). If it is lower, follow "TUR below 4:1" below — estimate PFA, guard band, reduce uncertainty, and agree the decision rule with the customer.</li>
          <li><b>Record it</b> with the decision rule used (Report tab) so an assessor can follow the numbers.</li>
        </ol>
      </div>

      <div className="card">
        <h3>Worked examples (computed live by the app)</h3>
        <div className="examples">
          {EXAMPLES.map((ex) => {
            const s = ex.make();
            const r = computePoint(s);
            const u = s.unit;
            return (
              <div key={ex.key} className="example" data-testid={`howto-${ex.key}`}>
                <h4>{ex.label}</h4>
                <p className="small muted">{ex.blurb}</p>
                <ol className="small">
                  <li>Tolerance: {r.limits.kind === 'symmetric' ? <>± {fmt(r.limits.halfWidth, 5)} {u} → limits {fmt(r.limits.lower, 7)} … {fmt(r.limits.upper, 7)} {u}</> : <>{r.limits.kind === 'upper' ? 'maximum' : 'limit'} {fmt(s.tolerance.limit, 5)} {u}, expected value {fmt(s.tolerance.nominal, 5)} {u}</>}</li>
                  {s.uMode === 'components' ? (
                    <li>Uncertainty components:
                      <ul>
                        {s.components.map((c, i) => <li key={c.id}>{c.name}: {fmt(c.value, 4)} {u} {DIST_INFO[c.dist].divisorText.replace('k', String(c.k))} → u = {fmt(r.unc.components[i].u, 3)} {u}</li>)}
                      </ul>
                    </li>
                  ) : <li>Stated U = {fmt(s.U, 4)} {u} at k = {s.k}</li>}
                  <li>uc = {fmt(r.unc.uc, 4)} {u}; U95 = {r.unc.k95.toFixed(2)} × uc = <b>{fmt(r.unc.U95, 4)} {u}</b></li>
                  <li>{r.tur?.method === 'z540' ? <>TUR = {fmt(r.limits.span, 5)} / (2 × {fmt(r.unc.U95, 4)}) = <b>{r.tur ? fmtRatio(r.tur.tur) : '—'}</b></> : <>Ratio = |{fmt(s.tolerance.limit, 4)} − {fmt(s.tolerance.nominal, 4)}| / {fmt(r.unc.U95, 4)} = <b>{r.tur ? fmtRatio(r.tur.tur) : '—'}</b> (practical one-sided ratio)</>} {r.tur ? (r.tur.pass ? '✔ meets 4:1' : '✘ below 4:1') : ''}</li>
                  {r.tar !== undefined ? <li>Legacy TAR (vs reference accuracy {fmt(s.refAccuracy, 3)} {u}) = {fmtRatio(r.tar)}</li> : null}
                  {r.noGuard ? <li>At 95 % EOPR: PFA ≈ {(r.noGuard.pfa * 100).toFixed(2)} % without guard band{r.selected?.valid && r.selected.method !== 'none' ? <>; with {r.selected.method === 'u95' ? 'w = U95' : 'Method 6'} acceptance limits {fmt(r.selected.accLower, 7)} … {fmt(r.selected.accUpper, 7)} {u}</> : null}.</li> : null}
                </ol>
                <p className="small"><i>{ex.key === 'dmm' ? 'Lesson: at the top of a range the % of reading term dominates; the calibrator is the biggest contributor, so TUR ≈ TAR here.' : ex.key === 'caliper' ? 'Lesson: TAR (200:1 against the gauge block) hides that the caliper\'s own resolution and repeatability limit the process. TUR is 2.4:1 → guard band or agree a decision rule.' : ex.key === 'pressure' ? 'Lesson: % FS tolerance is the same at every point, so the lowest-uncertainty point is not the best TUR point — check every point. Readability of the dial is the largest contributor.' : 'Lesson: one-sided limits have no Z540.3 TUR; use w = U95 (accept only readings ≤ limit − U95) unless you can justify a risk calculation.'}</i></p>
                <button className="btn small" onClick={() => load(ex.make())}>Open in calculator</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Where to find the data</h3>
        <table className="budget">
          <tbody>{WHERE_DATA.map((w) => <tr key={w.what}><th style={{ width: '24%' }}>{w.what}</th><td>{w.where}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="card">
        <h3>Common mistakes</h3>
        <ul className="mistakes">{MISTAKES.map((m) => <li key={m.title}><b>{m.title}.</b> {m.body}</li>)}</ul>
      </div>

      <div className="card" id="low-tur">
        <h3>TUR below 4:1 — options</h3>
        <ol>{WHEN_LOW.map((w) => <li key={w.title}><b>{w.title.replace(/^\d+\.\s*/, '')}.</b> {w.body}</li>)}</ol>
        <Explain title="Example decision-rule wording (adapt and agree with your customer)">
          "Conformity statements are made using simple acceptance where the TUR is ≥ 4:1. Where TUR &lt; 4:1, acceptance limits are reduced by a guard band per ANSI/NCSL Z540.3 Handbook Method 6 so that the probability of false accept does not exceed 2 %. Points where this is not possible are reported with measured values and uncertainty without a conformity statement."
        </Explain>
      </div>
    </div>
  );
}
