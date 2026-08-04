import Link from "next/link";

// De kaart van een radar-overzicht: een groot getal, waar het over gaat, en één
// regel die zegt of er haast bij is. Achter elke kaart zit een lijst.
//
// Stond eerst alleen in de subsidieradar. Nu gedeeld met de omgevingsradar,
// zodat "een radar" er in dit platform overal hetzelfde uitziet en een klik
// overal hetzelfde betekent.
export function RadarKaart({
  href,
  icoon,
  aantal,
  eenheid,
  titel,
  uitleg,
  stip,
  stipTekst,
  voet,
}: {
  href: string;
  icoon: React.ReactNode;
  aantal: number;
  eenheid: string;
  titel: string;
  uitleg: string;
  stip: "amber" | "rood" | "grijs";
  stipTekst: string;
  voet: string;
}) {
  const stipKleur =
    stip === "rood"
      ? "var(--red, #dc2626)"
      : stip === "amber"
        ? "var(--amber, #f59e0b)"
        : "var(--text-3)";
  return (
    <Link
      href={href}
      className="card flex flex-col p-5 transition-colors hover:bg-black/[0.02]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mb-5 flex items-start justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: "rgba(22,101,52,0.08)", color: "var(--primary, #166534)" }}
          aria-hidden
        >
          {icoon}
        </span>
        <span style={{ color: "var(--text-3)" }}>→</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[30px] font-bold leading-none">{aantal}</span>
        <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
          {eenheid}
        </span>
      </div>
      <div className="mt-2 text-[15px] font-semibold">{titel}</div>
      <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
        {uitleg}
      </p>
      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 text-[12.5px]">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: stipKleur }}
            aria-hidden
          />
          <span>{stipTekst}</span>
        </div>
        {voet && (
          <div className="mt-1.5 text-[12px]" style={{ color: "var(--text-3)" }}>
            {voet}
          </div>
        )}
      </div>
    </Link>
  );
}

// Kleine lijn-iconen; bewust inline zodat er geen externe assets bij komen.
export const IcoonGeld = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9.5A3.5 3.5 0 0 0 9.5 12 3.5 3.5 0 0 0 15 14.5M8 11h4M8 13h4" />
  </svg>
);

export const IcoonZon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </svg>
);

export const IcoonWereld = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
  </svg>
);

// Klok — voor wat een termijn heeft.
export const IcoonKlok = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

// Vinkje — voor wat afgehandeld is.
export const IcoonVinkje = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
