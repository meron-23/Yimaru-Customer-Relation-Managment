
const AV_TONES = [
  ['#F8DAF0', '#8E2A7C'],
  ['#DCE8FC', '#24508F'],
  ['#FDE4D2', '#8A4318'],
  ['#CDF5EA', '#0D6650'],
  ['#E8DDF8', '#55339A'],
  ['#FFF0A8', '#735300']
];

export function initials(name: string): string {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name || '') {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const t = AV_TONES[h % AV_TONES.length];
  return (
    <span
      className="av"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: t[0],
        color: t[1]
      }}
    >
      {initials(name)}
    </span>
  );
}
