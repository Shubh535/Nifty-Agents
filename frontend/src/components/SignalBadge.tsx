type Signal = string | null | undefined;

const SIGNAL_MAP: Record<string, string> = {
  buy: 'buy', overweight: 'overweight',
  sell: 'sell', underweight: 'underweight',
  hold: 'hold',
};

export default function SignalBadge({ signal, large }: { signal: Signal; large?: boolean }) {
  if (!signal) return <span className="signal-badge hold">—</span>;
  const key = signal.toLowerCase();
  const cls = SIGNAL_MAP[key] ?? 'hold';
  const icons: Record<string, string> = {
    buy: '↑', overweight: '↗', sell: '↓', underweight: '↘', hold: '→',
  };
  return (
    <span className={`signal-badge ${cls}${large ? ' large' : ''}`}>
      {icons[key] ?? '→'} {signal}
    </span>
  );
}
