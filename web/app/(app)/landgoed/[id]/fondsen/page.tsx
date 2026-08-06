import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import { RadarKaart, IcoonGeld, IcoonWereld, IcoonVinkje } from "@/components/RadarKaart";
import { laadProfiel } from "@/app/(app)/landgoed/[id]/subsidies/matching";
import { zetAnbiStatus, zoekFondsen } from "./acties";
import LangeActieKnop from "@/components/LangeActieKnop";
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
import { laadCatalogus } from "@/lib/fondsen/zoek";
import { zoekMetOpslag } from "@/lib/fondsen/opslag";
import {
  AANVRAGERS,
  BEDRAGBANDEN,
  BEDRAGBAND_LABELS,
  leidDoelAf,
  PLANFASEN,
  PLANFASE_LABELS,
  PUBLIEK_LABELS,
  PUBLIEK_OPTIES,
  type Antwoorden,
} from "@/lib/fondsen/vraag";

// Vraag 4 ("wie zou aanvragen?") test uitsluitend de rechtsvormpoort — zie
// `profielVoorAanvrager` in lib/fondsen/zoek.ts. Is de rechtsvorm van het
// landgoed zelf al stichting of vereniging, dan geeft "het landgoed zelf" en
// "een stichting" precies hetzelfde resultaat, en dat is verwarrend om naast
// elkaar te laten staan. Vandaar: bij een landgoed dat al stichting/vereniging
// is, één samengevoegde optie; bij een ander landgoed (privé, BV, onbekend)
// blijft "een steunstichting oprichten" een apart, betekenisvol alternatief —
// dat is de grootste enkele knop uit §9.1 van het plan.
function aanvragerOpties(rechtsvorm: string | null): { waarde: string; label: string }[] {
  const isAlAlStichtingachtig =
    rechtsvorm === "stichting" || rechtsvorm === "vereniging";
  if (isAlAlStichtingachtig) {
    return [
      { waarde: "landgoed", label: "het landgoed zelf" },
      { waarde: "partner", label: "een aparte partnerorganisatie" },
    ];
  }
  return [
    { waarde: "landgoed", label: "het landgoed zelf, in de huidige rechtsvorm" },
    { waarde: "stichting", label: "een (nieuw op te richten) steunstichting" },
    { waarde: "partner", label: "een aparte partnerorganisatie" },
  ];
}

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

// Stappen voor de laadoverlay tijdens zoekFondsen (acties.ts) — de eerste
// regel komt van `bezigTekst` op de knop zelf, dus die staat hier niet nog
// een keer in.
const ZOEK_STAPPEN = [
  "We doorzoeken de fondsencatalogus",
  "De harde filters toepassen (ligging, rechtsvorm, ANBI, bedrag)",
  "De beste kandidaten rangschikken",
  "Per fonds de onderbouwing schrijven",
  "Bijna klaar",
];

type FondsRij = PoortFonds & {
  organisatie: string | null;
  // Koepelstichting die dit (naam)fonds beheert, bv. "Ars Donandi" — je dient
  // in bij het naamfonds zelf, niet bij de koepel; dit label maakt zichtbaar
  // welke onderliggende fondsen bij welke koepel horen.
  beheerd_door: string | null;
  samenvatting: string | null;
  soort_bron: string;
  herkomst: string;
  bedrag_indicatie: string | null;
  bron_url: string | null;
  themas: string[] | null;
  trefwoorden: string[] | null;
};

const VELDEN =
  "id, naam, organisatie, beheerd_door, samenvatting, themas, trefwoorden, soort_bron, benaderbaarheid, " +
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
  searchParams: Promise<{
    q?: string;
    status?: string;
    kostensoort?: string;
    bedrag?: string;
    plan?: string;
    motivatie?: string;
    doel?: string;
    fase?: string;
    band?: string;
    aanvrager?: string;
    publiek?: string;
  }>;
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

  // Is een fonds ooit onderzocht? Een `ai_voorstel`-rij zonder gelezen bron is
  // nog nooit bekeken; die hoort niet als "onbekend" mee te tellen, want dat
  // meet de achterstand van de verrijking in plaats van de scherpte van de
  // poort. Zie `isOnderzocht` in lib/fondsen/poort.ts.
  const lezingenPer = new Map<string, number>();
  const { data: lezingen } = await supabase
    .from("regeling_bronlezing")
    .select("regeling_id")
    .in(
      "regeling_id",
      alle.map((f) => f.id),
    );
  for (const l of (lezingen ?? []) as { regeling_id: string }[]) {
    lezingenPer.set(l.regeling_id, (lezingenPer.get(l.regeling_id) ?? 0) + 1);
  }

  const index = aliasIndex(aliassen);
  const oordelen = new Map<string, FondsOordeel>();
  for (const f of alle) {
    oordelen.set(
      f.id,
      toetsPoort(
        { ...f, criteria: criteriaPer.get(f.id) ?? [], bronlezingen: lezingenPer.get(f.id) ?? 0 },
        profiel,
        vraag,
        index,
      ),
    );
  }
  const cijfers = trechter([...oordelen.values()]);

  const zoek = (zoekParams.q ?? "").trim().toLowerCase();
  const zichtbaar = alle.filter((f) => {
    if (!zoek) return true;
    return [f.naam, f.organisatie, f.beheerd_door, f.samenvatting, (f.themas ?? []).join(" "), (f.trefwoorden ?? []).join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(zoek);
  });

  const bak = (u: FondsOordeel["uitkomst"], metActie: boolean | null = null) =>
    zichtbaar
      .filter((f) => {
        const o = oordelen.get(f.id)!;
        if (!o.onderzocht) return false;
        if (o.uitkomst !== u) return false;
        if (metActie === null) return true;
        return metActie ? o.acties.length > 0 : o.acties.length === 0;
      })
      .sort((a, b) => a.naam.localeCompare(b.naam));

  let door = bak("doorgelaten", false);
  let anders = bak("doorgelaten", true);
  let onbekend = bak("onbekend");
  let afgevallen = bak("afgevallen");
  // Eigen categorie: gevonden, maar nog niet onderzocht. Niet wegfilteren (dit
  // is de werkvoorraad), maar ook niet meetellen alsof ze beoordeeld zijn.
  let nietOnderzocht = zichtbaar
    .filter((f) => !oordelen.get(f.id)!.onderzocht)
    .sort((a, b) => a.naam.localeCompare(b.naam));

  // ── De vraag van de gebruiker (fase 3) ────────────────────────────────────
  // De vijf antwoorden komen als URL-parameters binnen, zodat een uitkomst te
  // delen en te herladen is. Er wordt pas gezocht als er iets gevraagd is:
  // een lege pagina hoort niets te kosten.
  const planTekst = (zoekParams.plan ?? "").trim();
  const motivatieTekst = (zoekParams.motivatie ?? "").trim();
  const antwoorden: Antwoorden = {
    plan: planTekst,
    motivatie: motivatieTekst,
    // Geen apart keuzeveld meer (was dubbelop met de plantekst hierboven) —
    // deterministisch afgeleid uit wat de gebruiker al typte. Voedt de
    // kostensoort-poort en de thematische weging; bij twijfel null, en dan
    // wordt die poort simpelweg niet getoetst.
    doel: leidDoelAf(planTekst),
    fase: (PLANFASEN as string[]).includes(zoekParams.fase ?? "")
      ? (zoekParams.fase as Antwoorden["fase"])
      : null,
    bedragband: (BEDRAGBANDEN as readonly string[]).includes(zoekParams.band ?? "")
      ? (zoekParams.band as Antwoorden["bedragband"])
      : null,
    aanvrager: (AANVRAGERS as readonly string[]).includes(zoekParams.aanvrager ?? "")
      ? (zoekParams.aanvrager as Antwoorden["aanvrager"])
      : null,
    publiek: (PUBLIEK_OPTIES as readonly string[]).includes(zoekParams.publiek ?? "")
      ? (zoekParams.publiek as Antwoorden["publiek"])
      : null,
  };
  const erIsGevraagd =
    antwoorden.plan.length > 0 ||
    antwoorden.motivatie.length > 0 ||
    antwoorden.doel !== null ||
    antwoorden.fase !== null ||
    antwoorden.bedragband !== null;

  // Faalt de zoekstap (bijvoorbeeld omdat migratie 0056 nog niet is toegepast,
  // of omdat het model onbereikbaar is), dan blijft de catalogus gewoon staan.
  // Een kapotte zoekopdracht mag de pagina niet meenemen.
  let uitkomst: Awaited<ReturnType<typeof zoekMetOpslag>> | null = null;
  let zoekfout: string | null = null;
  if (erIsGevraagd) {
    try {
      const catalogus = await laadCatalogus(supabase);
      uitkomst = await zoekMetOpslag(supabase, id, profiel, antwoorden, catalogus);
    } catch (e) {
      zoekfout = e instanceof Error ? e.message : String(e);
    }
  }

  const uit = uitkomst?.uitkomst ?? null;

  // Een fonds dat al bovenaan in de zoekresultaten staat, hoeft niet nóg een
  // keer in de catalogusbakken eronder — anders staat bv. hetzelfde naamfonds
  // twee keer op de pagina, met een andere weging/toon.
  if (uit) {
    const getoond = new Set(uit.fondsen.map((f) => f.fonds_id));
    door = door.filter((f) => !getoond.has(f.id));
    anders = anders.filter((f) => !getoond.has(f.id));
    onbekend = onbekend.filter((f) => !getoond.has(f.id));
    afgevallen = afgevallen.filter((f) => !getoond.has(f.id));
    nietOnderzocht = nietOnderzocht.filter((f) => !getoond.has(f.id));

    // Op relevantie sorteren i.p.v. op naam: `weegscores` is de gratis, al
    // berekende laag-2-score (thema/trefwoorden/kostensoort tegen het
    // opgegeven plan) voor ELK fonds dat door de poort kwam, niet alleen de
    // top die naar de AI ging. Zo zakt een fonds dat niets met het plan te
    // maken heeft (bv. een kunstfonds bij een plan over voedselbossen) naar
    // onderen, zonder dat daar een extra AI-aanroep voor nodig is.
    const score = new Map(uit.weegscores.map((w) => [w.fonds_id, w.score]));
    const opRelevantie = (a: FondsRij, b: FondsRij) =>
      (score.get(b.id) ?? -1) - (score.get(a.id) ?? -1) || a.naam.localeCompare(b.naam);
    door = [...door].sort(opRelevantie);
    anders = [...anders].sort(opRelevantie);
    onbekend = [...onbekend].sort(opRelevantie);
  }

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
          {cijfers.totaal} onderzochte fondsen getoetst
          {cijfers.niet_onderzocht > 0 && ` · ${cijfers.niet_onderzocht} nog niet onderzocht`}
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-[13.5px] leading-snug" style={{ color: "var(--text-2)" }}>
        Hieronder vindt u een module om te kijken of uw plan raakvlak heeft met een fonds dat kan
        bijdragen aan de financiële haalbaarheid.
      </p>

      {/* ANBI-status — een landgoedeigenschap, geen deel van de zoekopdracht.
          Losse buttons die direct opslaan (server action), zodat de
          ANBI-poort (lib/fondsen/poort.ts::toetsAnbi) meteen het juiste
          antwoord ziet zonder dat de gebruiker eerst hoeft te zoeken. */}
      <form action={zetAnbiStatus} className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-[13px] font-semibold">Heeft dit landgoed een ANBI-status?</div>
          <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
            Sommige fondsen steunen uitsluitend ANBI-instellingen — dit antwoord bepaalt of die
            fondsen meetellen.
          </p>
        </div>
        <input type="hidden" name="landgoed_id" value={id} />
        <div className="flex shrink-0 gap-2">
          <button
            type="submit"
            name="is_anbi"
            value="ja"
            className={`btn btn-sm ${profiel.is_anbi ? "btn-primary" : "btn-ghost"}`}
          >
            Ja
          </button>
          <button
            type="submit"
            name="is_anbi"
            value="nee"
            className={`btn btn-sm ${!profiel.is_anbi ? "btn-primary" : "btn-ghost"}`}
          >
            Nee
          </button>
        </div>
      </form>

      {/* HET VRAAGVELD — fase 3, de eerste functie waarmee de module iets doet
          wat een lijst niet kan. Server action i.p.v. method="get": laag 3
          (twee AI-aanroepen) draait ín de action, mét laadoverlay
          (LangeActieKnop), en stuurt daarna door naar dezelfde
          GET-route-met-parameters — die blijft dus deelbaar/te herladen, en
          de bestemmingspagina treft de uitkomst als cache-hit aan (de hash in
          opslag.ts), dus zonder nog een keer te betalen. Zie ./acties.ts. */}
      <form action={zoekFondsen} className="card mb-6 p-4 md:p-5">
        <input type="hidden" name="landgoed_id" value={id} />
        <label htmlFor="plan" className="mb-1 block text-[13px] font-semibold">
          Beschrijf uw plan
        </label>
        <p className="mb-2 text-[12px]" style={{ color: "var(--text-3)" }}>
          Bijvoorbeeld: &ldquo;ik wil de historische laan herstellen&rdquo; of &ldquo;het koetshuis
          herbestemmen tot werkplek voor een zorgpartij&rdquo;.
        </p>
        <textarea
          id="plan"
          name="plan"
          rows={2}
          defaultValue={antwoorden.plan}
          className="w-full rounded-md border px-3 py-2 text-[13.5px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Wat wilt u doen?"
        />

        <label htmlFor="motivatie" className="mb-1 mt-4 block text-[13px] font-semibold">
          Wat is uw doel?
        </label>
        <p className="mb-2 text-[12px]" style={{ color: "var(--text-3)" }}>
          De onderliggende reden, los van de activiteit hierboven — bijvoorbeeld
          &ldquo;behoud voor toekomstige generaties&rdquo; of &ldquo;toegankelijkheid voor het
          publiek vergroten&rdquo;. Fondsen matchen vaak op hun eigen doelstelling, niet alleen
          op de activiteit.
        </p>
        <textarea
          id="motivatie"
          name="motivatie"
          rows={2}
          defaultValue={antwoorden.motivatie}
          className="w-full rounded-md border px-3 py-2 text-[13.5px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Waarom wilt u dit?"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <VraagVeld
            naam="fase"
            label="Waar staat het plan nu?"
            waarde={antwoorden.fase ?? ""}
            opties={[{ waarde: "", label: "weet ik nog niet" }, ...PLANFASEN.map((f) => ({ waarde: f, label: PLANFASE_LABELS[f] }))]}
          />
          <VraagVeld
            naam="band"
            label="Orde van grootte?"
            waarde={antwoorden.bedragband ?? ""}
            opties={[{ waarde: "", label: "weet ik nog niet" }, ...BEDRAGBANDEN.map((b) => ({ waarde: b, label: BEDRAGBAND_LABELS[b] }))]}
          />
          <VraagVeld
            naam="aanvrager"
            label="Wie zou aanvragen?"
            waarde={antwoorden.aanvrager ?? ""}
            opties={[{ waarde: "", label: "weet ik nog niet" }, ...aanvragerOpties(profiel.rechtsvorm)]}
          />
          <VraagVeld
            naam="publiek"
            label="Komt er publiek bij?"
            waarde={antwoorden.publiek ?? ""}
            opties={[{ waarde: "", label: "weet ik nog niet" }, ...PUBLIEK_OPTIES.map((p) => ({ waarde: p, label: PUBLIEK_LABELS[p] }))]}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <LangeActieKnop
            className="btn btn-primary"
            bezigTekst="We doorzoeken de fondsencatalogus"
            stappen={ZOEK_STAPPEN}
          >
            Zoek fondsen
          </LangeActieKnop>
          {erIsGevraagd && (
            <Link href={basis} className="btn btn-ghost btn-sm">
              Wissen
            </Link>
          )}
        </div>
      </form>

      {erIsGevraagd && (
        <ZoekResultaat
          fondsenId={id}
          zoekfout={zoekfout}
          uitkomst={uit}
          uitOpslag={uitkomst?.uit_opslag ?? false}
        />
      )}

      <details className="mb-6">
        <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
          Of blader door de hele catalogus
        </summary>
        <p className="mb-3 mt-2 max-w-2xl text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
          Wat hieronder staat zijn de harde ja/nee/onbekend-filters, zonder inhoudelijke weging op uw
          plan. Handig om te bladeren; voor een gerichte vraag is het veld hierboven sneller en
          scherper.
          {erIsGevraagd && " Fondsen die hierboven al bij uw zoekresultaat staan, worden hier niet nog eens getoond."}
        </p>

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
          uitleg="Onderzochte fondsen waarbij de bron op minstens één punt niets zegt. Uitdrukkelijk geen 'nee' — dit is navraagwerk, geen afwijzing."
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

      {/* Nog niet onderzocht. Een ánder soort onwetendheid dan "onbekend":
          daar hebben we gekeken en staat het er niet, hier is nog niet
          gekeken. Dat verschil moet zichtbaar zijn, anders lijkt de motor het
          niet te weten terwijl er simpelweg nog werk ligt. */}
      {nietOnderzocht.length > 0 && (
        <details className="mb-9">
          <summary className="cursor-pointer text-[16px] font-semibold">
            Nog niet onderzocht{" "}
            <span className="font-normal" style={{ color: "var(--text-3)" }}>
              ({nietOnderzocht.length})
            </span>
          </summary>
          <p className="mb-3 mt-1 max-w-2xl text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
            Dit zijn gevonden fondsen die nog een verrijkingsronde moeten krijgen: er is nog geen
            bron gelezen, dus er is geen werkgebied, geen route en geen bedragband. Ze staan hier
            omdat ze de werkvoorraad zijn — maar ze tellen niet mee in de cijfers hierboven, want
            ze zijn niet beoordeeld. &quot;Onbekend&quot; hierboven betekent: we hebben gekeken en het
            staat er niet.
          </p>
          <div className="flex flex-col gap-2">
            {nietOnderzocht.map((f) => (
              <FondsRegel key={f.id} fonds={f} oordeel={oordelen.get(f.id)!} />
            ))}
          </div>
        </details>
      )}

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
          bleef. De noemer is het aantal <strong>onderzochte</strong> fondsen ({cijfers.totaal} van{" "}
          {cijfers.totaal_in_catalogus} in de catalogus); de {cijfers.niet_onderzocht} nog niet
          onderzochte voorstel-rijen tellen niet mee, anders meet u uw eigen achterstand in plaats
          van de scherpte van het filter. Let op dezelfde beperking als bij de omgevingsradar: dit
          meet alleen wat er in de catalogus staat — wat er nooit in kwam telt hier nergens mee.
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
          {cijfers.totaal} onderzocht → {cijfers.doorgelaten} doorgelaten, {cijfers.onbekend}{" "}
          onbekend, {cijfers.afgevallen} afgevallen ({cijfers.met_actie} met een ander
          handelingsperspectief). Daarnaast {cijfers.niet_onderzocht} fondsen die nog een
          verrijkingsronde moeten krijgen.
        </p>
      </details>
      </details>
    </div>
  );
}

// ── Het vraagveld: één keuzeveld ────────────────────────────────────────────

function VraagVeld({
  naam,
  label,
  waarde,
  opties,
}: {
  naam: string;
  label: string;
  waarde: string;
  opties: { waarde: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={naam} className="mb-1 block text-[12.5px] font-medium">
        {label}
      </label>
      <select
        id={naam}
        name={naam}
        defaultValue={waarde}
        className="w-full rounded-md border px-2.5 py-1.5 text-[13px]"
        style={{ borderColor: "var(--border)" }}
      >
        {opties.map((o) => (
          <option key={o.waarde} value={o.waarde}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Het resultaat van de zoekopdracht ───────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  zelf: "u kunt zelf aanvragen",
  partner: "via een partner",
  intermediair: "via een intermediair",
};

function ZoekResultaat({
  fondsenId,
  zoekfout,
  uitkomst,
  uitOpslag,
}: {
  fondsenId: string;
  zoekfout: string | null;
  uitkomst: Awaited<ReturnType<typeof zoekMetOpslag>>["uitkomst"] | null;
  uitOpslag: boolean;
}) {
  if (zoekfout) {
    return (
      <div
        className="mb-8 rounded-lg border px-4 py-3 text-[13px] leading-snug"
        style={{ borderColor: "var(--border)", background: "rgba(220,38,38,0.05)" }}
      >
        <strong>De zoekopdracht kon niet worden uitgevoerd.</strong> De catalogus hieronder blijft
        gewoon bruikbaar. ({zoekfout})
      </div>
    );
  }
  if (!uitkomst) return null;

  // De timing-val (§6): geen model aangeroepen, geen lijst getoond — alleen
  // de reden waarom het te laat is.
  if (uitkomst.te_laat) {
    return (
      <div
        className="mb-8 rounded-lg border px-4 py-3 text-[13.5px] leading-snug"
        style={{ borderColor: "var(--border)", background: "rgba(220,38,38,0.06)" }}
      >
        <strong>Voor dit plan bent u te laat.</strong> {uitkomst.te_laat.reden}
        <div className="mt-1.5">{uitkomst.te_laat.wat_wel}</div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-semibold">
          {uitkomst.fondsen.length > 0
            ? `${uitkomst.fondsen.length} fonds${uitkomst.fondsen.length === 1 ? "" : "en"} die passen`
            : "Geen match gevonden"}
        </h2>
        <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
          {uitOpslag ? "eerder berekend, geen nieuwe kosten" : `$${uitkomst.kosten.dollars.toFixed(4)}`}
        </span>
      </div>
      <p className="mb-3 max-w-2xl text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
        {uitkomst.toelichting}
      </p>

      {uitkomst.fondsen.length === 0 && uitkomst.wat_zou_helpen.length > 0 && (
        <div
          className="mb-4 rounded-lg border px-4 py-3 text-[13px] leading-snug"
          style={{ borderColor: "var(--border)", background: "rgba(245,158,11,0.06)" }}
        >
          <strong>Wat zou helpen:</strong>
          <ul className="mt-1 list-disc pl-5">
            {uitkomst.wat_zou_helpen.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Een stapeling met volgorde, geen ranglijst (§9.3): gesorteerd op
          slagingskans, met per fonds de route en de eerste stap. */}
      <div className="flex flex-col gap-2.5">
        {uitkomst.fondsen.map((f, i) => (
          <article key={f.fonds_id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
              <h3 className="text-[14.5px] font-semibold leading-tight">
                <Link href={`/landgoed/${fondsenId}/fondsen/${f.fonds_id}`} className="hover:underline">
                  {i + 1}. {f.naam}
                </Link>
              </h3>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <span className="tag tag-green">slagingskans {f.slagingskans}/100</span>
                <span className="tag tag-gray" title="Hoeveel wij van dit fonds weten — een ander getal dan de slagingskans">
                  matchbaarheid {f.matchbaarheid}/100
                </span>
              </div>
            </div>

            <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
              {f.waarom}
            </p>
            {f.citaat && (
              <p
                className="mt-1.5 border-l-2 pl-2.5 text-[12px] leading-snug"
                style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
              >
                &ldquo;{f.citaat}&rdquo;
                {!f.citaat_gecontroleerd && " (kon niet worden teruggevonden in het profiel)"}
              </p>
            )}

            <div className="mt-2 text-[12.5px]" style={{ color: "var(--text-2)" }}>
              <strong>{ROUTE_LABELS[f.route] ?? f.route}.</strong> {f.route_uitleg}
            </div>
            <div className="mt-1 text-[12.5px] font-medium">→ {f.eerste_stap}</div>

            {f.waarschuwingen.map((w) => (
              <div key={w} className="mt-1.5 text-[12px]" style={{ color: "var(--text-3)" }}>
                Let op: {w}
              </div>
            ))}

            <div className="mt-3">
              <Link
                href={`/landgoed/${fondsenId}/fondsen/${f.fonds_id}`}
                className="btn btn-primary btn-sm"
              >
                Meer info →
              </Link>
            </div>
          </article>
        ))}
      </div>
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
        <div>
          <h3 className="text-[14.5px] font-semibold leading-tight">
            {f.bron_url ? (
              <a href={f.bron_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {f.naam}
              </a>
            ) : (
              f.naam
            )}
          </h3>
          {f.beheerd_door && (
            <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-3)" }}>
              Naamfonds, beheerd door {f.beheerd_door} — aanvraag loopt via dit fonds, niet via de koepel.
            </p>
          )}
        </div>
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
          alle acht poorten
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
