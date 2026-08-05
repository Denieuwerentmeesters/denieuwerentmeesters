import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import { RadarKaart, IcoonGeld, IcoonWereld, IcoonVinkje } from "@/components/RadarKaart";
import { laadProfiel } from "@/app/(app)/landgoed/[id]/subsidies/matching";
import {
  aliasIndex,
  toetsPoort,
  trechter,
  PROJECTSTATUSSEN,
  type FondsOordeel,
  type PoortCriterium,
  type PoortFonds,
  type Projectstatus,
  type RegioAlias,
  type Vraag,
} from "@/lib/fondsen/poort";

// Fondsenradar — fase 2: DE POORT.
//
// Deze pagina toont niet meer de hele catalogus maar het resultaat van de harde
// filters (lib/fondsen/poort.ts): wat komt er voor DIT landgoed doorheen, en
// waarom valt de rest af. De reden tonen is hier belangrijker dan de shortlist
// zelf — daarmee wordt zichtbaar wat er aan het landgoed zou moeten veranderen.
//
// Bewust NOG GEEN matchscore: laag 2 (weging) en laag 3 (semantiek) komen
// later. Wat hier staat is deterministisch en met de hand na te rekenen.

export const dynamic = "force-dynamic";

type FondsRij = PoortFonds & {
  organisatie: string | null;
  samenvatting: string | null;
  soort_bron: string;
  herkomst: string;
  bedrag_indicatie: string | null;
  bron_url: string | null;
  themas: string[] | null;
  trefwoorden: string[] | null;
};

const VELDEN =
  "id, naam, organisatie, samenvatting, themas, trefwoorden, soort_bron, benaderbaarheid, " +
  "benaderwijze_notitie, aanvrager_type, landgoed_route, landgoed_partnertype, geo_niveau, " +
  "geo_waarden, bedrag_min, bedrag_max, bedrag_indicatie, kostensoort, herkomst, bron_url";

const KOSTENSOORT_LABELS: Record<string, string> = {
  investering: "investering",
  restauratie: "restauratie",
  regulier_onderhoud: "regulier onderhoud",
  exploitatie: "exploitatie",
  personeel: "personeel",
  onderzoek: "onderzoek",
};

const STATUS_LABELS: Record<Projectstatus, string> = {
  idee: "idee",
  in_voorbereiding: "in voorbereiding",
  gegund: "gegund",
  gestart: "gestart",
  afgerond: "afgerond",
};

// Regio-aliassen ophalen. De `landelijk`-kolom komt uit migratie 0055; staat
// die nog niet op deze database, dan valt de query terug op de oude vorm in
// plaats van de pagina te laten klappen. Zonder aliassen blijft de geografische
// poort op 'onbekend' staan — precies de bedoelde veilige stand.
async function laadAliassen(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<RegioAlias[]> {
  const met = await supabase.from("regio_alias").select("alias, provincie, gemeenten, landelijk, geaccordeerd");
  if (!met.error && met.data)
    return met.data.map((r) => ({
      alias: r.alias,
      provincie: r.provincie,
      gemeenten: r.gemeenten ?? [],
      landelijk: Boolean(r.landelijk),
      geaccordeerd: Boolean(r.geaccordeerd),
    }));
  const zonder = await supabase.from("regio_alias").select("alias, provincie, gemeenten, geaccordeerd");
  if (zonder.error || !zonder.data) return [];
  return zonder.data.map((r) => ({
    alias: r.alias,
    provincie: r.provincie,
    gemeenten: r.gemeenten ?? [],
    landelijk: false,
    geaccordeerd: Boolean(r.geaccordeerd),
  }));
}

export default async function FondsenPagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string; kostensoort?: string; bedrag?: string }>;
}) {
  const { id } = await params;
  const zoekParams = await searchParams;
  const supabase = await createClient();

  const [alle, profiel, aliassen] = await Promise.all([
    moet(
      supabase.from("regeling").select(VELDEN).in("soort_bron", ["fonds", "lening"]).order("naam"),
      "Fondsen ophalen",
    ) as Promise<unknown> as Promise<FondsRij[]>,
    laadProfiel(supabase, id),
    laadAliassen(supabase),
  ]);

  // Criteria (fase 'vooraf') bij de fondsen. Deze voeden de rechtsvormpoort —
  // de grootste harde filter van de hele lijst (§9.1).
  const criteriaPer = new Map<string, PoortCriterium[]>();
  const { data: criteria } = await supabase
    .from("regeling_criterium")
    .select("regeling_id, omschrijving, veld, operator, waarde, soort, fase")
    .in(
      "regeling_id",
      alle.map((f) => f.id),
    )
    .eq("fase", "vooraf");
  for (const c of (criteria ?? []) as (PoortCriterium & { regeling_id: string })[]) {
    const arr = criteriaPer.get(c.regeling_id) ?? [];
    arr.push(c);
    criteriaPer.set(c.regeling_id, arr);
  }

  // De vraag: projectstatus, kostensoort en bedrag zijn parameters van wat de
  // gebruiker wil, niet van het fonds. Zonder vraag worden die poorten niet
  // getoetst — een fonds mag nooit afvallen op een vraag die niet gesteld is.
  const status = (PROJECTSTATUSSEN as readonly string[]).includes(zoekParams.status ?? "")
    ? (zoekParams.status as Projectstatus)
    : null;
  const kostensoort = zoekParams.kostensoort && KOSTENSOORT_LABELS[zoekParams.kostensoort]
    ? zoekParams.kostensoort
    : null;
  const bedragRuw = Number(zoekParams.bedrag);
  const bedrag = Number.isFinite(bedragRuw) && bedragRuw > 0 ? bedragRuw : null;
  const vraag: Vraag = { projectstatus: status, kostensoort, bedrag };

  const index = aliasIndex(aliassen);
  const oordelen = new Map<string, FondsOordeel>();
  for (const f of alle) {
    oordelen.set(
      f.id,
      toetsPoort({ ...f, criteria: criteriaPer.get(f.id) ?? [] }, profiel, vraag, index),
    );
  }
  const cijfers = trechter([...oordelen.values()]);

  const zoek = (zoekParams.q ?? "").trim().toLowerCase();
  const zichtbaar = alle.filter((f) => {
    if (!zoek) return true;
    return [f.naam, f.organisatie, f.samenvatting, (f.themas ?? []).join(" "), (f.trefwoorden ?? []).join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(zoek);
  });

  const bak = (u: FondsOordeel["uitkomst"], metActie: boolean | null = null) =>
    zichtbaar
      .filter((f) => {
        const o = oordelen.get(f.id)!;
        if (o.uitkomst !== u) return false;
        if (metActie === null) return true;
        return metActie ? o.acties.length > 0 : o.acties.length === 0;
      })
      .sort((a, b) => a.naam.localeCompare(b.naam));

  const door = bak("doorgelaten", false);
  const anders = bak("doorgelaten", true);
  const onbekend = bak("onbekend");
  const afgevallen = bak("afgevallen");

  const basis = `/landgoed/${id}/fondsen`;
  const vraagQuery = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const huidig: Record<string, string | null> = {
      q: zoek || null,
      status,
      kostensoort,
      bedrag: bedrag ? String(bedrag) : null,
      ...over,
    };
    for (const [k, v] of Object.entries(huidig)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${basis}?${s}` : basis;
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-7">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-[22px] font-bold">Fondsenradar</h1>
        <span className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
          {cijfers.totaal} fondsen getoetst
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-[13.5px] leading-snug" style={{ color: "var(--text-2)" }}>
        Private geldgevers die een goed plan willen steunen. Anders dan bij subsidies is er geen
        aanspraak: u overtuigt een bestuur. Hieronder staat wat er voor dit landgoed door de harde
        filters komt — en, net zo belangrijk, waarom de rest afvalt.
      </p>

      <div
        className="mb-6 rounded-lg border px-4 py-3 text-[13px] leading-snug"
        style={{ borderColor: "var(--border)", background: "rgba(245,158,11,0.06)" }}
      >
        <strong>Dit is de poort, nog geen rangschikking.</strong> Er staat hier bewust geen
        matchscore: wat u ziet zijn de harde ja/nee/onbekend-filters (benaderbaarheid, geografie,
        rechtsvorm, aanvrager, bedrag, timing, kostensoort). De inhoudelijke weging en de match op
        uw plan komen in de volgende stap. Toetsing tegen: {profiel.rechtsvorm ?? "rechtsvorm onbekend"},{" "}
        {profiel.gemeente ?? "gemeente onbekend"} ({profiel.provincie ?? "provincie onbekend"}).
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <RadarKaart
          href={`${basis}#door`}
          icoon={IcoonGeld}
          aantal={door.length}
          eenheid="fondsen"
          titel="Door de poort"
          uitleg="Geen enkele harde filter valt hierop af. Hier kan een aanvraag van uzelf uit voortkomen."
          stip="grijs"
          stipTekst="Aanvraag mogelijk"
          voet="Nog zonder inhoudelijke weging"
        />
        <RadarKaart
          href={`${basis}#anders`}
          icoon={IcoonWereld}
          aantal={anders.length}
          eenheid="fondsen"
          titel="Ander handelingsperspectief"
          uitleg="Niet afgewezen, maar de actie is een andere: leg contact met een intermediair, of zoek een partner die aanvraagt."
          stip="amber"
          stipTekst="Vraagt eerst iets anders"
          voet="Zelf aanschrijven heeft geen zin"
        />
        <RadarKaart
          href={`${basis}#onbekend`}
          icoon={IcoonVinkje}
          aantal={onbekend.length}
          eenheid="fondsen"
          titel="Eerst uitzoeken"
          uitleg="Op minstens één punt weten we het niet. Dat is uitdrukkelijk geen 'nee' — het is de werkvoorraad van de verrijking."
          stip="amber"
          stipTekst="Onbekend is geen nee"
          voet={`${afgevallen.length} vielen wel af`}
        />
      </div>

      {/* De vraag. Projectstatus is de timing-val (§6): vanaf 'gegund' knijpt de
          poort alles af, en dat hoort de gebruiker zelf te kunnen zien. */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span style={{ color: "var(--text-3)" }}>Projectstatus:</span>
        <Link href={vraagQuery({ status: null })} className={`tag ${!status ? "tag-green" : "tag-gray"}`}>
          niet opgegeven
        </Link>
        {PROJECTSTATUSSEN.map((s) => (
          <Link
            key={s}
            href={vraagQuery({ status: s })}
            className={`tag ${status === s ? "tag-green" : "tag-gray"}`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {status && ["gegund", "gestart", "afgerond"].includes(status) && (
        <div
          className="mb-6 rounded-lg border px-4 py-3 text-[13px] leading-snug"
          style={{ borderColor: "var(--border)", background: "rgba(220,38,38,0.06)" }}
        >
          <strong>Te laat voor financiering.</strong> Vrijwel geen enkel fonds financiert met
          terugwerkende kracht. Is de opdracht gegund of de schop de grond in, dan valt vrijwel de
          hele lijst af — niet omdat het plan niet deugt, maar omdat de aanvraag vóór gunning had
          moeten liggen. Voor een volgende fase van hetzelfde project kan het wél.
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span style={{ color: "var(--text-3)" }}>Kostensoort:</span>
        <Link
          href={vraagQuery({ kostensoort: null })}
          className={`tag ${!kostensoort ? "tag-green" : "tag-gray"}`}
        >
          niet opgegeven
        </Link>
        {Object.entries(KOSTENSOORT_LABELS).map(([k, label]) => (
          <Link
            key={k}
            href={vraagQuery({ kostensoort: k })}
            className={`tag ${kostensoort === k ? "tag-green" : "tag-gray"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {kostensoort && ["regulier_onderhoud", "exploitatie"].includes(kostensoort) && (
        <div
          className="mb-6 rounded-lg border px-4 py-3 text-[13px] leading-snug"
          style={{ borderColor: "var(--border)", background: "rgba(245,158,11,0.06)" }}
        >
          <strong>Onderhoud en exploitatie zijn de categorie die bijna niemand financiert.</strong>{" "}
          Er wordt geïnvesteerd, gerestaureerd en geprojecteerd, niet onderhouden. Herkader de vraag:
          als restauratie van een monumentaal onderdeel, of als het wegwerken van achterstallig
          onderhoud in één afgebakend project met begin en eind, komen er wél bronnen in beeld.
        </div>
      )}

      <Bak
        anker="door"
        titel="Door de poort"
        uitleg="Geen enkele harde filter valt hierop af en het landgoed is zelf een toegestane aanvrager."
        rijen={door}
        oordelen={oordelen}
      />
      <Bak
        anker="anders"
        titel="Niet afgewezen, maar de actie is een andere"
        uitleg="Deze fondsen nemen geen directe aanvraag van u aan, of geven aan een organisatie die op uw landgoed actief wordt. Er valt geld te verdienen, maar via een ander."
        rijen={anders}
        oordelen={oordelen}
      />
      <Bak
        anker="onbekend"
        titel="Eerst uitzoeken"
        uitleg="Op minstens één punt zegt de bron niets. Deze fondsen staan apart in plaats van gemengd tussen de rest, omdat een gok hier de verkeerde actie oplevert."
        rijen={onbekend}
        oordelen={oordelen}
      />

      {/* Afgevallen — uitklapbaar, want dit is de langste stapel. Maar hij
          verdwijnt niet: wat weggegooid is ziet niemand meer terug, en juist
          hier staat wat er aan het landgoed zou moeten veranderen. */}
      {afgevallen.length > 0 && (
        <details className="mb-9">
          <summary className="cursor-pointer text-[16px] font-semibold">
            Afgevallen, en waarom{" "}
            <span className="font-normal" style={{ color: "var(--text-3)" }}>
              ({afgevallen.length})
            </span>
          </summary>
          <p className="mb-3 mt-1 max-w-2xl text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
            Deze fondsen blijven staan zodat u ziet dat ze bekeken zijn. Per fonds staat welke poort
            hem tegenhield — dat is de informatie waarmee zichtbaar wordt wat er aan het landgoed of
            aan de vraag zou moeten veranderen.
          </p>
          <div className="flex flex-col gap-2">
            {afgevallen.map((f) => (
              <FondsRegel key={f.id} fonds={f} oordeel={oordelen.get(f.id)!} />
            ))}
          </div>
        </details>
      )}

      {/* Trechtercijfers (§9.7). Zonder deze cijfers is niet te zien of het
          filter te streng staat. */}
      <details className="mb-4">
        <summary className="cursor-pointer text-[13px] font-semibold">Trechtercijfers</summary>
        <p className="mb-2 mt-1 max-w-2xl text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
          Per poort: hoeveel fondsen erdoor kwamen, hoeveel erop afvielen en bij hoeveel het onbekend
          bleef. Let op de beperking: dit meet alleen wat er in de catalogus staat — wat er nooit in
          kwam telt hier nergens mee.
        </p>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              <th className="py-1 text-left font-normal">poort</th>
              <th className="py-1 text-right font-normal">door</th>
              <th className="py-1 text-right font-normal">afgevallen</th>
              <th className="py-1 text-right font-normal">onbekend</th>
              <th className="py-1 text-right font-normal">hoofdreden</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(cijfers.per_poort).map(([naam, t]) => (
              <tr key={naam} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1">{naam.replace("_", " ")}</td>
                <td className="py-1 text-right">{t.door}</td>
                <td className="py-1 text-right">{t.af}</td>
                <td className="py-1 text-right">{t.onbekend}</td>
                <td className="py-1 text-right">
                  {cijfers.hoofdreden[naam as keyof typeof cijfers.hoofdreden]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-3)" }}>
          {cijfers.totaal} bekeken → {cijfers.doorgelaten} doorgelaten, {cijfers.onbekend} onbekend,{" "}
          {cijfers.afgevallen} afgevallen ({cijfers.met_actie} met een ander handelingsperspectief).
        </p>
      </details>
    </div>
  );
}

// ── Bakken en rijen ────────────────────────────────────────────────────────

function Bak({
  anker,
  titel,
  uitleg,
  rijen,
  oordelen,
}: {
  anker: string;
  titel: string;
  uitleg: string;
  rijen: FondsRij[];
  oordelen: Map<string, FondsOordeel>;
}) {
  if (rijen.length === 0) return null;
  return (
    <section id={anker} className="mb-9 scroll-mt-6">
      <h2 className="text-[16px] font-semibold">
        {titel}{" "}
        <span className="font-normal" style={{ color: "var(--text-3)" }}>
          ({rijen.length})
        </span>
      </h2>
      <p className="mb-3 mt-1 max-w-2xl text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
        {uitleg}
      </p>
      <div className="flex flex-col gap-2">
        {rijen.map((f) => (
          <FondsRegel key={f.id} fonds={f} oordeel={oordelen.get(f.id)!} />
        ))}
      </div>
    </section>
  );
}

const UITKOMST_TAG: Record<string, { label: string; cls: string }> = {
  doorgelaten: { label: "door de poort", cls: "tag-green" },
  onbekend: { label: "eerst uitzoeken", cls: "tag-gray" },
  afgevallen: { label: "valt af", cls: "tag-red" },
};

function FondsRegel({ fonds: f, oordeel: o }: { fonds: FondsRij; oordeel: FondsOordeel }) {
  const tag = UITKOMST_TAG[o.uitkomst];
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
          <span className={`tag ${tag.cls}`}>{tag.label}</span>
          {f.soort_bron === "lening" && <span className="tag tag-amber">lening</span>}
          {/* Gissing en feit uit elkaar houden (§2). */}
          {f.herkomst === "afgeleid_tag" && (
            <span
              className="tag tag-gray"
              title="Afgeleid uit een sector-tag, niet nagelezen op de eigen bron"
            >
              niet geverifieerd
            </span>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
        {o.reden}
      </p>

      {o.acties.map((a) => (
        <p key={a} className="mt-1.5 text-[12.5px] font-medium leading-snug">
          → {a}
        </p>
      ))}

      {o.herkaderingen.map((h) => (
        <p key={h} className="mt-1.5 text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
          Herkadering: {h}
        </p>
      ))}

      {o.waarschuwingen.length > 0 && (
        <ul className="mt-1.5 text-[12px] leading-snug" style={{ color: "var(--text-3)" }}>
          {o.waarschuwingen.map((w) => (
            <li key={w}>Nog uit te zoeken: {w}</li>
          ))}
        </ul>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[12px]" style={{ color: "var(--text-3)" }}>
          alle zeven poorten
        </summary>
        <ul className="mt-1 flex flex-col gap-1 text-[12px]" style={{ color: "var(--text-3)" }}>
          {o.poorten.map((po) => (
            <li key={po.poort}>
              <span className={`tag ${UITKOMST_TAG[po.uitkomst].cls}`}>
                {po.poort.replace("_", " ")}
              </span>{" "}
              {po.reden}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
