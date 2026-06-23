import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { vraagHulp } from "../acties";

function dagenTot(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

type Regeling = {
  samenvatting: string | null;
  bron_url: string | null;
  organisatie: string | null;
  bestuurslaag: string | null;
  scope: string | null;
  provincie: string | null;
  status: string | null;
  themas: string[] | null;
  is_nieuw: boolean;
  is_tijdelijk: boolean;
  openstelling_van: string | null;
  openstelling_tot: string | null;
} | null;

export default async function SubsidieDetailPage({
  params,
}: {
  params: Promise<{ id: string; subsidieId: string }>;
}) {
  const { id, subsidieId } = await params;
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("subsidie")
    .select(
      "id, naam, organisatie, categorie, bedrag_indicatie, status, deadline, soort, match_score, redenering, al_in_gebruik, werkstap, regeling_id, regeling:regeling_id (samenvatting, bron_url, organisatie, bestuurslaag, scope, provincie, status, themas, is_nieuw, is_tijdelijk, openstelling_van, openstelling_tot)",
    )
    .eq("id", subsidieId)
    .eq("landgoed_id", id)
    .maybeSingle();

  if (!s) notFound();
  const r = s.regeling as unknown as Regeling;

  const { data: lg } = await supabase
    .from("landgoed")
    .select("naam")
    .eq("id", id)
    .maybeSingle();
  const naam = lg?.naam ?? "dit landgoed";

  // §7-lagen (alleen als er een catalogus-regeling achter zit).
  const [{ data: criteria }, { data: maatregelen }, { data: bewijs }, { data: verbanden }] =
    await Promise.all([
      s.regeling_id
        ? supabase.from("regeling_criterium").select("omschrijving, verplicht, geaccordeerd").eq("regeling_id", s.regeling_id)
        : Promise.resolve({ data: [] }),
      s.regeling_id
        ? supabase.from("regeling_maatregel").select("omschrijving, eenheid, geaccordeerd").eq("regeling_id", s.regeling_id)
        : Promise.resolve({ data: [] }),
      s.regeling_id
        ? supabase.from("regeling_bewijs").select("omschrijving, document_type, geaccordeerd").eq("regeling_id", s.regeling_id)
        : Promise.resolve({ data: [] }),
      supabase
        .from("verband")
        .select("rol, doel_id")
        .eq("bron_type", "subsidie")
        .eq("bron_id", subsidieId)
        .eq("doel_type", "relatie"),
    ]);

  // Uitvoerders los ophalen (verband.doel_id is polymorf, geen FK om te embedden).
  const relIds = (verbanden ?? []).map((v) => v.doel_id);
  const { data: relaties } = relIds.length
    ? await supabase.from("relatie").select("id, naam, contact").in("id", relIds)
    : { data: [] as { id: string; naam: string; contact: string | null }[] };
  const uitvoerders = (verbanden ?? []).map((v) => ({
    rol: v.rol as string | null,
    relatie: (relaties ?? []).find((r) => r.id === v.doel_id) ?? null,
  }));

  const isKans = s.soort === "kans";
  const kansrijk = (s.match_score ?? 0) >= 70;
  const d = dagenTot(s.deadline);

  const Sectie = ({ titel, children }: { titel: string; children: ReactNode }) => (
    <section className="card mb-4 p-5">
      <h2 className="mb-3 text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
        {titel}
      </h2>
      {children}
    </section>
  );

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <Link href={`/landgoed/${id}/subsidies`} className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          ← Subsidies
        </Link>
      </div>

      <div className="p-7" style={{ maxWidth: 760 }}>
        <header className="mb-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`tag ${isKans ? "tag-blue" : "tag-green"}`}>
              {isKans ? "Kans" : "Lopend"}
            </span>
            {isKans && (
              <span className={`tag ${kansrijk ? "tag-green" : "tag-gray"}`}>
                {kansrijk ? "Kansrijk" : "Mogelijk — te checken"}
              </span>
            )}
            {r?.is_nieuw && <span className="tag tag-blue">Nieuw</span>}
            {r?.is_tijdelijk && <span className="tag tag-red">Tijdelijk / beperkt budget</span>}
            {s.al_in_gebruik && <span className="tag tag-gray">Al in gebruik</span>}
            {r?.scope === "provinciaal" && <span className="tag tag-gray">provinciaal</span>}
          </div>
          <h1 className="text-[22px] font-bold leading-tight">{s.naam}</h1>
          <div className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            {[s.organisatie ?? r?.organisatie, s.bedrag_indicatie].filter(Boolean).join(" · ")}
          </div>
        </header>

        {/* Waarom interessant */}
        <Sectie titel={isKans ? `Waarom dit interessant is voor ${naam}` : "Status"}>
          <p className="text-[14px]">
            {s.redenering ?? (isKans ? "Relevant op basis van het landgoedprofiel." : "Lopende subsidie.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-[13px]" style={{ color: "var(--text-2)" }}>
            {typeof s.match_score === "number" && <span>Matchscore: <b>{s.match_score}</b>/100</span>}
            {s.deadline && (
              <span>
                Deadline: <b>{s.deadline}</b>
                {d !== null && d >= 0 && d <= 60 ? ` (nog ${d} d)` : ""}
              </span>
            )}
            {r?.status && <span>Status regeling: {r.status}</span>}
          </div>
        </Sectie>

        {/* Over de regeling */}
        {(r?.samenvatting || r?.bron_url || (r?.themas?.length ?? 0) > 0) && (
          <Sectie titel="Over de regeling">
            {r?.samenvatting && <p className="text-[14px]">{r.samenvatting}</p>}
            {(r?.themas?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r!.themas!.map((t) => (
                  <span key={t} className="tag tag-gray">{t}</span>
                ))}
              </div>
            )}
            {(r?.openstelling_van || r?.openstelling_tot) && (
              <div className="mt-3 text-[13px]" style={{ color: "var(--text-2)" }}>
                Openstelling: {r?.openstelling_van ?? "?"} – {r?.openstelling_tot ?? "?"}
              </div>
            )}
            {r?.bron_url && (
              <a href={r.bron_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[13px]" style={{ color: "var(--accent, #2563eb)" }}>
                Bekijk de officiële regeling →
              </a>
            )}
          </Sectie>
        )}

        {/* §7: Criteria */}
        <Sectie titel="Waaraan moet je voldoen (criteria)">
          {(criteria ?? []).length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
              Nog niet verrijkt — criteria volgen uit de AI-verrijking of handmatige aanvulling.
            </p>
          ) : (
            <ul className="space-y-1.5 text-[14px]">
              {(criteria ?? []).map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: "var(--text-3)" }}>•</span>
                  <span>
                    {c.omschrijving}
                    {!c.geaccordeerd && <span className="ml-2 tag tag-gray">voorstel</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sectie>

        {/* §7: Beheersmaatregelen */}
        {(maatregelen ?? []).length > 0 && (
          <Sectie titel="Wat je concreet moet doen (beheersmaatregelen)">
            <ul className="space-y-1.5 text-[14px]">
              {(maatregelen ?? []).map((m, i) => (
                <li key={i}>• {m.omschrijving}{m.eenheid ? ` (${m.eenheid})` : ""}</li>
              ))}
            </ul>
          </Sectie>
        )}

        {/* §7: Documentatie */}
        {(bewijs ?? []).length > 0 && (
          <Sectie titel="Benodigde documentatie">
            <ul className="space-y-1.5 text-[14px]">
              {(bewijs ?? []).map((b, i) => (
                <li key={i}>• {b.omschrijving}{b.document_type ? ` — ${b.document_type}` : ""}</li>
              ))}
            </ul>
          </Sectie>
        )}

        {/* Uitvoerders (vooral bij lopend) */}
        {(uitvoerders ?? []).length > 0 && (
          <Sectie titel="Betrokken partijen">
            <ul className="space-y-1.5 text-[14px]">
              {(uitvoerders ?? []).map((u, i) => {
                const rel = u.relatie as { naam: string; contact: string | null } | null;
                return (
                  <li key={i}>
                    {rel?.naam}
                    {rel?.contact ? ` — ${rel.contact}` : ""}
                    {u.rol ? <span className="ml-2 tag tag-gray">{u.rol}</span> : null}
                  </li>
                );
              })}
            </ul>
          </Sectie>
        )}

        {/* Hulp nodig? */}
        {isKans && (
          <form action={vraagHulp} className="mt-2">
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="subsidie_id" value={s.id} />
            <input type="hidden" name="naam" value={s.naam} />
            <button type="submit" className="btn btn-primary">
              Hulp nodig? Laat De Nieuwe Rentmeesters dit uitzoeken
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
