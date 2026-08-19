'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SignalBadge from '@/components/SignalBadge';

const API = 'http://localhost:8000';

interface Run {
  id: string; ticker: string; analysis_date: string;
  signal: string|null; status: string; created_at: string; analysts: string[];
}

interface RunDetail extends Run { report: Record<string,any>|null; }

const SECTION_LABELS: Record<string,string> = {
  market_report: 'Market', sentiment_report: 'Sentiment',
  news_report: 'News', fundamentals_report: 'Fundamentals',
  investment_debate_state: 'Research', trader_investment_plan: 'Trader',
  risk_debate_state: 'Risk',
};

function HistoryInner() {
  const params           = useSearchParams();
  const [runs, setRuns]           = useState<Run[]>([]);
  const [selected, setSelected]   = useState<RunDetail|null>(null);
  const [activeTab, setActiveTab] = useState('');
  const [filter, setFilter]       = useState('');
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    fetch(`${API}/api/runs`).then(r => r.json()).then(d => { setRuns(d); setLoading(false); });
  }, []);

  useEffect(() => {
    const rid = params.get('run');
    if (rid) loadRun(rid);
  }, [params]);

  const loadRun = async (id: string) => {
    const r = await fetch(`${API}/api/runs/${id}`);
    if (r.ok) {
      const d = await r.json();
      setSelected(d);
      const tabs = d.report ? Object.keys(d.report).filter(k => d.report[k]) : [];
      if (tabs.length) setActiveTab(tabs[0]);
    }
  };

  const filtered = runs.filter(r =>
    r.ticker.toLowerCase().includes(filter.toLowerCase()) ||
    (r.signal || '').toLowerCase().includes(filter.toLowerCase())
  );

  const reportSections = selected?.report
    ? Object.entries(selected.report).filter(([, v]) => v)
    : [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">History</h1>
        <p className="page-sub">All past analysis runs</p>
      </div>

      <div className="two-col">
        {/* Run List */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Runs</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} total</span>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <input
              className="form-input"
              placeholder="Filter by ticker or signal..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">◷</div>
              <div className="empty-state-text">No runs yet.</div>
            </div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Ticker</th><th>Date</th><th>Signal</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr
                      key={r.id}
                      onClick={() => loadRun(r.id)}
                      style={{ background: selected?.id === r.id ? 'var(--accent-soft)' : undefined }}
                    >
                      <td><strong>{r.ticker}</strong></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.analysis_date}</td>
                      <td><SignalBadge signal={r.signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Run Detail */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              {selected ? `${selected.ticker} — ${selected.analysis_date}` : 'Select a run'}
            </span>
            {selected?.signal && <SignalBadge signal={selected.signal} />}
          </div>

          {!selected ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="empty-state-icon">◷</div>
              <div className="empty-state-text">Click a run on the left to view the report.</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.analysts.map(a => <span key={a} className="tag">{a}</span>)}
                <span className="tag">{selected.status}</span>
              </div>
              {reportSections.length > 0 ? (
                <>
                  <div className="tabs">
                    {reportSections.map(([key]) => (
                      <button key={key} className={`tab${activeTab===key?' active':''}`} onClick={() => setActiveTab(key)}>
                        {SECTION_LABELS[key] || key}
                      </button>
                    ))}
                  </div>
                  <div className="report-content" style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {(() => {
                      const content = selected.report?.[activeTab];
                      if (!content) return null;
                      const text = typeof content === 'object'
                        ? JSON.stringify(content, null, 2)
                        : String(content);
                      return <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.7 }}>{text}</pre>;
                    })()}
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  <div className="empty-state-text">No report saved for this run.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return <Suspense><HistoryInner /></Suspense>;
}
