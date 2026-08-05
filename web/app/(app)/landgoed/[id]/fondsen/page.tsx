import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import { RadarKaart, IcoonGeld, IcoonWereld, IcoonVinkje } from "@/components/RadarKaart";

// Fondsenradar — gezicht 1 van de module: welke private geldgevers bestaan er,
// en wat is bij elk het handelingsperspectief?
//
// Bewust NOG GEEN matchscore per landgoed: de matchmotor is fase 2. Deze pagina
// toont de catalogus eerlijk geordend op de twee dingen die vandaag al bekend
// zijn en die het gesprek bepalen:
//   1. WIE kan aanvragen (aanvrager_type) — bij veel sociale fondsen is dat niet
//      het landgoed maar een zorg- of jeugdorganisatie die op het landgoed actief
//      wordt. De actie is dan "zoek een partner", niet "schrijf een aanvraag".
//   2. STAAT het fonds open (benaderbaarheid, §3 van het implementatieplan).
//
// Zodra de matchmotor er is, komt de score naast deze indeling te staan — niet
// in plaats ervan. Een hoge score op een fonds waar u niet mag aanvragen blijft
// een verkeerd advies.

export const dynamic = "force-dynamic";

type Fonds = {
  id: string;
  naam: string;
  organisatie: string | null;
  samenvatting: string | null;
  categorie: string | null;
  trefwoorden: string[] | null;
  themas: string[] | null;
  soort_bron: string;
  benaderbaarheid: string;
  benaderwijze_notitie: string | null;
  aanvrager_type: string;
  verdienmodel: string;
  geo_niveau: string | null;
  geo_waarden: string[] | null;
  bedrag_indicatie: string | null;
  herkomst: string;
  geaccordeerd: boolean;
  bron_url: string | null;
  bron_tabblad: string | null;
};

// ── Etiketten ──────────────────────────────────────────────────────────────

const BENADERBAARHEID: Record<
  string,
  { label: string; cls: string; uitleg: string; rang: number }
> = {
  open: {
    label: "open",
    cls: "tag-green",
    uitleg: "Publiek aanvraagloket — iedereen mag indienen.",
    rang: 1,
  },
  open_met_drempel: {
    label: "open met drempel",
    cls: "tag-green",
    uitleg:
      "Aanvragen kan, maar met een voorwaarde vooraf: alleen ANBI's, alleen na oriënterend contact, of alleen via een portaal.",
    rang: 2,
  },
  via_intermediair: {
    label: "via een intermediair",
    cls: "tag-amber",
    uitleg:
      "Dit fonds neemt directe aanvragen niet in behandeling. De actie is contact leggen met de partij die het wél mag indienen.",
    rang: 3,
  },
  onbekend: {
    label: "nog uit te zoeken",
    cls: "tag-gray",
    uitleg:
      "De bron zegt niet of en hoe u hier kunt aanvragen. Dit is geen 'nee' — het is werk dat nog gedaan moet worden.",
    rang: 4,
  },
  op_uitnodiging: {
    label: "op uitnodiging",
    cls: "tag-red",
    uitleg: "Uitsluitend op uitnodiging. Ongevraagd aanschrijven kost goodwill.",
    rang: 5,
  },
  gesloten: {
    label: "gesloten",
    cls: "tag-red",
    uitleg: "Financiert alleen eigen doelen. Blijft in de lijst zodat u weet dat het bekeken is.",
    rang: 6,
  },
};

const VERDIENMODEL: Record<string, string> = {
  directe_subsidie: "geld rechtstreeks aan het landgoed",
  locatievergoeding: "locatievergoeding via de begroting van de partner",
  indirecte_bezoekersinkomsten: "geen geldstroom, wel meer bezoek",
  pacht_huur: "structurele huur- of pachtrelatie",
  geen: "geen opbrengst, alleen maatschappelijke waarde",
  nvt: "niet van toepassing",
  onbekend: "",
};

const SOORT_BRON: Record<string, { label: string; cls: string }> = {
  fonds: { label: "fonds", cls: "tag-blue" },
  lening: { label: "lening", cls: "tag-amber" },
  fiscaal: { label: "fiscaal", cls: "tag-gray" },
  eigen_bijdrage: { label: "eigen bijdrage", cls: "tag-gray" },
};

// De drie bakken waarin de lijst uiteenvalt. De volgorde is de volgorde op de
// pagina: eerst wat u zelf kunt doen.
const BAKKEN: {
  key: string;
  titel: string;
  uitleg: string;
  types: string[];
}[] = [
  {
    key: "zelf",
    titel: "U kunt hier zelf aanvragen",
    uitleg:
      "Het landgoed is een toegestane aanvrager. Dit is de stapel waar een aanvraag van uzelf kan uitkomen.",
    types: ["landgoedeigenaar", "beide"],
  },
  {
    key: "partner",
    titel: "Hier vraagt een partner aan, niet u",
    uitleg:
      "Deze fondsen geven aan een zorg-, jeugd- of welzijnsorganisatie die op uw landgoed actief wordt. Er valt geld te verdienen, maar via een ander: u zoekt een partner en komt in hun begroting terecht als locatiepost. Zelf aanschrijven heeft geen zin.",
    types: ["derde_partij"],
  },
  {
    key: "onbekend",
    titel: "Nog niet vastgesteld wie mag aanvragen",
    uitleg:
      "Bij deze fondsen is niet uitgezocht of het landgoed zelf kan aanvragen. Ze staan hier apart in plaats van gemengd tussen de rest, omdat een gok op dit punt de verkeerde actie oplevert.",
    types: ["onbekend", "nvt"],
  },
];

function rang(f: Fonds) {
  return BENADERBAARHEID[f.benaderbaarheid]?.rang ?? 9;
}

function werkgebied(f: Fonds): string {
  if (f.geo_niveau === "landelijk") return "landelijk";
  if (f.geo_niveau === "internationaal") return "buitenland";
  const w = (f.geo_waarden ?? []).filter(Boolean);
  if (w.length === 0) return f.geo_niveau ?? "";
  if (w.length <= 2) return w.join(", ");
  return `${w.slice(0, 2).join(", ")} +${w.length - 2}`;
}

// ── Pagina ─────────────────────────────────────────────────────────────────

export default async function FondsenPagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ b?: string; q?: string }>;
}) {
  const { id } = await params;
  const { b: benaderFilter, q } = await searchParams;
  const supabase = await createClient();

  const alle = (await moet(
    supabase
      .from("regeling")
      .select(
        "id, naam, organisatie, samenvatting, categorie, trefwoorden, themas, soort_bron, benaderbaarheid, benaderwijze_notitie, aanvrager_type, verdienmodel, geo_niveau, geo_waarden, bedrag_indicatie, herkomst, geaccordeerd, bron_url, bron_tabblad",
      )
      .in("soort_bron", ["fonds", "lening"])
      .order("naam"),
    "Fondsen ophalen",
  )) as Fonds[];

  // Tellingen over de héle lijst — die veranderen niet mee met het filter,
  // anders meet je je eigen filter in plaats van de werkelijkheid.
  const totaal = alle.length;
  const benaderbaar = alle.filter(
    (f) => f.benaderbaarheid === "open" || f.benaderbaarheid === "open_met_drempel",
  ).length;
  const viaPartner = alle.filter((f) => f.aanvrager_type === "derde_partij").length;
  const uitTeZoeken = alle.filter((f) => f.benaderbaarheid === "onbekend").length;
  const geaccordeerd = alle.filter((f) => f.geaccordeerd).length;

  const zoek = (q ?? "").trim().toLowerCase();
  const zichtbaar = alle.filter((f) => {
    if (benaderFilter && f.benaderbaarheid !== benaderFilter) return false;
    if (!zoek) return true;
    const hooiberg = [
      f.naam,
      f.organisatie,
      f.samenvatting,
      f.categorie,
      (f.trefwoorden ?? []).join(" "),
      (f.themas ?? []).join(" "),
      (f.geo_waarden ?? []).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hooiberg.includes(zoek);
  });

  const basis = `/landgoed/${id}/fondsen`;
  const bewaarZoek = zoek ? `&q=${encodeURIComponent(zoek)}` : "";

  return (
    <div className="mx-auto max-w-5xl px-6 py-7">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-[22px] font-bold">Fondsenradar</h1>
        <span className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
          {totaal} fondsen in de catalogus
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-[13.5px] leading-snug" style={{ color: "var(--text-2)" }}>
        Private geldgevers die een goed plan willen steunen. Anders dan bij subsidies is er geen
        aanspraak: u overtuigt een bestuur. Daarom staat hier niet wie het meeste geeft, maar bij wie
        u terecht kunt en langs welke weg.
      </p>

      {/* Eerlijk over de stand van zaken. Zolang de matchmotor er niet is, is dit
          een catalogus en geen kansenlijst — dat hoort de pagina zelf te zeggen. */}
      <div
        className="mb-6 rounded-lg border px-4 py-3 text-[13px] leading-snug"
        style={{ borderColor: "var(--border)", background: "rgba(245,158,11,0.06)" }}
      >
        <strong>Nog niet toegespitst op dit landgoed.</strong> De matching tegen uw profiel — regio,
        rechtsvorm, thema's, bedragen — wordt in de volgende stap gebouwd. Tot die tijd ziet u de
        volledige catalogus.{" "}
        {geaccordeerd === 0 ? (
          <>
            Er is nog <strong>geen enkel fonds geaccordeerd</strong>: alles staat als voorstel in het
            systeem, afkomstig uit het bronnenonderzoek.
          </>
        ) : (
          <>
            {geaccordeerd} van de {totaal} fondsen zijn geaccordeerd.
          </>
        )}
      </div>

      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        <RadarKaart
          href={`${basis}?b=open`}
          icoon={IcoonGeld}
          aantal={benaderbaar}
          eenheid="fondsen"
          titel="Direct benaderbaar"
          uitleg="Publiek loket of een drempel die te nemen is. Hier kan een aanvraag uit voortkomen."
          stip="grijs"
          stipTekst="Open voor aanvragen"
          voet="Nog zonder toets op uw landgoed"
        />
        <RadarKaart
          href={`${basis}#partner`}
          icoon={IcoonWereld}
          aantal={viaPartner}
          eenheid="fondsen"
          titel="Alleen via een partner"
          uitleg="Geven aan een organisatie die op uw landgoed actief wordt. U komt in hun begroting, niet in die van het fonds."
          stip="amber"
          stipTekst="Vraagt een partner, geen aanvraag"
          voet="Ander handelingsperspectief"
        />
        <RadarKaart
          href={`${basis}?b=onbekend`}
          icoon={IcoonVinkje}
          aantal={uitTeZoeken}
          eenheid="fondsen"
          titel="Nog uit te zoeken"
          uitleg="De bron zegt niet of en hoe u kunt aanvragen. Dit is de eerste verrijkingsbatch."
          stip="amber"
          stipTekst="Onbekend is geen nee"
          voet="Werk dat nog gedaan moet worden"
        />
      </div>

      {/* Filter op benaderbaarheid. Bewust links en geen client-component:
          de pagina is een leeslijst, geen formulier. */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <Link
          href={`${basis}${zoek ? `?q=${encodeURIComponent(zoek)}` : ""}`}
          className={`tag ${!benaderFilter ? "tag-green" : "tag-gray"}`}
        >
          alles ({totaal})
        </Link>
        {Object.entries(BENADERBAARHEID)
          .sort((a, b2) => a[1].rang - b2[1].rang)
          .map(([key, meta]) => {
            const n = alle.filter((f) => f.benaderbaarheid === key).length;
            if (n === 0) return null;
            return (
              <Link
                key={key}
                href={`${basis}?b=${key}${bewaarZoek}`}
                className={`tag ${benaderFilter === key ? "tag-green" : "tag-gray"}`}
              >
                {meta.label} ({n})
              </Link>
            );
          })}
      </div>

      {benaderFilter && BENADERBAARHEID[benaderFilter] && (
        <p className="mb-5 text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
          {BENADERBAARHEID[benaderFilter].uitleg}
        </p>
      )}

      {zichtbaar.length === 0 && (
        <p className="py-10 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
          Geen fondsen die aan dit filter voldoen.
        </p>
      )}

      {BAKKEN.map((bak) => {
        const rijen = zichtbaar
          .filter((f) => bak.types.includes(f.aanvrager_type))
          .sort((a, b2) => rang(a) - rang(b2) || a.naam.localeCompare(b2.naam));
        if (rijen.length === 0) return null;
        return (
          <section key={bak.key} id={bak.key} className="mb-9 scroll-mt-6">
            <h2 className="text-[16px] font-semibold">
              {bak.titel}{" "}
              <span className="font-normal" style={{ color: "var(--text-3)" }}>
                ({rijen.length})
              </span>
            </h2>
            <p
              className="mb-3 mt-1 max-w-2xl text-[12.5px] leading-snug"
              style={{ color: "var(--text-2)" }}
            >
              {bak.uitleg}
            </p>
            <div className="flex flex-col gap-2">
              {rijen.map((f) => (
                <FondsRij key={f.id} fonds={f} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Eén fonds in de lijst ──────────────────────────────────────────────────

function FondsRij({ fonds: f }: { fonds: Fonds }) {
  const ben = BENADERBAARHEID[f.benaderbaarheid] ?? BENADERBAARHEID.onbekend;
  const soort = SOORT_BRON[f.soort_bron];
  const gebied = werkgebied(f);
  const verdien = VERDIENMODEL[f.verdienmodel] ?? "";

  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <h3 className="text-[14.5px] font-semibold leading-tight">
          {f.bron_url ? (
            <a href={f.bron_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {f.naam}
            </a>
          ) : (
            f.naam
          )}
        </h3>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className={`tag ${ben.cls}`}>{ben.label}</span>
          {soort && f.soort_bron !== "fonds" && (
            <span className={`tag ${soort.cls}`}>{soort.label}</span>
          )}
          {/* Gissing en feit uit elkaar houden (§2). Een fonds dat alleen uit een
              sector-tag komt, mag nooit als vastgesteld overkomen. */}
          {f.herkomst === "afgeleid_tag" && (
            <span className="tag tag-gray" title="Afgeleid uit een sector-tag, niet nagelezen op de eigen bron">
              niet geverifieerd
            </span>
          )}
        </div>
      </div>

      {f.samenvatting && (
        <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
          {f.samenvatting.length > 240 ? `${f.samenvatting.slice(0, 240)}…` : f.samenvatting}
        </p>
      )}

      <div
        className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]"
        style={{ color: "var(--text-3)" }}
      >
        {gebied && <span>Werkgebied: {gebied}</span>}
        {f.bedrag_indicatie ? (
          <span>Bedrag: {f.bedrag_indicatie}</span>
        ) : (
          <span>Bedrag: niet gepubliceerd</span>
        )}
        {verdien && <span>Opbrengst: {verdien}</span>}
      </div>

      {/* Het letterlijke citaat waarop de benaderbaarheid berust. Dit staat er
          omdat de kosten van een fout asymmetrisch zijn: een fonds ten onrechte
          aanschrijven kost goodwill in een kleine sector (§3). */}
      {f.benaderwijze_notitie && (
        <p
          className="mt-2 border-l-2 pl-2.5 text-[12px] leading-snug"
          style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
        >
          {f.benaderwijze_notitie.length > 200
            ? `${f.benaderwijze_notitie.slice(0, 200)}…`
            : f.benaderwijze_notitie}
        </p>
      )}
    </article>
  );
}
