'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SignalBadge from '@/components/SignalBadge';
import dynamic from 'next/dynamic';

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });

const API = 'http://localhost:8000';

interface PortfolioItem {
  ticker: string; added_at: string;
  last_signal: string|null; last_run_id: string|null;
}

const POPULAR = [
  'RELIANCE.NS','TCS.NS','INFY.NS','HDFCBANK.NS',
  'ICICIBANK.NS','WIPRO.NS','SBIN.NS','BAJFINANCE.NS',
];

export default function PortfolioPage() {
  const [portfolio, setPortfolio]   = useState<PortfolioItem[]>([]);
  const [newTicker, setNewTicker]   = useState('');
  const [adding, setAdding]         = useState(false);
  const [chartTicker, setChartTicker] = useState<string|null>(null);
  const [chartData, setChartData]   = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  const load = () => {
    fetch(`${API}/api/portfolio`).then(r => r.json())
      .then(d => { setPortfolio(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newTicker.trim()) return;
    setAdding(true);
    await fetch(`${API}/api/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: newTicker.trim().toUpperCase() }),
    });
    setNewTicker(''); setAdding(false); load();
  };

  const remove = async (ticker: string) => {
    await fetch(`${API}/api/portfolio/${ticker}`, { method: 'DELETE' });
    load();
  };

  const showChart = async (ticker: string) => {
    if (chartTicker === ticker) { setChartTicker(null); setChartData([]); return; }
    setChartTicker(ticker);
    const r = await fetch(`${API}/api/chart/${ticker}`);
    if (r.ok) { const d = await r.json(); setChartData(d.candles); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Portfolio</h1>
        <p className="page-sub">Track and analyse your watchlist</p>
      </div>

      <div className="two-col">
        {/* Add Stock */}
        <div className="card">
          <div className="card-header"><span className="card-title">Add to Watchlist</span></div>
          <div className="form-group">
            <label className="form-label">Ticker Symbol</label>
            <input
              className="form-input"
              value={newTicker}
              onChange={e => setNewTicker(e.target.value.toUpperCase())}
              placeholder="e.g. TCS.NS"
              onKeyDown={e => e.key === 'Enter' && add()}
              list="popular-tickers"
            />
            <datalist id="popular-tickers">
              {POPULAR.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <button className="btn btn-primary" onClick={add} disabled={adding || !newTicker.trim()}>
            {adding ? <><span className="spinner" /> Adding...</> : '+ Add Stock'}
          </button>

          <div style={{ marginTop: 20 }}>
            <div className="form-label" style={{ marginBottom: 10 }}>Quick Add</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {POPULAR.map(s => (
                <button key={s} className="btn btn-outline"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => setNewTicker(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Watchlist */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Watchlist</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{portfolio.length} stocks</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
          ) : portfolio.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">◈</div>
              <div className="empty-state-text">Add stocks to start tracking them.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Ticker</th><th>Last Signal</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {portfolio.map(p => (
                    <tr key={p.ticker}>
                      <td><strong>{p.ticker}</strong></td>
                      <td><SignalBadge signal={p.last_signal} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Link href={`/analysis?ticker=${p.ticker}`} className="btn btn-outline"
                            style={{ padding: '4px 10px', fontSize: 11 }}>
                            Analyse
                          </Link>
                          <button className="btn btn-outline"
                            style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => showChart(p.ticker)}>
                            {chartTicker === p.ticker ? 'Hide' : 'Chart'}
                          </button>
                          <button className="btn btn-danger"
                            style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => remove(p.ticker)}>
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      {chartTicker && chartData.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <StockChart candles={chartData} ticker={chartTicker} />
        </div>
      )}
    </div>
  );
}
