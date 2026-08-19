'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AgentProgress from '@/components/AgentProgress';
import SignalBadge from '@/components/SignalBadge';
import dynamic from 'next/dynamic';

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });

const API = 'http://localhost:8000';

const ANALYSTS = [
  { key: 'market',       label: 'Market Analyst',       icon: '📈' },
  { key: 'fundamentals', label: 'Fundamentals Analyst',  icon: '📊' },
  { key: 'news',         label: 'News Analyst',          icon: '📰' },
  { key: 'social',       label: 'Sentiment Analyst',     icon: '💬' },
];

const INDIAN_STOCKS = [
  'RELIANCE.NS','TCS.NS','INFY.NS','HDFCBANK.NS','ICICIBANK.NS',
  'WIPRO.NS','SBIN.NS','BAJFINANCE.NS','MARUTI.NS','TATAMOTORS.NS',
];

type AgentStatus = 'pending'|'in_progress'|'completed'|'error';

interface ReportSections {
  [key: string]: string;
}

function AnalysisPageInner() {
  const params        = useSearchParams();
  const [ticker, setTicker]       = useState(params.get('ticker') || '');
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0]);
  const [analysts, setAnalysts]   = useState(['market','fundamentals','news']);
  const [running, setRunning]     = useState(false);
  const [agents, setAgents]       = useState<Record<string,AgentStatus>>({});
  const [signal, setSignal]       = useState<string|null>(null);
  const [reports, setReports]     = useState<ReportSections>({});
  const [activeTab, setActiveTab] = useState('');
  const [chartData, setChartData] = useState<any[]>([]);
  const [runId, setRunId]         = useState<string|null>(null);
  const esRef = useRef<EventSource|null>(null);

  const toggleAnalyst = (key: string) => {
    setAnalysts(a => a.includes(key) ? a.filter(x => x !== key) : [...a, key]);
  };

  const loadChart = async (t: string) => {
    try {
      const r = await fetch(`${API}/api/chart/${t}`);
      if (r.ok) { const d = await r.json(); setChartData(d.candles); }
    } catch {}
  };

  const startAnalysis = async () => {
    if (!ticker.trim()) return;
    setRunning(true); setSignal(null); setReports({}); setAgents({}); setActiveTab('');

    loadChart(ticker.trim());

    const res = await fetch(`${API}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: ticker.trim(), analysis_date: date, analysts }),
    });
    const { run_id } = await res.json();
    setRunId(run_id);

    // Open SSE stream
    const es = new EventSource(`${API}/api/stream/${run_id}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === 'agents_init') {
        const init: Record<string,AgentStatus> = {};
        event.data.agents.forEach((a: string) => { init[a] = 'pending'; });
        setAgents(init);
      }
      if (event.type === 'agent_status') {
        setAgents(prev => ({ ...prev, [event.data.agent]: event.data.status }));
      }
      if (event.type === 'report_section') {
        setReports(prev => {
          const updated = { ...prev, [event.data.section]: event.data.content };
          if (!activeTab) setActiveTab(event.data.section);
          return updated;
        });
      }
      if (event.type === 'complete') {
        setSignal(event.data.signal);
        setRunning(false);
        es.close();
      }
      if (event.type === 'error') {
        setRunning(false);
        es.close();
      }
      if (event.type === 'done') { es.close(); }
    };

    es.onerror = () => { setRunning(false); es.close(); };
  };

  const SECTION_LABELS: Record<string,string> = {
    market_report: 'Market', sentiment_report: 'Sentiment',
    news_report: 'News', fundamentals_report: 'Fundamentals',
    investment_debate_state: 'Research', trader_investment_plan: 'Trader',
    risk_debate_state: 'Risk',
  };

  const reportTabs = Object.keys(reports);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Analysis</h1>
        <p className="page-sub">Run AI-powered stock analysis</p>
      </div>

      <div className="two-col">
        {/* Left: Config */}
        <div className="card">
          <div className="card-header"><span className="card-title">Configure Analysis</span></div>

          <div className="form-group">
            <label className="form-label">Ticker Symbol</label>
            <input
              className="form-input"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. TCS.NS, RELIANCE.NS, AAPL"
              list="ticker-suggestions"
            />
            <datalist id="ticker-suggestions">
              {INDIAN_STOCKS.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div className="form-group">
            <label className="form-label">Analysis Date</label>
            <input
              className="form-input" type="date" value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Analysts to Run</label>
            <div className="analyst-checkboxes">
              {ANALYSTS.map(a => (
                <label
                  key={a.key}
                  className={`analyst-checkbox${analysts.includes(a.key) ? ' checked' : ''}`}
                >
                  <input type="checkbox" checked={analysts.includes(a.key)} onChange={() => toggleAnalyst(a.key)} />
                  <span>{a.icon}</span>
                  <span className="analyst-label">{a.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={startAnalysis}
            disabled={running || !ticker.trim() || analysts.length === 0}
          >
            {running ? <><span className="spinner" /> Analyzing...</> : '▶ Run Analysis'}
          </button>
        </div>

        {/* Right: Progress */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Agent Progress</span>
            {signal && <SignalBadge signal={signal} />}
          </div>

          {Object.keys(agents).length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="empty-state-icon">◎</div>
              <div className="empty-state-text">Configure and run an analysis to see live agent progress.</div>
            </div>
          ) : (
            <AgentProgress agents={agents} />
          )}

          {signal && (
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>FINAL SIGNAL</div>
              <SignalBadge signal={signal} large />
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <StockChart candles={chartData} ticker={ticker} />
        </div>
      )}

      {/* Reports */}
      {reportTabs.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header"><span className="card-title">Reports</span></div>
          <div className="tabs">
            {reportTabs.map(t => (
              <button key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
                {SECTION_LABELS[t] || t}
              </button>
            ))}
          </div>
          <div className="report-content"
            style={{ maxHeight: 500, overflowY: 'auto', padding: '0 4px' }}
            dangerouslySetInnerHTML={{
              __html: (reports[activeTab] || '').replace(/\n/g, '<br/>').replace(/#{1,3} (.+)/g, '<h3>$1</h3>')
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  return <Suspense><AnalysisPageInner /></Suspense>;
}
