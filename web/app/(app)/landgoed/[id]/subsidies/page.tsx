import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  nieuweSubsidie,
  zoekKansenActie,
  leesLopendeUitDocument,
  verbergKans,
  herstelKans,
} from "./acties";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import { SubsidieFilter } from "@/components/SubsidieFilter";
import { moet } from "@/lib/db";

function dagenTot(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

const catTag: Record<string, string> = {
  subsidie: "tag-green",
  carbon: "tag-blue",
  groenblauw: "tag-blue",
  regeling: "tag-gray",
};

const CATEGORIE_LABELS: Record<string, string> = {
  natuur: "Natuur & biodiversiteit",
  klimaat_water: "Klimaat & water",
  landbouw: "Landbouw",
  gebouwen_erfgoed: "Gebouwen & erfgoed",
  energie: "Energie",
  financiering_fiscaal: "Financiering & fiscaal",
  recreatie_platteland: "Recreatie & platteland",
};
const CATEGORIE_VOLGORDE = [
  "natuur",
  "klimaat_water",
  "landbouw",
  "gebouwen_erfgoed",
  "energie",
  "financiering_fiscaal",
  "recreatie_platteland",
];

const DOELGROEP_TAG: Record<string, { label: string; cls: string }> = {
  eigenaar: { label: "voor u (eigenaar)", cls: "tag-green" },
  pachter: { label: "via uw pachter", cls: "tag-amber" },
  beiden: { label: "eigenaar + pachter", cls: "tag-gray" },
  organisatie: { label: "voor organisaties", cls: "tag-gray" },
};

type RegelingMini = {
  is_nieuw: boolean;
  is_tijdelijk: boolean;
  openstelling_tot: string | null;
  scope: string;
  themas: string[] | null;
  categorie_ui: string | null;
  doelgroep_type: string | null;
} | null;

type SubsidieRij = {
  id: string;
  naam: string;
  organisatie: string | null;
  categorie: string;
  bedrag_indicatie: string | null;
  status: string | null;
  deadline: string | null;
  soort: string;
  match_score: number | null;
  redenering: string | null;
  al_in_gebruik: boolean;
  nevenreden: string | null;
  verborgen_op: string | null;
  regeling: RegelingMini;
};

// De vier secundaire bakken, in de volgorde waarin ze op de pagina staan. Dit zijn
// kansen die inhoudelijk niet dood zijn maar wél op afstand horen: je wil ze kunnen
// inzien, niet erover struikelen. De reden komt uit `subsidie.nevenreden`
// (berekend door de matchmotor, zie bepaalNevenreden in matching.ts).
const NEVENREDEN_BAKKEN: { key: string; titel: string; uitleg: string }[] = [
  {
    key: "dubbel",
    titel: "Waarschijnlijk dubbel",
    uitleg:
      "Lijkt op een subsidie die al loopt. Controleer voor je iets doet — de naamvergelijking herkent geen afkortingen, dus dit is een vermoeden, geen vaststelling.",
  },
  {
    key: "pachter",
    titel: "Voor pachters / boeren",
    uitleg:
      "Hier is uw pachter de aanvrager, niet het landgoed. Wel bruikbaar in gesprek met uw pachters.",
  },
  {
    key: "collectief",
    titel: "Vereist een agrarisch collectief (ANLb)",
    uitleg:
      "De aanvraag loopt verplicht via een erkend collectief. Nu niet aan de orde, maar toetreden kan.",
  },
  {
    key: "te_groot",
    titel: "Te groot of vraagt een samenwerking",
    uitleg:
      "Vraagt een consortium, een gebiedsproces of een minimale projectomvang die een landgoed niet zelfstandig haalt.",
  },
];

// Eén kansregel. De verberg-knop staat NAAST de link en niet erin: een button
// binnen een <a> is ongeldige HTML en maakt de hele regel onvoorspelbaar klikbaar.
function KansRij({
  s,
  landgoedId,
  gedempt = false,
}: {
  s: SubsidieRij;
  landgoedId: string;
  gedempt?: boolean;
}) {
  const d = dagenTot(s.deadline);
  const urgent = d !== null && d >= 0 && d <= 30;
  const kansrijk = (s.match_score ?? 0) >= 70;
  const dg = s.regeling?.doelgroep_type ? DOELGROEP_TAG[s.regeling.doelgroep_type] : null;
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.02]">
      <Link href={`/landgoed/${landgoedId}/subsidies/${s.id}`} className="flex flex-1 items-center gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold" style={gedempt ? { color: "var(--text-2)" } : undefined}>
              {s.naam}
            </span>
            {dg && <span className={`tag ${dg.cls}`}>{dg.label}</span>}
            {!gedempt && typeof s.match_score === "number" && (
              <span className={`tag ${kansrijk ? "tag-green" : "tag-gray"}`}>
                {kansrijk ? "Kansrijk" : "Mogelijk"}
              </span>
            )}
            {s.regeling?.is_nieuw && <span className="tag tag-blue">Nieuw</span>}
            {s.regeling?.is_tijdelijk && <span className="tag tag-red">Tijdelijk</span>}
            {s.regeling?.scope === "provinciaal" && <span className="tag tag-gray">provinciaal</span>}
          </div>
          {s.redenering && (
            <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-2)" }}>
              {s.redenering}
            </div>
          )}
        </div>
        {s.deadline && (
          <span className={`tag shrink-0 ${urgent ? "tag-red" : "tag-gray"}`}>
            {urgent ? `nog ${d} d` : s.deadline}
          </span>
        )}
        <span style={{ color: "var(--text-3)" }}>→</span>
      </Link>
      <form action={verbergKans}>
        <input type="hidden" name="landgoed_id" value={landgoedId} />
        <input type="hidden" name="subsidie_id" value={s.id} />
        <button
          type="submit"
          className="btn btn-ghost btn-sm btn-danger"
          title="Wegklikken. De regeling blijft bewaard en je kunt hem terugzetten."
        >
          Verwijderen
        </button>
      </form>
    </div>
  );
}

export default async function SubsidiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scope?: string; doelgroep?: string }>;
}) {
  const { id } = await params;
  const { scope, doelgroep } = await searchParams;
  const filterscope = scope ?? "";
  const filterdoelgroep = doelgroep ?? "";
  const supabase = await createClient();

  const [{ data: landgoed }, subsidies, { data: catTel }, { data: laatsteRun }, { data: docs }, { data: omgProfiel }] =
    await Promise.all([
      supabase.from("landgoed").select("naam, provincie, nsw_status, rechtsvorm, hectare, ligt_in_nnn, ligt_in_natura2000, ligt_op_veengrond, anlb_leefgebied_code, anlb_gecontroleerd_op").eq("id", id).maybeSingle(),
      // Via `moet`: faalt deze query, dan is de pagina niet "leeg" maar stuk, en dat
      // moet je zien. Zonder deze wikkel zou een ontbrekende kolom (bv. deze code op
      // een database waar 0031 nog niet is toegepast) een volkomen normale, lege
      // subsidiepagina opleveren: geen lopende subsidies, geen kansen, geen fout.
      moet(
        supabase
          .from("subsidie")
          .select(
            "id, naam, organisatie, categorie, bedrag_indicatie, status, deadline, soort, match_score, redenering, al_in_gebruik, nevenreden, verborgen_op, regeling:regeling_id (is_nieuw, is_tijdelijk, openstelling_tot, scope, themas, categorie_ui, doelgroep_type)",
          )
          .eq("landgoed_id", id)
          .order("match_score", { ascending: false, nullsFirst: false }),
        "subsidies laden (staan migraties 0030/0031 op deze database?)",
      ),
      supabase.from("regeling").select("geaccordeerd"),
      supabase
        .from("subsidie_import_run")
        .select("status, aantal_gezien, aantal_nieuw, voltooid_op")
        .order("gestart_op", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("document")
        .select("id, titel")
        .eq("landgoed_id", id)
        .order("aangemaakt_op", { ascending: false }),
      supabase
        .from("omgeving_profiel")
        .select("themas, trefwoorden")
        .eq("landgoed_id", id)
        .maybeSingle(),
    ]);

  const rijen = (subsidies ?? []) as unknown as SubsidieRij[];
  const lopend = rijen.filter((s) => s.soort === "lopend");
  const verborgen = rijen.filter((s) => s.soort === "kans" && s.verborgen_op);
  const alleKansen = rijen
    .filter((s) => s.soort === "kans" && !s.verborgen_op)
    .sort((a, b) => {
      const w = (x: SubsidieRij) =>
        (x.regeling?.is_nieuw ? 2 : 0) + (x.regeling?.is_tijdelijk ? 1 : 0);
      if (w(b) !== w(a)) return w(b) - w(a);
      return (b.match_score ?? 0) - (a.match_score ?? 0);
    });

  // Actieve filters toepassen
  const kansen = alleKansen.filter((s) => {
    if (filterscope && s.regeling?.scope !== filterscope) return false;
    if (filterdoelgroep && s.regeling?.doelgroep_type !== filterdoelgroep) return false;
    return true;
  });

  // Primair vs. secundair. Alleen primaire kansen worden per thema gegroepeerd; de
  // secundaire krijgen hun eigen bakken (zie NEVENREDEN_BAKKEN), zodat ze inzichtelijk
  // blijven zonder de lijst te vullen.
  const primair = kansen.filter((s) => !s.nevenreden);
  const secundair = kansen.filter((s) => s.nevenreden);

  const kansenPerCategorie = new Map<string, SubsidieRij[]>();
  for (const k of primair) {
    const cat = k.regeling?.categorie_ui ?? "overig";
    if (!kansenPerCategorie.has(cat)) kansenPerCategorie.set(cat, []);
    kansenPerCategorie.get(cat)!.push(k);
  }
  // Gesorteerde categorieën (vaste volgorde, overig als laatste)
  const gesorteerdeCategorieen = [
    ...CATEGORIE_VOLGORDE.filter((c) => kansenPerCategorie.has(c)),
    ...(kansenPerCategorie.has("overig") ? ["overig"] : []),
  ];

  const catTotaal = (catTel ?? []).length;
  const catGeaccordeerd = (catTel ?? []).filter((r) => r.geaccordeerd).length;
  const naam = landgoed?.naam ?? "dit landgoed";

  // Profielgaten detecteren
  const profielGaten: string[] = [];
  if (!landgoed?.ligt_in_nnn && landgoed?.ligt_in_nnn !== false)
    profielGaten.push("NNN-ligging onbekend");
  if (!landgoed?.ligt_in_natura2000 && landgoed?.ligt_in_natura2000 !== false)
    profielGaten.push("Natura 2000-ligging onbekend");
  if (!landgoed?.ligt_op_veengrond && landgoed?.ligt_op_veengrond !== false)
    profielGaten.push("Bodemtype (veengrond) onbekend");
  if (!landgoed?.anlb_gecontroleerd_op) profielGaten.push("ANLb-leefgebied onbekend");
  if (!landgoed?.nsw_status) profielGaten.push("NSW-status niet ingevuld");
  if (!landgoed?.hectare) profielGaten.push("Oppervlakte (ha) niet ingevuld");
  if (!landgoed?.rechtsvorm) profielGaten.push("Rechtsvorm niet ingevuld");
  if (!(omgProfiel?.themas?.length)) profielGaten.push("Thema's niet ingevuld (omgevingsprofiel)");
  if (!(omgProfiel?.trefwoorden?.length)) profielGaten.push("Trefwoorden niet ingevuld (omgevingsprofiel)");

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Subsidies
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Subsidies</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Twee gescheiden sporen voor {naam}: bestaande subsidies beheren en
            mogelijke kansen ontdekken — met per kans waarom die relevant is.
          </p>
        </header>

        {/* Catalogus-status + acties */}
        <div className="card mb-6 flex flex-wrap items-center gap-4 p-4">
          <div className="text-[13px]">
            <span className="font-semibold">{catGeaccordeerd}</span>
            <span style={{ color: "var(--text-2)" }}>
              {" "}
              geaccordeerde regelingen in de catalogus ({catTotaal} totaal)
            </span>
            {laatsteRun && (
              <span style={{ color: "var(--text-3)" }}>
                {" · laatste import: "}
                {laatsteRun.status} ({laatsteRun.aantal_gezien} gezien,{" "}
                {laatsteRun.aantal_nieuw} nieuw)
              </span>
            )}
          </div>
          <form action={zoekKansenActie} className="ml-auto">
            <input type="hidden" name="landgoed_id" value={id} />
            <button type="submit" className="btn btn-primary btn-sm">
              Zoek kansen
            </button>
          </form>
        </div>

        {/* Profielwaarschuwing */}
        {profielGaten.length > 0 && (
          <div className="mb-5 rounded-lg border p-4 text-[13px]" style={{ borderColor: "var(--amber, #f59e0b)", background: "rgba(245,158,11,0.06)" }}>
            <div className="font-semibold mb-1" style={{ color: "var(--amber, #b45309)" }}>
              Profiel incompleet — matching minder nauwkeurig
            </div>
            <p className="mb-2" style={{ color: "var(--text-2)" }}>
              Vul het profiel aan om betere matchresultaten te krijgen:
            </p>
            <ul className="list-disc pl-4 space-y-0.5" style={{ color: "var(--text-2)" }}>
              {profielGaten.map((g) => <li key={g}>{g}</li>)}
            </ul>
            <div className="mt-2">
              <a href={`/landgoed/${id}/profiel`} className="text-[12.5px] underline" style={{ color: "var(--accent, #2563eb)" }}>
                Naar profiel →
              </a>
            </div>
          </div>
        )}

        {/* ── Spoor 1: Lopend ── */}
        <section className="mb-8">
          <h2 className="mb-2 text-[15px] font-semibold">
            Bestaande subsidies <span style={{ color: "var(--text-3)" }}>· {lopend.length}</span>
          </h2>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            Wat {naam} nu al ontvangt — beheren, voldoen aan eisen, verantwoorden.
          </p>

          <ToevoegenToggle label="subsidie toevoegen">
            <form action={nieuweSubsidie} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <input type="hidden" name="landgoed_id" value={id} />
              <div className="sm:col-span-2">
                <label className="label-up mb-1 block">Naam</label>
                <input className="input" name="naam" placeholder="Bijv. SNL natuurbeheer" required />
              </div>
              <div>
                <label className="label-up mb-1 block">Organisatie</label>
                <input className="input" name="organisatie" placeholder="RVO, provincie…" />
              </div>
              <div>
                <label className="label-up mb-1 block">Categorie</label>
                <select className="input" name="categorie" defaultValue="subsidie">
                  <option value="subsidie">Subsidie</option>
                  <option value="carbon">Carbon</option>
                  <option value="groenblauw">Groenblauw</option>
                  <option value="regeling">Regeling</option>
                </select>
              </div>
              <div>
                <label className="label-up mb-1 block">Bedrag (indicatie)</label>
                <input className="input" name="bedrag_indicatie" placeholder="€…" />
              </div>
              <div>
                <label className="label-up mb-1 block">Deadline</label>
                <input className="input" type="date" name="deadline" />
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn btn-primary">
                  Toevoegen
                </button>
              </div>
            </form>
          </ToevoegenToggle>

          {/* Datastroom B: lees lopende subsidies uit een document */}
          {(docs ?? []).length > 0 && (
            <form
              action={leesLopendeUitDocument}
              className="card mb-4 flex flex-wrap items-end gap-3 p-4"
            >
              <input type="hidden" name="landgoed_id" value={id} />
              <div className="min-w-[260px] flex-1">
                <label className="label-up mb-1 block">
                  Lopende subsidies uit document halen (AI)
                </label>
                <select className="input" name="document_id" defaultValue="">
                  <option value="" disabled>
                    Kies een document…
                  </option>
                  {(docs ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.titel}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-ghost">
                Uitlezen
              </button>
            </form>
          )}

          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {lopend.length === 0 && (
              <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen lopende subsidies. Voeg er een toe of lees ze uit een document.
              </div>
            )}
            {lopend.map((s) => (
              <Link
                key={s.id}
                href={`/landgoed/${id}/subsidies/${s.id}`}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.02]"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">{s.naam}</span>
                    <span className={`tag ${catTag[s.categorie] ?? "tag-gray"}`}>
                      {s.categorie}
                    </span>
                    {s.al_in_gebruik && <span className="tag tag-gray">uit document</span>}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                    {[s.organisatie, s.bedrag_indicatie].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {s.deadline && <span className="tag tag-gray">{s.deadline}</span>}
                <span style={{ color: "var(--text-3)" }}>→</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Spoor 2: Kansen ── */}
        <section>
          <h2 className="mb-2 text-[15px] font-semibold">
            Mogelijke kansen{" "}
            <span style={{ color: "var(--text-3)" }}>
              · {primair.length}
              {kansen.length !== alleKansen.length ? ` (gefilterd uit ${alleKansen.length})` : ""}
            </span>
          </h2>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            Waar {naam} mogelijk aanspraak op kan maken — open een kans voor het
            waarom. Nieuw &amp; tijdelijk bovenaan.
          </p>
          <Suspense>
            <SubsidieFilter />
          </Suspense>

          {kansen.length === 0 && (
            <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen kansen gevonden. Klik op &ldquo;Zoek kansen&rdquo; zodra de catalogus
              gevuld en geaccordeerd is.
            </div>
          )}

          {gesorteerdeCategorieen.map((cat) => {
            const rijen = kansenPerCategorie.get(cat) ?? [];
            return (
              <section key={cat} className="mb-5">
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                  {CATEGORIE_LABELS[cat] ?? "Overig"}{" "}
                  <span className="font-normal normal-case tracking-normal">· {rijen.length}</span>
                </h3>
                <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
                  {rijen.map((s) => (
                    <KansRij key={s.id} s={s} landgoedId={id} />
                  ))}
                </div>
              </section>
            );
          })}
        </section>

        {/* ── Spoor 2b: secundair — inzichtelijk, maar op afstand ── */}
        {secundair.length > 0 && (
          <section>
            <h2 className="mb-2 text-[15px] font-semibold">
              Secundair{" "}
              <span style={{ color: "var(--text-3)" }}>· {secundair.length}</span>
            </h2>
            <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
              Regelingen die passen bij het profiel maar nu niet voor {naam} zelf aan de
              orde zijn. Ze blijven staan zodat je ze kunt inzien; wat je niet meer wilt
              zien kun je verwijderen.
            </p>

            {NEVENREDEN_BAKKEN.map((bak) => {
              const rijen = secundair.filter((s) => s.nevenreden === bak.key);
              if (rijen.length === 0) return null;
              return (
                <section key={bak.key} className="mb-5">
                  <h3
                    className="text-[13px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-3)" }}
                  >
                    {bak.titel}{" "}
                    <span className="font-normal normal-case tracking-normal">
                      · {rijen.length}
                    </span>
                  </h3>
                  <p className="mb-2 text-[12px]" style={{ color: "var(--text-2)" }}>
                    {bak.uitleg}
                  </p>
                  <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
                    {rijen.map((s) => (
                      <KansRij key={s.id} s={s} landgoedId={id} gedempt />
                    ))}
                  </div>
                </section>
              );
            })}
          </section>
        )}

        {/* ── Verwijderd: niets gaat echt weg, terugzetten kan altijd ── */}
        {verborgen.length > 0 && (
          <section>
            <details>
              <summary className="cursor-pointer text-[13px]" style={{ color: "var(--text-2)" }}>
                Verwijderd · {verborgen.length} — de regelingen blijven bewaard, klik om
                terug te zetten
              </summary>
              <div className="card mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
                {verborgen.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                      {s.naam}
                    </span>
                    <form action={herstelKans}>
                      <input type="hidden" name="landgoed_id" value={id} />
                      <input type="hidden" name="subsidie_id" value={s.id} />
                      <button type="submit" className="btn btn-ghost btn-sm">
                        Terugzetten
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
