/** Lijniconen, 20 px, één stijl. Alleen paden, kleur via currentColor. */
const paden: Record<string, React.ReactNode> = {
  overzicht: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  bank: <><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" /></>,
  bon: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>,
  bot: <><rect x="4" y="7" width="16" height="12" rx="3" /><circle cx="9.5" cy="13" r="1.2" fill="currentColor" stroke="none" /><circle cx="14.5" cy="13" r="1.2" fill="currentColor" stroke="none" /><path d="M12 3v4" /></>,
  factuur: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  offerte: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 14l2 2 4-4" /></>,
  klanten: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0112 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15a5 5 0 015 5" /></>,
  uren: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  km: <><path d="M4 16l2-6h12l2 6" /><rect x="3" y="16" width="18" height="4" rx="1" /><circle cx="7.5" cy="20" r="1.5" /><circle cx="16.5" cy="20" r="1.5" /></>,
  btw: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  ib: <><path d="M4 19V5M4 19h16" /><path d="M7 15l4-5 3 3 5-6" /></>,
  activa: <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M8 7V5h8v2" /></>,
  jaar: <><path d="M5 3h14v18H5z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  export: <><path d="M12 4v11" /><path d="M8 11l4 4 4-4" /><path d="M4 19h16" /></>,
  koppel: <><path d="M10 14a4 4 0 005.7 0l2.6-2.6a4 4 0 00-5.7-5.7L11 7.3" /><path d="M14 10a4 4 0 00-5.7 0l-2.6 2.6a4 4 0 005.7 5.7L13 16.7" /></>,
  import: <><path d="M12 19V8" /><path d="M8 12l4-4 4 4" /><path d="M4 20h16" /></>,
  bel: <><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></>,
  meer: <><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  instel: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
};

export function Icoon({ naam, size = 20, className = "" }: { naam: keyof typeof paden; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      {paden[naam]}
    </svg>
  );
}

export type IcoonNaam = keyof typeof paden;
