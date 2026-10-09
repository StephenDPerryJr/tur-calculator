import { useMemo, useRef, useState } from 'react';
import { PointCalc } from './components/PointCalc';
import { RiskTab } from './components/RiskTab';
import { TableMode } from './components/TableMode';
import { HowTo } from './components/HowTo';
import { Glossary } from './components/Glossary';
import { Checkbox } from './components/inputs';
import { computePoint } from './lib/compute';
import { reportHTML, tableToCSV } from './lib/report';
import { fmtRatio } from './lib/tur';
import { downloadFile, safeFileName, usePersisted } from './store';
import type { PointState, TableState } from './lib/model';

type Tab = 'calc' | 'risk' | 'table' | 'report' | 'howto' | 'glossary';
const TABS: Array<[Tab, string]> = [
  ['calc', 'TUR calculator'],
  ['risk', 'Risk & guard bands'],
  ['table', 'Multi-point table'],
  ['report', 'Report'],
  ['howto', 'How-to'],
  ['glossary', 'Definitions'],
];

export default function App() {
  const { point, setPoint, table, setTable } = usePersisted();
  const result = useMemo(() => computePoint(point), [point]);
  const [tab, setTab] = useState<Tab>(() => {
    const q = new URLSearchParams(location.search).get('tab') as Tab | null;
    return q && TABS.some(([k]) => k === q) ? q : 'calc';
  });
  const update = (fn: (s: PointState) => PointState) => setPoint((s) => fn(s));
  const updateTable = (fn: (t: TableState) => TableState) => setTable((t) => fn(t));
  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="logo">TUR</span>
          <div>
            <h1>TUR Calculator <em>Made Simple</em></h1>
            <p>Test uncertainty ratio · false-accept risk · guard bands — ANSI/NCSL Z540.3 · ILAC G8 · ISO/IEC 17025</p>
          </div>
        </div>
        <div className="current">
          <span className="muted small">{point.title}</span>
          <span className={`pill ${result.tur ? (result.tur.pass ? 'ok' : 'bad') : 'bad'}`} data-testid="headline">
            {result.tur ? `${result.tur.method === 'z540' ? 'TUR' : 'Ratio'} ${fmtRatio(result.tur.tur)} ${result.tur.pass ? '✓' : '✗'}` : 'incomplete'}
          </span>
        </div>
      </header>
      <nav className="tabs no-print" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => go(k)} data-testid={`tab-${k}`}>{label}</button>
        ))}
      </nav>
      <main>
        {tab === 'calc' && <PointCalc s={point} r={result} update={update} goRisk={() => go('risk')} />}
        {tab === 'risk' && <RiskTab s={point} r={result} update={update} />}
        {tab === 'table' && <TableMode t={table} update={updateTable} goReport={() => go('report')} />}
        {tab === 'report' && <ReportTab point={point} table={table} />}
        {tab === 'howto' && <HowTo load={(s) => { setPoint(s); go('calc'); }} />}
        {tab === 'glossary' && <Glossary />}
      </main>
      <footer className="no-print">
        Runs entirely in your browser; your inputs are stored only on this device. Risk figures assume normal distributions and no bias. The laboratory remains responsible for its uncertainty evaluation and decision rules (ISO/IEC 17025 7.6, 7.8.6).
      </footer>
    </div>
  );
}

function ReportTab({ point, table }: { point: PointState; table: TableState }) {
  const [withTable, setWithTable] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => reportHTML(point, withTable ? table : null), [point, table, withTable]);
  return (
    <div className="stack">
      <div className="card no-print">
        <div className="btn-row">
          <button className="btn primary" onClick={() => frame.current?.contentWindow?.print()} data-testid="print">Print / Save as PDF</button>
          <button className="btn" onClick={() => downloadFile(`${safeFileName(point.title)}_TUR_report.html`, html, 'text/html;charset=utf-8')}>Download HTML report</button>
          <button className="btn" onClick={() => downloadFile(`${safeFileName(table.title)}_TUR.csv`, tableToCSV(table), 'text/csv;charset=utf-8')}>Download table CSV</button>
        </div>
        <Checkbox label="Include the multi-point table" checked={withTable} onChange={setWithTable} />
      </div>
      <iframe ref={frame} title="Report preview" className="report-frame" srcDoc={html} data-testid="report-frame" />
    </div>
  );
}
