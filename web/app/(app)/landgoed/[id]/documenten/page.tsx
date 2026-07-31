import { createClient } from "@/lib/supabase/server";
import { haalNotulen } from "@/lib/notulen";
import { NotulenOverzicht } from "@/components/NotulenOverzicht";
import { DocumentBlok, CATEGORIE_ICOON, IcoonMicrofoon } from "./DocumentBlok";
import { UploadFormulier } from "./UploadFormulier";
import CategorieReview from "./CategorieReview";
import { accordeerCategorie, herclassificeerOnbekende } from "./acties";
import {
  CATEGORIEEN,
  NOG_IN_TE_DELEN,
  bepaalRelevantie,
  isGebouwCategorie,
  isGroenCategorie,
  isMedewerkerRol,
  type CategorieSleutel,
} from "./categorieen";
import { bepaalSignaal, type DocumentFeit } from "./signalen";

export default async function DocumentenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; q?: string; van?: string; tot?: string }>;
}) {
  const { id } = await params;
  const { tab, q, van, tot } = await searchParams;
  const supabase = await createClient();

  const basisPad = `/landgoed/${id}/documenten`;
  const notulenTab = tab === "notulen";

  // ── Tab "Notulen": de AI-notulen uit de vergadermodule, hier terug te vinden ──
  if (notulenTab) {
    const { gesprekken, fout } = await haalNotulen(supabase, id, { titel: q, van, tot });

    return (
      <div className="flex flex-col">
        <div
          className="flex items-center justify-between gap-4 bg-white px-7 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>Documenten / Notulen</div>
          <div className="flex gap-2">
            <a href={basisPad} className="btn btn-ghost btn-sm">Bestanden</a>
            <a href={`${basisPad}?tab=notulen`} className="btn btn-primary btn-sm">📄 Notulen</a>
          </div>
        </div>

        <div className="p-7">
          <header className="mb-5">
            <h1 className="text-[22px] font-bold">Notulen</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Notulen van vergaderingen en opnames — automatisch bewaard bij het gesprek.
              Zodra een verslag definitief wordt gemaakt, komt het ook als archiefstuk
              onder <strong>Vergaderingen en verslagen</strong> te staan.
            </p>
          </header>

          {fout ? (
            <div className="card p-5 text-[13px]" style={{ color: "var(--red)" }}>
              Notulen ophalen mislukt: {fout}
            </div>
          ) : (
            <NotulenOverzicht
              gesprekken={gesprekken}
              landgoedId={id}
              actie={basisPad}
              verborgenVelden={{ tab: "notulen" }}
              q={q ?? ""}
              van={van ?? ""}
              tot={tot ?? ""}
            />
          )}
        </div>
      </div>
    );
  }

  // Eén query voor alle documenten van dit landgoed; tellen, indelen en signaleren
  // gebeurt hier in geheugen. Dat is per landgoed een overzichtelijke hoeveelheid en
  // scheelt veertien losse count-queries. De overige queries voeden alleen de
  // relevantiebepaling: welke lege blokken zijn een openstaand gat en welke niet.
  const [
    { data: documenten, error: docFout },
    { count: aantalContracten },
    { count: aantalLopendeSubsidies },
    { data: landgoed },
    { data: objecten },
    { data: relaties },
    { count: aantalGesprekken },
  ] = await Promise.all([
    supabase
      .from("document")
      .select(
        "id, titel, categorie, categorie_geaccordeerd, categorie_voorstel_reden, bestand_pad, geldig_tot, soort, aangemaakt_op",
      )
      .eq("landgoed_id", id)
      .order("aangemaakt_op", { ascending: false }),
    supabase.from("contract").select("id", { count: "exact", head: true }).eq("landgoed_id", id),
    supabase
      .from("subsidie")
      .select("id", { count: "exact", head: true })
      .eq("landgoed_id", id)
      .eq("soort", "lopend"),
    supabase.from("landgoed").select("rechtsvorm").eq("id", id).maybeSingle(),
    supabase.from("stamobject").select("categorie").eq("landgoed_id", id),
    supabase.from("relatie").select("type").eq("landgoed_id", id),
    supabase.from("gesprek").select("id", { count: "exact", head: true }).eq("landgoed_id", id),
  ]);

  if (docFout) throw new Error(`documenten ophalen mislukt: ${docFout.message}`);

  const alle = documenten ?? [];

  // Een niet-geaccordeerd voorstel telt mee onder "Nog in te delen" — de indeling is
  // immers nog niet vastgesteld. Zo blijft de werkvoorraad ook zichtbaar voor wie de
  // bevestigingsstap bovenaan wegscrolt.
  const effectieveCategorie = (d: (typeof alle)[number]) =>
    d.categorie_geaccordeerd ? d.categorie : NOG_IN_TE_DELEN;

  // Bijlagen (foto bij een melding, meterstandfoto) tellen niet mee in het
  // hoofdoverzicht; ze zijn te zien via de schakelaar op de categoriepagina.
  const archiefstukken = alle.filter((d) => d.soort !== "bijlage");

  const perCategorie = new Map<string, DocumentFeit[]>();
  for (const d of archiefstukken) {
    const c = effectieveCategorie(d);
    const lijst = perCategorie.get(c) ?? [];
    lijst.push({ categorie: c, geldig_tot: d.geldig_tot, aangemaakt_op: d.aangemaakt_op });
    perCategorie.set(c, lijst);
  }

  const tellingen: Record<string, number> = {};
  for (const [c, lijst] of perCategorie) tellingen[c] = lijst.length;

  const zichtbaarheid = bepaalRelevantie(
    {
      heeftContracten: (aantalContracten ?? 0) > 0,
      heeftLopendeSubsidies: (aantalLopendeSubsidies ?? 0) > 0,
      rechtsvorm: landgoed?.rechtsvorm ?? null,
      heeftGebouwObjecten: (objecten ?? []).some((o) => isGebouwCategorie(o.categorie)),
      heeftGroenObjecten: (objecten ?? []).some((o) => isGroenCategorie(o.categorie)),
      heeftMedewerkers: (relaties ?? []).some((r) => isMedewerkerRol(r.type)),
      heeftGesprekken: (aantalGesprekken ?? 0) > 0,
    },
    tellingen,
  );

  // Signed URLs alleen voor de werkvoorraad: voor veertien blokken hoeft er niets
  // gedownload te worden, en een signed URL per document zou de pagina traag maken.
  const teBevestigen = alle.filter((d) => !d.categorie_geaccordeerd);
  const teBevestigenMetUrl = await Promise.all(
    teBevestigen.map(async (d) => {
      let url: string | null = null;
      if (d.bestand_pad) {
        const { data } = await supabase.storage
          .from("documenten")
          .createSignedUrl(d.bestand_pad, 3600);
        url = data?.signedUrl ?? null;
      }
      return {
        id: d.id,
        titel: d.titel,
        categorie: d.categorie,
        categorie_voorstel_reden: d.categorie_voorstel_reden,
        url,
      };
    }),
  );

  const werkvoorraad = perCategorie.get(NOG_IN_TE_DELEN) ?? [];

  // Notulen horen bij het archief, dus ze krijgen een eigen blok in het raster in
  // plaats van een losse knop rechtsboven. Ze zijn geen document-rij maar leven in
  // gesprek_bewerking; het blok linkt door naar de notulen-tab. Een verslag dat
  // definitief is gemaakt verschijnt daarnáást als archiefstuk onder "Vergaderingen
  // en verslagen" — dat blok gaat over vastgelegde stukken, dit over de AI-output.
  const { gesprekken: notulenGesprekken } = await haalNotulen(supabase, id);
  const metNotulen = notulenGesprekken.filter((g) => g.notulen.length > 0);
  const notulenAantal = metNotulen.reduce((n, g) => n + g.notulen.length, 0);
  const laatsteNotule = metNotulen
    .map((g) => g.datum)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();

  // "Nog in te delen" staat vóór de rest — het is een werkvoorraad, geen onderwerp —
  // en verschijnt alleen als er iets in staat.
  const onderwerpen = CATEGORIEEN.filter((c) => c.sleutel !== NOG_IN_TE_DELEN);

  // Gevulde blokken eerst, dus linksboven. Waar het archief écht staat is het nieuws;
  // de lege blokken zijn een geheugensteun en horen daaronder. Binnen elke groep blijft
  // de volgorde van categorieen.ts staan, zodat een blok niet van plek springt zodra er
  // één document bijkomt. sort() is stabiel, dus dat volgt vanzelf.
  const getoond = onderwerpen
    .filter((c) => zichtbaarheid[c.sleutel] !== "verborgen")
    .sort(
      (a, b) =>
        Number(zichtbaarheid[b.sleutel] === "gevuld") -
        Number(zichtbaarheid[a.sleutel] === "gevuld"),
    );
  const verborgen = onderwerpen.filter((c) => zichtbaarheid[c.sleutel] === "verborgen");

  const notulenBlok = (
    <DocumentBlok
      key="notulen"
      href={`${basisPad}?tab=notulen`}
      icoon={IcoonMicrofoon}
      titel="Notulen"
      aantal={notulenAantal}
      uitleg="Verslagen die de AI maakte van vergaderingen en opnames. Maak er een definitief en hij komt ook als archiefstuk onder Vergaderingen en verslagen."
      signaal="grijs"
      eenheid={["verslag", "verslagen"]}
      signaalTekst={
        laatsteNotule
          ? `Laatste vergadering ${new Date(laatsteNotule).toLocaleDateString("nl-NL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}`
          : "Nog geen notulen"
      }
      gedempt={notulenAantal === 0}
    />
  );

  function blokVoor(sleutel: CategorieSleutel, label: string, uitleg: string) {
    const lijst = perCategorie.get(sleutel) ?? [];
    const { signaal, tekst } = bepaalSignaal(sleutel, lijst);
    return (
      <DocumentBlok
        key={sleutel}
        href={`${basisPad}/${sleutel}`}
        icoon={CATEGORIE_ICOON[sleutel]}
        titel={label}
        aantal={lijst.length}
        uitleg={uitleg}
        signaal={signaal}
        signaalTekst={tekst}
        // Alles wat leeg is wordt gedempt, of het nu in het raster staat of achter de
        // uitklap: het onderscheid dat telt is "hier zit iets in" versus "hier nog niet".
        gedempt={zichtbaarheid[sleutel] !== "gevuld"}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Documenten
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold">Documenten</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Eén archief, op onderwerp. Een document bestaat één keer en duikt op waar
              het hoort — bij het contract, bij het object én hier.
            </p>
          </div>
          {alle.length > 0 && (
            <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
              {archiefstukken.length}{" "}
              {archiefstukken.length === 1 ? "archiefstuk" : "archiefstukken"}
              {alle.length !== archiefstukken.length &&
                ` · ${alle.length - archiefstukken.length} bijlagen`}
            </div>
          )}
        </header>

        {alle.length === 0 ? (
          // ── Startscherm. Dit is wat elke nieuwe gebruiker als eerste ziet, dus geen
          // leeg raster van veertien vakken maar één concrete eerste stap.
          <div className="card p-6">
            <h2 className="text-[15px] font-semibold">Begin bij de basis</h2>
            <p className="mt-1 max-w-[62ch] text-[13px]" style={{ color: "var(--text-2)" }}>
              Twee stapels maken het archief meteen bruikbaar: de{" "}
              <strong>eigendomsstukken</strong> (akte van levering, kadastrale uittreksels,
              erfdienstbaarheden) en de <strong>lopende contracten</strong> (pacht, huur,
              jachthuur). Daarmee staat vast wat van wie is en welke afspraken er lopen —
              de rest hangt daaraan.
            </p>
            <p className="mt-3 max-w-[62ch] text-[13px]" style={{ color: "var(--text-2)" }}>
              Je hoeft geen categorie te kiezen: de AI doet een voorstel op basis van de
              inhoud en jij bevestigt het met één klik.
            </p>
            <div className="mt-5">
              <UploadFormulier landgoedId={id} />
            </div>
          </div>
        ) : (
          <>
            <UploadFormulier landgoedId={id} />

            <CategorieReview
              voorstellen={teBevestigenMetUrl}
              landgoedId={id}
              accordeerCategorie={accordeerCategorie}
            />

            {/* Werkvoorraad-blok: alleen als er iets in staat, en dan bovenaan. */}
            {werkvoorraad.length > 0 && (
              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {blokVoor(
                  NOG_IN_TE_DELEN,
                  "Nog in te delen",
                  "Stukken waarvan de categorie nog niet bevestigd is. Werk deze bak leeg en de rest van het archief klopt.",
                )}
                <div className="card flex flex-col justify-center gap-3 p-5">
                  <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                    De AI kan de onbekende stukken alsnog langslopen en per stuk een
                    categorie voorstellen. Je bevestigt ze daarna hierboven.
                  </div>
                  <form action={herclassificeerOnbekende}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Laat de AI voorstellen doen
                    </button>
                  </form>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {notulenAantal > 0 && notulenBlok}
              {getoond.map((c) => blokVoor(c.sleutel, c.label, c.omschrijving))}
              {notulenAantal === 0 && notulenBlok}
            </div>

            {verborgen.length > 0 && (
              <details className="mt-5">
                <summary className="cursor-pointer text-[13px]" style={{ color: "var(--text-2)" }}>
                  Toon alle categorieën ({verborgen.length} nog niet in beeld)
                </summary>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {verborgen.map((c) => blokVoor(c.sleutel, c.label, c.omschrijving))}
                </div>
              </details>
            )}

            <div className="mt-4 text-[12px]" style={{ color: "var(--text-3)" }}>
              Gedempte blokken zijn leeg maar horen bij dit landgoed — een openstaand gat,
              geen fout.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
