'use client';
import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';

interface Candle { time: string; open: number; high: number; low: number; close: number; }

export default function StockChart({ candles, ticker }: { candles: Candle[]; ticker: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !candles.length) return;
    ref.current.innerHTML = '';

    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#16181f' },
        textColor: '#8b8fa8',
      },
      grid: {
        vertLines: { color: '#252830' },
        horzLines: { color: '#252830' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#252830' },
      timeScale: { borderColor: '#252830', timeVisible: true },
      width: ref.current.clientWidth,
      height: 300,
    });

    // lightweight-charts v5: addSeries(CandlestickSeries, options)
    const series = chart.addSeries(CandlestickSeries, {
      upColor:         '#00d4a0',
      downColor:       '#ff4757',
      borderUpColor:   '#00d4a0',
      borderDownColor: '#ff4757',
      wickUpColor:     '#00d4a0',
      wickDownColor:   '#ff4757',
    });

    series.setData(candles);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(e => {
      chart.resize(e[0].contentRect.width, 300);
    });
    ro.observe(ref.current);

    return () => { chart.remove(); ro.disconnect(); };
  }, [candles]);

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        {ticker} — 3 Month Price Chart
      </div>
      <div ref={ref} style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }} />
    </div>
  );
}
