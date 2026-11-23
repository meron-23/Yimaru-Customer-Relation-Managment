export function Segmented({
  items,
  value,
  onChange
}: {
  items: [string, string][];
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="segc">
      {items.map(([k, label]) => (
        <button
          key={k}
          type="button"
          className={value === k ? 'on' : ''}
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
