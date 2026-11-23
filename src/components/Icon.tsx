
export const ICONS: Record<string, string> = {
  dash: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z",
  users: "M8 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3 2.7-5 6-5s6 2 6 5M17 12a3 3 0 100-6M15.5 15c2.7.2 4.5 2 4.5 5",
  phone: "M15.5 20.5a14 14 0 01-12-12A2.5 2.5 0 016 6l1.5 3-1.5 2a11 11 0 004 4l2-1.5 3 1.5a2.5 2.5 0 012 2.5z",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 00-1.7-1L14.5 3h-4l-.4 2.5a7.5 7.5 0 00-1.7 1l-2.4-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 001.7 1l.4 2.5h4l.4-2.5a7.5 7.5 0 001.7-1l2.4 1 2-3.5z",
  book: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 3v18",
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3",
  back: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  check: "M20 6L9 17l-5-5",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  close: "M6 6l12 12M18 6L6 18",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  lock: "M6 10V7a6 6 0 1112 0v3M5 10h14v11H5z",
  tag: "M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01",
  refresh: "M21 12a9 9 0 11-3-6.7L21 7M21 3v4h-4",
  convert: "M4 7h11l-3-3M20 17H9l3 3",
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  chat: "M21 12a8 8 0 01-11.8 7L4 20l1-4.6A8 8 0 1121 12z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  cal: "M4 5h16v16H4zM4 9h16M8 3v4M16 3v4",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  money: "M3 6h18v12H3zM12 9a3 3 0 100 6 3 3 0 000-6z",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  note: "M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  plane: "M2 16l20-8-8 13-2-6z",
  alert: "M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  arrowUR: "M7 17 17 7M9 7h8v8",
  filter: "M4 6h16M7 12h10M10 18h4",
  school: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5",
  dl: "M12 4v11M7 10l5 5 5-5M5 20h14",
  copy: "M9 9h11v11H9zM15 9V4H4v11h5",
  chart: "M4 20V11M10 20V5M16 20v-6M21 20H3",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6"
};

export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="ic"
      fill="none"
      stroke="currentColor"
      style={size ? { width: size, height: size } : undefined}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name] || ''} />
    </svg>
  );
}
