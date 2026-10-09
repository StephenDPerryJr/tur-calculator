/** CSV export and a self-contained printable HTML report. */
import { computePoint, computeRow, GUARD_INFO, type PointResult } from './compute';
import { K95_INFO, fmt, fmtPct, fmtRatio } from './tur';
import type { PointState, TableState } from './model';
import { REFERENCES } from './guidance';

const csvCell = (v: string | number) => {
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function tableToCSV(t: TableState): string {
  const head = ['Point', 'Nominal', 'Range/FS', '% rdg', 'ppm rdg', '% range', 'ppm range', 'Counts', 'Resolution', 'Fixed ±', 'Tolerance ±', 'Lower limit', 'Upper limit', 'U (stated)', 'k (stated)', 'U95', 'TUR', `Meets ${t.required}:1`, `Guard band (${GUARD_INFO[t.guard].label})`, 'Lower acceptance limit', 'Upper acceptance limit', 'PFA no guard band', 'PFA with guard band', 'Unit'];
  const lines = [head.map(csvCell).join(',')];
  for (const r of t.rows) {
    const c = computeRow(r, t);
    lines.push([
      r.label, r.nominal, r.range, r.spec.pctReading, r.spec.ppmReading, r.spec.pctRange, r.spec.ppmRange, r.spec.counts, r.spec.resolution, r.spec.absolute,
      c.tol, c.lower, c.upper, r.U, r.k, c.U95, Number(c.tur.toPrecision(4)), c.errors.length ? 'error' : c.pass ? 'yes' : 'no', c.w, c.accLower, c.accUpper,
      c.pfa ?? '', c.pfaGuarded ?? '', t.unit,
    ].map(csvCell).join(','));
  }
  lines.push('');
  lines.push(csvCell(`TUR = (upper limit - lower limit) / (2 x U95) per ANSI/NCSL Z540.3-2006 3.11; U95 = U/k x ${K95_INFO[t.k95Mode]}; PFA at EOPR ${(t.eopr * 100).toFixed(1)} % (normal model, Z540.3 Handbook Method 1).`));
  return lines.join('\r\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function pointSection(s: PointState, r: PointResult): string {
  const u = esc(s.unit);
  const rows: Array<[string, string]> = [];
  const L = r.limits;
  rows.push(['Tolerance type', L.kind]);
  rows.push(['Nominal / test point', `${fmt(L.nominal, 7)} ${u}`]);
  rows.push(['Tolerance limits', `${fmt(L.lower, 7)} … ${fmt(L.upper, 7)} ${u}`]);
  rows.push(['Measurement process U95', `${fmt(r.unc.U95, 4)} ${u} (uc = ${fmt(r.unc.uc, 4)} ${u}, k95 = ${r.unc.k95.toFixed(3)})`]);
  if (r.tur) rows.push([r.tur.method === 'z540' ? 'TUR (Z540.3 3.11)' : 'One-sided ratio (not a Z540.3 TUR)', `<b>${fmtRatio(r.tur.tur)}</b> — ${r.tur.pass ? 'meets' : '<b style="color:#b42318">does not meet</b>'} ${s.required}:1`]);
  if (r.tur?.nearSideRatio !== undefined) rows.push(['Near-side ratio (asymmetric)', fmtRatio(r.tur.nearSideRatio)]);
  if (r.tar !== undefined) rows.push(['Legacy TAR (for comparison only)', fmtRatio(r.tar)]);
  if (r.noGuard && r.eoprTrue !== undefined) rows.push([`PFA / PFR, no guard band (true EOPR ${(r.eoprTrue * 100).toFixed(2)} %)`, `${fmtPct(r.noGuard.pfa)} / ${fmtPct(r.noGuard.pfr)}`]);
  if (r.worst) rows.push(['Worst-case PFA over any EOPR', `${fmtPct(r.worst.pfa)} (at EOPR ${(r.worst.eopr * 100).toFixed(1)} %)`]);
  const g = r.selected;
  if (g) rows.push([`Decision rule: ${esc(GUARD_INFO[g.method].label)}`, g.valid ? `Acceptance limits ${fmt(g.accLower, 7)} … ${fmt(g.accUpper, 7)} ${u}; guard band ${fmt(g.w, 4)} ${u}${g.risk ? `; PFA ${fmtPct(g.risk.pfa)}, PFR ${fmtPct(g.risk.pfr)}` : ''}` : esc(g.note ?? 'not applicable')]);
  let comps = '';
  if (s.uMode === 'components' && s.components.length) {
    comps = `<h3>Uncertainty components</h3><table><thead><tr><th>Component</th><th>Value</th><th>Distribution</th><th>Divisor</th><th>u</th><th>Share</th></tr></thead><tbody>${s.components
      .map((c, i) => `<tr><td>${esc(c.name)}</td><td>${fmt(c.value, 4)}</td><td>${c.dist}${c.dist === 'normal' ? ` (k=${c.k})` : ''}</td><td>${r.unc.components[i].divisor.toFixed(4)}</td><td>${fmt(r.unc.components[i].u, 4)}</td><td>${(r.unc.components[i].share * 100).toFixed(1)} %</td></tr>`)
      .join('')}</tbody></table>`;
  }
  return `<h2>${esc(s.title)}</h2><table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>${comps}`;
}

export function reportHTML(point: PointState, table: TableState | null): string {
  const r = computePoint(point);
  const date = new Date().toISOString().slice(0, 10);
  let tbl = '';
  if (table && table.rows.length) {
    tbl = `<h2>${esc(table.title)} — multi-point TUR</h2><p class="small">U95 from stated U/k using ${esc(K95_INFO[table.k95Mode])}. Required ratio ${table.required}:1. Guard band: ${esc(GUARD_INFO[table.guard].label)} (${esc(GUARD_INFO[table.guard].reference)}). PFA at EOPR ${(table.eopr * 100).toFixed(1)} %.</p>
<table><thead><tr><th>Point</th><th>Nominal</th><th>Tolerance ±</th><th>U95</th><th>TUR</th><th>Result</th><th>Acceptance limits</th><th>PFA (no GB)</th><th>PFA (GB)</th></tr></thead><tbody>${table.rows
      .map((row) => {
        const c = computeRow(row, table);
        if (c.errors.length) return `<tr><td>${esc(row.label)}</td><td colspan="8">${esc(c.errors.join(' '))}</td></tr>`;
        return `<tr><td>${esc(row.label)}</td><td>${fmt(row.nominal, 7)}</td><td>${fmt(c.tol, 4)}</td><td>${fmt(c.U95, 3)}</td><td><b>${fmtRatio(c.tur)}</b></td><td>${c.pass ? 'Meets' : '<b style="color:#b42318">Below</b>'}</td><td>${c.guardValid ? `${fmt(c.accLower, 7)} … ${fmt(c.accUpper, 7)}` : 'n/a'}</td><td>${c.pfa !== undefined ? fmtPct(c.pfa) : ''}</td><td>${c.pfaGuarded !== undefined ? fmtPct(c.pfaGuarded) : ''}</td></tr>`;
      })
      .join('')}</tbody></table><p class="small">Unit: ${esc(table.unit)}</p>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>TUR report – ${esc(point.title)}</title><style>
body{font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:24px;font-size:13px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 8px;border-bottom:2px solid #1d4ed8;padding-bottom:3px}h3{font-size:14px;margin:14px 0 6px}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #cbd5e1;padding:4px 7px;text-align:left;vertical-align:top}th{background:#f1f5fb}
table.kv th{width:38%}.small{font-size:11px;color:#475569}ol{padding-left:18px}@media print{body{margin:0}}
</style></head><body>
<h1>Test Uncertainty Ratio (TUR) report</h1><p class="small">Generated ${date} by TUR Calculator. TUR per ANSI/NCSL Z540.3-2006 3.11: (upper limit − lower limit) / (2 × U95). Risk model: normal UUT population (from EOPR) and normal measurement error, global (average) risk per Z540.3 Handbook Method 1 / JCGM 106 9.5.</p>
${r.errors.length ? `<p><b>Single-point calculation incomplete:</b> ${esc(r.errors.join(' '))}</p>` : pointSection(point, r)}
${tbl}
<h2>References</h2><ol class="small">${REFERENCES.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
<p class="small">Reviewed by: ____________________ Date: __________ &nbsp; The laboratory remains responsible for its uncertainty evaluation and decision rules (ISO/IEC 17025:2017 7.6, 7.8.6).</p>
</body></html>`;
}
