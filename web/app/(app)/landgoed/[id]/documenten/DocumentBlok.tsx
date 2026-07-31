import Link from "next/link";

// Het categorieblok van het documentenoverzicht. Dezelfde opbouw als RadarKaart op
// de subsidiepagina — icoon linksboven, pijl rechts, titel, uitleg, en onderaan een
// signaalregel achter een scheidingslijn — zodat een klik overal in de app hetzelfde
// betekent: "hierachter zit een lijst".
//
// Bewust lichter dan RadarKaart: geen groot KPI-getal. Bij subsidies is het aantal
// kansen het nieuws; bij documenten is het aantal stukken dat niet, dus het staat
// als bijzin naast de titel in plaats van als kop erboven.

export type Signaal = "rood" | "amber" | "grijs";

export function DocumentBlok({
  href,
  icoon,
  titel,
  aantal,
  uitleg,
  signaal,
  signaalTekst,
  eenheid = ["stuk", "stukken"],
  gedempt = false,
}: {
  href: string;
  icoon: React.ReactNode;
  titel: string;
  aantal: number;
  uitleg: string;
  signaal: Signaal;
  signaalTekst: string;
  /** Enkelvoud en meervoud naast de titel. Notulen zijn geen "stukken". */
  eenheid?: [string, string];
  /** Leeg: zichtbaar als openstaand gat, niet als volwaardig blok. */
  gedempt?: boolean;
}) {
  const signaalKleur =
    signaal === "rood"
      ? "var(--red, #dc2626)"
      : signaal === "amber"
        ? "var(--amber, #f59e0b)"
        : "var(--text-3)";

  return (
    <Link
      href={href}
      // Stevig gedempt, niet subtiel: het verschil tussen "hier zit archief in" en "hier
      // nog niets" moet je in één oogopslag zien, zonder te lezen. Hover haalt de demping
      // weg, zodat een leeg blok wél gewoon aanklikbaar aanvoelt. De demping staat als
      // class en niet in style, want een inline opacity wint van de hover-regel.
      className={`card flex flex-col p-5 transition-all hover:bg-black/[0.02] ${
        gedempt ? "opacity-40 hover:opacity-100" : ""
      }`}
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mb-4 flex items-start justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            background: gedempt ? "var(--bg-2, rgba(0,0,0,0.04))" : "rgba(22,101,52,0.08)",
            color: gedempt ? "var(--text-3)" : "var(--primary, #166534)",
          }}
          aria-hidden
        >
          {icoon}
        </span>
        <span style={{ color: "var(--text-3)" }}>→</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold">{titel}</span>
        <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          {aantal === 0 ? "leeg" : `${aantal} ${aantal === 1 ? eenheid[0] : eenheid[1]}`}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
        {uitleg}
      </p>

      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 text-[12.5px]">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: signaalKleur }}
            aria-hidden
          />
          <span style={signaal === "grijs" ? { color: "var(--text-2)" } : undefined}>
            {signaalTekst}
          </span>
        </div>
      </div>
    </Link>
  );
}

// Kleine lijn-iconen, inline zodat er geen externe assets bij komen — zelfde keuze
// als op de subsidiepagina.
const svg = (pad: React.ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {pad}
  </svg>
);

const IcoonAkte = svg(<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>);
const IcoonStructuur = svg(<><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="15" width="6" height="5" rx="1" /><rect x="15" y="15" width="6" height="5" rx="1" /><path d="M12 8v4M6 15v-3h12v3" /></>);
const IcoonSleutel = svg(<><circle cx="8" cy="14" r="4" /><path d="M11 11l8-8M17 5l2 2M15 7l2 2" /></>);
const IcoonHamer = svg(<><path d="M13 4l7 7-3 3-7-7z" /><path d="M10 7L4 13l3 3 6-6M4 20h7" /></>);
const IcoonBoom = svg(<><path d="M12 3l5 7h-3l4 6H6l4-6H7z" /><path d="M12 16v5" /></>);
const IcoonGeld = svg(<><circle cx="12" cy="12" r="9" /><path d="M15 9.5A3.5 3.5 0 0 0 9.5 12 3.5 3.5 0 0 0 15 14.5M8 11h4M8 13h4" /></>);
const IcoonStempel = svg(<><path d="M9 3h6v5l2 3H7l2-3z" /><path d="M5 14h14v3H5zM6 20h12" /></>);
const IcoonVink = svg(<><path d="M20 11.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /><path d="M8 12l3 3 9-9" /></>);
const IcoonLoep = svg(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
const IcoonSchild = svg(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></>);
const IcoonPersoon = svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" /></>);
const IcoonNotulen = svg(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>);
const IcoonKaart = svg(<><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>);
const IcoonBak = svg(<><path d="M3 7h18M5 7l1 13h12l1-13" /><path d="M9 4h6v3H9z" /><path d="M12 11v6" /></>);

export const CATEGORIE_ICOON: Record<string, React.ReactNode> = {
  eigendom_rechten: IcoonAkte,
  governance: IcoonStructuur,
  contracten_verhuur: IcoonSleutel,
  leveranciers: IcoonHamer,
  beheerplannen: IcoonBoom,
  subsidies: IcoonGeld,
  vergunningen: IcoonStempel,
  keuringen: IcoonVink,
  onderzoeken: IcoonLoep,
  verzekeringen: IcoonSchild,
  personeel: IcoonPersoon,
  vergaderingen: IcoonNotulen,
  historisch: IcoonKaart,
  nog_in_te_delen: IcoonBak,
};
