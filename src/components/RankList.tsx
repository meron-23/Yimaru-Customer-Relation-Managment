export interface RankRow {
  key?: string;
  label: string;
  sub?: string;
  n: number;
}

export default function RankList({
  rows,
  color = '#A386E3',
  empty = 'None in this period.'
}: {
  rows: RankRow[];
  color?: string;
  empty?: string;
}) {
  if (!rows || rows.length === 0) {
    return <p className="muted pad" style={{ padding: '16px', color: 'var(--ink3)' }}>{empty}</p>;
  }
  const max = Math.max(...rows.map(r => r.n), 1);
  return (
    <div className="rank">
      {rows.map(r => (
        <div key={r.key || r.label} className="rank-r">
          <span className="rank-l">{r.label}</span>
          {r.sub ? <span className="rank-s">{r.sub}</span> : null}
          <span className="rank-bar">
            <i style={{ width: `${(r.n / max) * 100}%`, background: color }} />
          </span>
          <span className="rank-n">{r.n}</span>
        </div>
      ))}
    </div>
  );
}
