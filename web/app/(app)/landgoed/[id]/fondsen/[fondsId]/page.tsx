import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { botsendeBedragen, euro } from "./bedragen";
import { type PoortFonds } from "@/lib/fondsen/poort";
import {
  bepaalDekking,
  deelStapels,
  splitsInRegels,
  splitsProfiel,
  schoonContact,
  telDekking,
  vindTegenstrijdigheden,
  GENERATOR_LABELS,
  type Archiefstuk,
  type Dekking,
  type Vereiste,
} from "@/lib/fondsen/dossier";

// Detailpagina van één fonds, gezien vanuit dít landgoed. Of dit fonds een
// match is, heeft de matchmotor al bepaald — staat u hier, dan bent u door
// de poort. De pagina beantwoordt drie vragen:
//   1. wat moet er aangeleverd worden?         (twee stapels: wij / u)
//   2. wat ligt er al in het archief?          (dekking uit de documentenmodule)
//   3. wat wil dit fonds eigenlijk?            (het matchprofiel + de bronnen)
//
// En één die je vóóraf wil weten in plaats van achteraf: wat moet er ná
// toekenning gebeuren (§8). Een bijdrage van EUR 5.000 met een
// accountantsverklaringsplicht is soms de moeite niet waard.
//
// Alles op deze pagina is een VOORSTEL: geen enkele rij is geaccordeerd. Dat
// staat er ook, want een voorstel dat als vaststaand feit gelezen wordt is
// erger dan geen voorstel.

export const dynamic = "force-dynamic";

const VELDEN =
  "id, naam, organisatie, samenvatting, soort_bron, benaderbaarheid, benaderwijze_notitie, " +
  "aanvrager_type, landgoed_route, landgoed_route_reden, landgoed_partnertype, geo_niveau, " +
  "geo_waarden, bedrag_min, bedrag_max, bedrag_indicatie, cofinanciering_vereist, kostensoort, " +
  "herkomst, geaccordeerd, bron_url, contact, matchbaarheid, hercontrole_termijn, laatst_gezien";

const FASE_LABELS: Record<string, string> = {
  vooraf: "vooraf",
  bij_aanvraag: "bij de aanvraag",
  achteraf: "na toekenning",
};

const DEKKING_TEKST: Record<string, { label: string; cls: string }> = {
  aanwezig: { label: "ligt er", cls: "tag-green" },
  verloopt: { label: "verloopt binnenkort", cls: "tag-amber" },
  verlopen: { label: "verlopen", cls: "tag-red" },
  geldigheid_onbekend: { label: "geldigheid onbekend", cls: "tag-amber" },
  ontbreekt: { label: "ontbreekt", cls: "tag-gray" },
  niet_archiefstuk: { label: "", cls: "" },
};

export default async function FondsDetail({
  params,
}: {
  params: Promise<{ id: string; fondsId: string }>;
}) {
  const { id, fondsId } = await params;
  const supabase = await createClient();

  const { data: fondsRuw } = await supabase
    .from("regeling")
    .select(VELDEN)
    .eq("id", fondsId)
    .maybeSingle();
  if (!fondsRuw) notFound();
  const fonds = fondsRuw as unknown as PoortFonds & {
    organisatie: string | null;
    samenvatting: string | null;
    bedrag_indicatie: string | null;
    bron_url: string | null;
    contact: string | null;
    matchbaarheid: number | null;
    geaccordeerd: boolean;
    cofinanciering_vereist: boolean | null;
  };

  const [vereistenRes, profielRes, bronnenRes] = await Promise.all([
    supabase
      .from("regeling_bewijs")
      .select(
        "id, omschrijving, vereiste_type, fase, verplichtheid, zelf_op_te_stellen, doorlooptijd_indicatie, document_categorie, bron_tekst, geaccordeerd",
      )
      .eq("regeling_id", fondsId),
    supabase
      .from("regeling_matchprofiel")
      .select("profiel, kaartje, model, geaccordeerd, bijgewerkt_op")
      .eq("regeling_id", fondsId)
      .maybeSingle(),
    supabase
      .from("regeling_bronlezing")
      .select("soort, url, jaar, gelezen_op, samenvatting")
      .eq("regeling_id", fondsId),
  ]);

  // `document_categorie` komt uit migratie 0057 en staat nog niet op live.
  // Ontbreekt de kolom, dan valt de query om en werken we zonder — de
  // archiefdekking is dan simpelweg niet te bepalen, en dat zegt de pagina ook.
  const vereisten = (vereistenRes.data ?? []) as Vereiste[];
  const bewijsGelukt = !vereistenRes.error;

  const archief = (
    (
      await supabase
        .from("document")
        .select("id, titel, categorie, geldig_tot")
        .eq("landgoed_id", id)
    ).data ?? []
  ) as Archiefstuk[];

  const stapels = deelStapels(vereisten.filter((v) => v.fase !== "achteraf"));
  const achteraf = vereisten.filter((v) => v.fase === "achteraf");
  const dekkingen = bepaalDekking(vereisten.filter((v) => v.fase !== "achteraf"), archief);
  const telling = telDekking(dekkingen);
  const dekkingPer = new Map<string, Dekking>(dekkingen.map((d) => [d.vereiste.id, d]));

  const mp = profielRes.data as
    | { profiel: string | null; kaartje: string | null; model: string | null; geaccordeerd: boolean; bijgewerkt_op: string }
    | null;
  const profielDelen = splitsProfiel(mp?.profiel);
  const bronnen = (bronnenRes.data ?? []) as {
    soort: string;
    url: string | null;
    jaar: number | null;
    gelezen_op: string | null;
    samenvatting: string | null;
  }[];

  const contact = schoonContact(fonds.contact);
  const tegenstrijdig = [
    ...vindTegenstrijdigheden(fonds.bedrag_indicatie, mp?.profiel, fonds.benaderwijze_notitie),
    // Tweede soort tegenstrijdigheid: de vrije tekst en de vastgelegde band
    // komen uit verschillende leesrondes en spreken elkaar soms tegen. Alleen
    // een bedrag BUITEN de band telt mee — zie de toelichting in bedragen.ts.
    ...botsendeBedragen(
      fonds.bedrag_indicatie,
      fonds.bedrag_min as number | null,
      fonds.bedrag_max as number | null,
    ),
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-7">
      <Link
        href={`/landgoed/${id}/fondsen`}
        className="text-[12.5px]"
        style={{ color: "var(--text-3)" }}
      >
        ← terug naar de fondsenradar
      </Link>

      <h1 className="mt-2 text-[22px] font-bold leading-tight">{fonds.naam}</h1>
      {(fonds.organisatie as string | null) && (
        <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
          {fonds.organisatie}
        </div>
      )}

      {/* Niets hier is vastgesteld. Dat hoort bovenaan te staan, niet in een
          voetnoot: een voorstel dat als feit gelezen wordt kost een aanvraag. */}
      {!fonds.geaccordeerd && (
        <div
          className="mt-4 rounded-lg border px-4 py-3 text-[13px] leading-snug"
          style={{ borderColor: "var(--border)", background: "rgba(245,158,11,0.06)" }}
        >
          <strong>Nog niet geaccordeerd.</strong> Alles op deze pagina komt uit bronnenonderzoek en
          is nog niet door een mens bevestigd. Controleer bij het fonds zelf voordat u aanvraagt.
        </div>
      )}

      {tegenstrijdig.length > 0 && (
        <div
          className="mt-3 rounded-lg border px-4 py-3 text-[13px] leading-snug"
          style={{ borderColor: "var(--border)", background: "rgba(220,38,38,0.05)" }}
        >
          <strong>De bronnen spreken elkaar tegen.</strong> Niet gladgestreken, want dit is een
          vraag voor het fonds zelf:
          <ul className="mt-1.5 list-disc pl-5">
            {tegenstrijdig.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* De matchmotor heeft de poort al getoetst — is dit fonds geen match,
          dan komt u hier niet. Wat wél hier hoort: een opsomming van de
          voorwaarden, zoals Trees for All's eis dat u eerst alle andere
          financiering verkend moet hebben. Het bedrag en de cofinancierings-
          eis staan al gestructureerd in de catalogus (bedrag_min/_max,
          cofinanciering_vereist) — de rest komt, bij gebrek aan een apart
          veld per voorwaarde, uit de vrije brontekst, in losse regels i.p.v.
          één geciteerde alinea. */}
      {(fonds.benaderwijze_notitie ||
        fonds.bedrag_min != null ||
        fonds.bedrag_max != null ||
        fonds.cofinanciering_vereist) && (
        <div
          className="mt-5 rounded-lg border px-4 py-3 text-[13px] leading-snug"
          style={{ borderColor: "var(--border)", background: "rgba(37,99,235,0.06)" }}
        >
          <strong>In het kort — voorwaarden voor dit fonds:</strong>
          <ol className="mt-1.5 list-decimal pl-5">
            {(fonds.bedrag_min != null || fonds.bedrag_max != null) && (
              <li>
                {fonds.bedrag_max != null && `Maximale bijdrage: ${euro(fonds.bedrag_max)}`}
                {fonds.bedrag_min != null &&
                  `${fonds.bedrag_max != null ? " / m" : "M"}inimale bijdrage: ${euro(fonds.bedrag_min)}`}
                .
              </li>
            )}
            {fonds.cofinanciering_vereist && <li>Cofinanciering/eigen bijdrage is vereist.</li>}
            {fonds.benaderwijze_notitie &&
              splitsInRegels(fonds.benaderwijze_notitie).map((regel, i) => <li key={i}>{regel}</li>)}
          </ol>
        </div>
      )}

      {/* 2 + 3. Wat moet er aangeleverd worden, en wat ligt er al? --------- */}
      <h2 className="mt-8 text-[16px] font-semibold">Wat moet u aanleveren?</h2>
      {!bewijsGelukt ? (
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          De documentvereisten konden niet worden opgehaald. Waarschijnlijk is migratie 0057 nog
          niet toegepast op deze database.
        </p>
      ) : vereisten.length === 0 ? (
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          Bij dit fonds is nog niet vastgelegd welke stukken een aanvraag nodig heeft. Dat is een
          gat in onze gegevens, geen aanwijzing dat het fonds niets vraagt.
        </p>
      ) : (
        <>
          {telling.telbaar > 0 && (
            <p className="mb-3 mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              <strong>
                {telling.binnen} van de {telling.telbaar}
              </strong>{" "}
              stukken die u in uw archief kunt hebben, liggen er al
              {telling.aandacht > 0 && ` — ${telling.aandacht} vragen aandacht`}.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="text-[14px] font-semibold">Dit kunnen we samen maken</h3>
              <p className="mb-2 mt-0.5 text-[12px]" style={{ color: "var(--text-3)" }}>
                Wij stellen u de vragen die nodig zijn om dit stuk op te stellen.
              </p>
              {stapels.wij.length === 0 ? (
                <p className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
                  Niets — bij dit fonds moet u alles zelf aanleveren.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {stapels.wij.map((v) => (
                    <li key={v.id} className="card p-2.5 text-[13px]">
                      <div className="font-medium">{v.omschrijving}</div>
                      <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-3)" }}>
                        {GENERATOR_LABELS[v.vereiste_type] ?? "opstellen"} ·{" "}
                        {FASE_LABELS[v.fase] ?? v.fase} · {v.verplichtheid}
                      </div>
                      <div className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
                        Genereren volgt in een latere versie.
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-[14px] font-semibold">Dit moet u zelf regelen</h3>
              <p className="mb-2 mt-0.5 text-[12px]" style={{ color: "var(--text-3)" }}>
                Stukken die van buiten moeten komen. Reken op doorlooptijd.
              </p>
              {stapels.u.length === 0 ? (
                <p className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
                  Niets extern nodig, voor zover bekend.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {stapels.u.map((v) => {
                    const d = dekkingPer.get(v.id);
                    const tag = d ? DEKKING_TEKST[d.stand] : null;
                    return (
                      <li key={v.id} className="card p-2.5 text-[13px]">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="font-medium">{v.omschrijving}</span>
                          {tag?.label && <span className={`tag ${tag.cls}`}>{tag.label}</span>}
                        </div>
                        <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-3)" }}>
                          {FASE_LABELS[v.fase] ?? v.fase} · {v.verplichtheid}
                          {v.doorlooptijd_indicatie && ` · duurt ${v.doorlooptijd_indicatie}`}
                        </div>
                        {d?.toelichting && (
                          <div className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
                            {d.toelichting}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {stapels.onbepaald.length > 0 && (
            <section className="mt-4">
              <h3 className="text-[14px] font-semibold">Nog niet ingedeeld</h3>
              <p className="mb-2 mt-0.5 text-[12px]" style={{ color: "var(--text-3)" }}>
                Van deze stukken is niet vastgesteld of wij ze kunnen opstellen of dat u ze moet
                regelen. Niet geraden — dat zou u op het verkeerde been zetten.
              </p>
              <ul className="flex flex-col gap-1.5">
                {stapels.onbepaald.map((v) => (
                  <li key={v.id} className="card p-2.5 text-[13px]">
                    {v.omschrijving}
                    {v.bron_tekst && (
                      <span style={{ color: "var(--text-3)" }}> — uit de bron: &ldquo;{v.bron_tekst}&rdquo;</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stapels.strijdig.length > 0 && (
            <div
              className="mt-4 rounded-lg border px-4 py-3 text-[13px] leading-snug"
              style={{ borderColor: "var(--border)", background: "rgba(220,38,38,0.05)" }}
            >
              <strong>Dit kunnen wij niet voor u samenstellen.</strong>
              <ul className="mt-1.5 list-disc pl-5">
                {stapels.strijdig.map(({ vereiste, uitleg }) => (
                  <li key={vereiste.id}>
                    {vereiste.omschrijving} — {uitleg}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* 4. Wat wil dit fonds? --------------------------------------------- */}
      <h2 className="mt-8 text-[16px] font-semibold">Wat wil dit fonds?</h2>
      {profielDelen.length === 0 ? (
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          Voor dit fonds is nog geen profiel opgesteld
          {mp === null && " — er is geen beleidstekst gevonden om er een van te maken"}.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {profielDelen.map((d) => (
            <div key={d.kop}>
              <div className="text-[13.5px] font-semibold">{d.kop}</div>
              <p className="text-[13px] leading-snug" style={{ color: "var(--text-2)" }}>
                {d.tekst}
              </p>
            </div>
          ))}
        </div>
      )}

      {bronnen.length > 0 && (
        <>
          <h3 className="mt-5 text-[14px] font-semibold">Waar dit op berust</h3>
          <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px]">
            {bronnen.map((b, i) => (
              <li key={i}>
                {b.url ? (
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {b.soort}
                    {b.jaar ? ` ${b.jaar}` : ""}
                  </a>
                ) : (
                  <span>
                    {b.soort}
                    {b.jaar ? ` ${b.jaar}` : ""}
                  </span>
                )}
                {b.gelezen_op && (
                  <span style={{ color: "var(--text-3)" }}> · gelezen {b.gelezen_op}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 5. Verantwoording vooraf zichtbaar (§8) ---------------------------- */}
      {achteraf.length > 0 && (
        <>
          <h2 className="mt-8 text-[16px] font-semibold">Wat er ná toekenning van u wordt verwacht</h2>
          <p className="mb-2 mt-1 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            Dit staat hier omdat u het vóór het aanvragen wil weten, niet erna. Een kleine bijdrage
            met een zware verantwoordingsplicht is soms de moeite niet.
          </p>
          <ul className="flex flex-col gap-1.5">
            {achteraf.map((v) => (
              <li key={v.id} className="card p-2.5 text-[13px]">
                <div className="font-medium">{v.omschrijving}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-3)" }}>
                  {v.verplichtheid}
                  {v.doorlooptijd_indicatie && ` · ${v.doorlooptijd_indicatie}`}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Contact ----------------------------------------------------------- */}
      <h2 className="mt-8 text-[16px] font-semibold">Contact</h2>
      <div className="mt-1 flex flex-col gap-0.5 text-[13px]">
        {fonds.bron_url && (
          <a
            href={fonds.bron_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {fonds.bron_url}
          </a>
        )}
        {contact.emails.map((e) => (
          <a key={e} href={`mailto:${e}`} className="hover:underline">
            {e}
          </a>
        ))}
        {contact.telefoons.map((t) => (
          <span key={t}>{t}</span>
        ))}
        {contact.weggelaten && (
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
            Persoonsgebonden contactgegevens uit de bron zijn hier weggelaten (AVG).
          </span>
        )}
        {contact.emails.length === 0 &&
          contact.telefoons.length === 0 &&
          !fonds.bron_url && (
            <span style={{ color: "var(--text-3)" }}>Geen contactgegevens vastgelegd.</span>
          )}
      </div>

      <div className="mt-8 text-[12px]" style={{ color: "var(--text-3)" }}>
        Matchbaarheid {String(fonds.matchbaarheid ?? 0)}/100 — hoeveel wij van dit fonds weten. Dat
        is iets anders dan hoe goed het bij uw plan past.
        {mp?.model && ` · Profiel opgesteld met ${mp.model}.`}
      </div>
    </div>
  );
}
