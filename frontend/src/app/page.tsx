'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SignalBadge from '@/components/SignalBadge';

const API = 'http://localhost:8000';

interface Run {
  id: string; ticker: string; analysis_date: string;
  signal: string | null; status: string; created_at: string;
}

interface PortfolioItem {
  ticker: string; last_signal: string | null; last_run_id: string | null;
}

export default function Dashboard() {
  const [runs, setRuns]           = useState<Run[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/runs`).then(r => r.json()),
      fetch(`${API}/api/portfolio`).then(r => r.json()),
    ]).then(([r, p]) => { setRuns(r); setPortfolio(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalRuns   = runs.length;
  const buys        = runs.filter(r => r.signal?.toLowerCase() === 'buy' || r.signal?.toLowerCase() === 'overweight').length;
  const sells       = runs.filter(r => r.signal?.toLowerCase() === 'sell' || r.signal?.toLowerCase() === 'underweight').length;
  const recent      = runs.slice(0, 5);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Your NiftyAgents overview</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Analyses</div>
          <div className="stat-value">{loading ? '—' : totalRuns}</div>
          <div className="stat-sub">All time runs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Buy Signals</div>
          <div className="stat-value" style={{ color: 'var(--buy)' }}>{loading ? '—' : buys}</div>
          <div className="stat-sub">Bullish calls</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sell Signals</div>
          <div className="stat-value" style={{ color: 'var(--sell)' }}>{loading ? '—' : sells}</div>
          <div className="stat-sub">Bearish calls</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Watchlist</div>
          <div className="stat-value">{loading ? '—' : portfolio.length}</div>
          <div className="stat-sub">Tracked stocks</div>
        </div>
      </div>

      <div className="two-col">
        {/* Recent Runs */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Analyses</span>
            <Link href="/analysis" className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 12 }}>
              + New
            </Link>
          </div>
          {recent.length === 0 && !loading ? (
            <div className="empty-state">
              <div className="empty-state-icon">◎</div>
              <div className="empty-state-text">No analyses yet.<br />
                <Link href="/analysis" style={{ color: 'var(--accent)' }}>Run your first analysis →</Link>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th><th>Date</th><th>Signal</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(r => (
                    <tr key={r.id} onClick={() => window.location.href = `/history?run=${r.id}`}>
                      <td><strong>{r.ticker}</strong></td>
                      <td>{r.analysis_date}</td>
                      <td><SignalBadge signal={r.signal} /></td>
                      <td><span className="tag">{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Portfolio */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Watchlist</span>
            <Link href="/portfolio" className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 12 }}>
              Manage
            </Link>
          </div>
          {portfolio.length === 0 && !loading ? (
            <div className="empty-state">
              <div className="empty-state-icon">◈</div>
              <div className="empty-state-text">No stocks tracked yet.<br />
                <Link href="/portfolio" style={{ color: 'var(--accent)' }}>Add stocks →</Link>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ticker</th><th>Last Signal</th></tr></thead>
                <tbody>
                  {portfolio.map(p => (
                    <tr key={p.ticker} onClick={() => window.location.href = `/analysis?ticker=${p.ticker}`}>
                      <td><strong>{p.ticker}</strong></td>
                      <td><SignalBadge signal={p.last_signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
