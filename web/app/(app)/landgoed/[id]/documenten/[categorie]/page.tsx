import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadFormulier } from "../UploadFormulier";
import { accordeerCategorie, verwijderDocument, wijzigCategorie } from "../acties";
import { VerwijderKnop } from "@/components/VerwijderKnop";
import { haalNotulen } from "@/lib/notulen";
import { NotulenOverzicht } from "@/components/NotulenOverzicht";
import {
  CATEGORIEEN,
  NOG_IN_TE_DELEN,
  categorieLabel,
  categorieOmschrijving,
  isCategorie,
} from "../categorieen";

// De lijst achter één blok. Standaard alleen archiefstukken; bijlagen (foto's bij een
// melding, meterstandfoto's) staan achter een schakelaar, zodat ze het archief niet
// overwoekeren maar wel vindbaar blijven.

const DOEL_LABEL: Record<string, string> = {
  stamobject: "object",
  contract: "contract",
  subsidie: "subsidie",
  relatie: "contact",
  gesprek: "vergadering",
  perceel: "perceel",
};

export default async function CategoriePagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; categorie: string }>;
  searchParams: Promise<{ bijlagen?: string; q?: string; van?: string; tot?: string }>;
}) {
  const { id, categorie } = await params;
  const { bijlagen, q, van, tot } = await searchParams;
  if (!isCategorie(categorie)) notFound();

  const toonBijlagen = bijlagen === "1";
  const basisPad = `/landgoed/${id}/documenten`;
  const supabase = await createClient();

  // Niet-geaccordeerde voorstellen horen bij "Nog in te delen", niet bij de categorie
  // die de AI voorstelde — anders zou een onbevestigd voorstel de lijst vervuilen.
  // Daarom filteren we in geheugen op de effectieve categorie in plaats van in de query.
  const { data: rijen, error } = await supabase
    .from("document")
    .select(
      "id, titel, samenvatting, bestand_pad, categorie, categorie_geaccordeerd, categorie_voorstel_reden, is_leidend, geldig_tot, soort, vertrouwelijkheid, aangemaakt_op, document_koppeling(doel_soort, doel_id)",
    )
    .eq("landgoed_id", id)
    .or(
      categorie === NOG_IN_TE_DELEN
        ? `categorie.eq.${NOG_IN_TE_DELEN},categorie_geaccordeerd.eq.false`
        : `categorie.eq.${categorie}`,
    )
    .order("aangemaakt_op", { ascending: false });

  if (error) throw new Error(`documenten ophalen mislukt: ${error.message}`);

  const inCategorie = (rijen ?? []).filter((d) =>
    categorie === NOG_IN_TE_DELEN
      ? !d.categorie_geaccordeerd || d.categorie === NOG_IN_TE_DELEN
      : d.categorie_geaccordeerd && d.categorie === categorie,
  );

  const zichtbaar = toonBijlagen
    ? inCategorie
    : inCategorie.filter((d) => d.soort !== "bijlage");
  const aantalBijlagen = inCategorie.filter((d) => d.soort === "bijlage").length;

  // Leidende stukken bovenaan: de beschikking vóór de begeleidende brief.
  const gesorteerd = [...zichtbaar].sort(
    (a, b) => Number(b.is_leidend) - Number(a.is_leidend),
  );

  const metUrl = await Promise.all(
    gesorteerd.map(async (d) => {
      let url: string | null = null;
      if (d.bestand_pad) {
        const { data } = await supabase.storage
          .from("documenten")
          .createSignedUrl(d.bestand_pad, 3600);
        url = data?.signedUrl ?? null;
      }
      return { ...d, url };
    }),
  );

  const nu = Date.now();

  // Notulen staan niet in de documententabel maar in gesprek_bewerking. Ze horen wél
  // in deze categorie thuis, dus ze komen hier onder de archiefstukken te staan —
  // anders leidt het blok naar een lege pagina terwijl er notulen zijn.
  const { gesprekken: notulen, fout: notulenFout } =
    categorie === "vergaderingen"
      ? await haalNotulen(supabase, id, { titel: q, van, tot })
      : { gesprekken: [], fout: null };

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-between gap-4 bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          <Link href={basisPad}>Documenten</Link> / {categorieLabel(categorie)}
        </div>
        <Link href={basisPad} className="btn btn-ghost btn-sm">
          ← Alle categorieën
        </Link>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">{categorieLabel(categorie)}</h1>
          <p className="mt-1 max-w-[70ch] text-[13px]" style={{ color: "var(--text-2)" }}>
            {categorieOmschrijving(categorie)}
          </p>
        </header>

        <UploadFormulier
          landgoedId={id}
          vasteCategorie={categorie === NOG_IN_TE_DELEN ? undefined : categorie}
        />

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
            {zichtbaar.length} {zichtbaar.length === 1 ? "stuk" : "stukken"}
          </span>
          {aantalBijlagen > 0 && (
            <Link
              href={toonBijlagen ? `${basisPad}/${categorie}` : `${basisPad}/${categorie}?bijlagen=1`}
              className="btn btn-ghost btn-sm"
            >
              {toonBijlagen
                ? "Verberg bijlagen"
                : `Toon ook ${aantalBijlagen} ${aantalBijlagen === 1 ? "bijlage" : "bijlagen"}`}
            </Link>
          )}
        </div>

        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {metUrl.length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog niets in deze categorie.
            </div>
          )}
          {metUrl.map((d) => {
            const koppelingen = (d.document_koppeling ?? []) as unknown as {
              doel_soort: string;
              doel_id: string;
            }[];
            const verlopen = d.geldig_tot && new Date(d.geldig_tot).getTime() < nu;

            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{d.titel}</span>
                    {d.is_leidend && <span className="tag tag-green">leidend stuk</span>}
                    {d.soort === "bijlage" && <span className="tag tag-gray">bijlage</span>}
                    {d.vertrouwelijkheid !== "normaal" && (
                      <span className="tag tag-blue">{d.vertrouwelijkheid}</span>
                    )}
                    {d.geldig_tot && (
                      <span className={`tag ${verlopen ? "tag-red" : "tag-amber"}`}>
                        {verlopen ? "verlopen" : "geldig tot"}{" "}
                        {new Date(d.geldig_tot).toLocaleDateString("nl-NL")}
                      </span>
                    )}
                    {!d.categorie_geaccordeerd && (
                      <span className="tag tag-amber">nog te bevestigen</span>
                    )}
                  </div>

                  <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-3)" }}>
                    {d.aangemaakt_op
                      ? new Date(d.aangemaakt_op).toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "datum onbekend"}
                    {koppelingen.length > 0 &&
                      ` · hoort bij ${koppelingen
                        .map((k) => DOEL_LABEL[k.doel_soort] ?? k.doel_soort)
                        .join(", ")}`}
                  </div>

                  {d.samenvatting && (
                    <div className="truncate text-[12px]" style={{ color: "var(--text-2)" }}>
                      {d.samenvatting}
                    </div>
                  )}
                  {!d.categorie_geaccordeerd && d.categorie_voorstel_reden && (
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-2)" }}>
                      AI-voorstel: {categorieLabel(d.categorie)} — {d.categorie_voorstel_reden}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <form action={wijzigCategorie} className="flex items-center gap-1">
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={d.id} />
                    <select className="input" name="categorie" defaultValue={d.categorie} aria-label="Verplaats naar categorie">
                      {CATEGORIEEN.map((c) => (
                        <option key={c.sleutel} value={c.sleutel}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {!d.categorie_geaccordeerd && (
                      <button type="submit" formAction={accordeerCategorie} className="btn btn-primary btn-sm">
                        Bevestigen
                      </button>
                    )}
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Verplaats
                    </button>
                  </form>
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                      Openen
                    </a>
                  )}
                  <form action={verwijderDocument}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="pad" value={d.bestand_pad ?? ""} />
                    <VerwijderKnop vraag={`"${d.titel}"`} />
                  </form>
                </div>
              </div>
            );
          })}
        </div>

        {categorie === "vergaderingen" && (
          <section className="mt-8">
            <h2 className="text-[15px] font-semibold">Notulen uit de vergadermodule</h2>
            <p className="mt-1 mb-4 max-w-[70ch] text-[13px]" style={{ color: "var(--text-2)" }}>
              Deze verslagen maakte de AI bij een gesprek. Ze blijven bij de vergadering
              horen; maak er een definitief en hij komt hierboven ook als archiefstuk te
              staan.
            </p>
            {notulenFout ? (
              <div className="card p-5 text-[13px]" style={{ color: "var(--red)" }}>
                Notulen ophalen mislukt: {notulenFout}
              </div>
            ) : (
              <NotulenOverzicht
                gesprekken={notulen}
                landgoedId={id}
                actie={`${basisPad}/vergaderingen`}
                q={q ?? ""}
                van={van ?? ""}
                tot={tot ?? ""}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
