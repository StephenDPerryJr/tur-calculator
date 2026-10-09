import { GLOSSARY, REFERENCES } from '../lib/guidance';
import { GUARD_INFO, type GuardMethod } from '../lib/risk';

export function Glossary() {
  return (
    <div className="stack guide">
      <div className="card">
        <h3>Definitions</h3>
        <dl className="glossary">
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt>{g.term}</dt>
              <dd>{g.def}{g.ref ? <div className="small muted">{g.ref}</div> : null}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card">
        <h3>TUR vs TAR at a glance</h3>
        <div className="table-wrap">
          <table className="budget">
            <thead><tr><th></th><th>TUR (current)</th><th>TAR (legacy)</th></tr></thead>
            <tbody>
              <tr><th>Numerator</th><td>Tolerance span (UL − LL)</td><td>UUT tolerance (±)</td></tr>
              <tr><th>Denominator</th><td>2 × U95 of the whole calibration process</td><td>Reference standard accuracy (±)</td></tr>
              <tr><th>Includes UUT resolution / repeatability, environment, method</th><td>Yes</td><td>No</td></tr>
              <tr><th>Defined in</th><td>ANSI/NCSL Z540.3-2006 3.11; ILAC G8:09/2019 1.13</td><td>Older practice; Z540.3 defines TUR and does not address TAR (NASA, "Measurement Decision Risk – The Importance of Definitions", 2013)</td></tr>
              <tr><th>Tells you about risk?</th><td>Yes, together with EOPR (PFA)</td><td>Not reliably — can overstate quality many times over</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Guard-band methods in this app</h3>
        <ul>
          {(Object.keys(GUARD_INFO) as GuardMethod[]).map((g) => (
            <li key={g}><b>{GUARD_INFO[g].label}</b> — <span className="mono">{GUARD_INFO[g].formula}</span>. {GUARD_INFO[g].note} <span className="small muted">[{GUARD_INFO[g].reference}]</span></li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>References</h3>
        <ol className="small">{REFERENCES.map((r) => <li key={r}>{r}</li>)}</ol>
      </div>
    </div>
  );
}
