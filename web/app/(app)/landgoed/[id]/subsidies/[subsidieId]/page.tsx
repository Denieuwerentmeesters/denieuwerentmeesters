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
  budget_indicatie: string | null;
  doelgroep_type: string | null;
  categorie_ui: string | null;
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
      "id, naam, organisatie, categorie, bedrag_indicatie, status, deadline, soort, match_score, redenering, al_in_gebruik, werkstap, regeling_id, regeling:regeling_id (samenvatting, bron_url, organisatie, bestuurslaag, scope, provincie, status, themas, is_nieuw, is_tijdelijk, openstelling_van, openstelling_tot, budget_indicatie, doelgroep_type, categorie_ui)",
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

  // Stamobjecten voor contextuele link
  const { data: stamobjecten } = await supabase
    .from("stamobject")
    .select("id, naam, categorie")
    .eq("landgoed_id", id)
    .order("categorie");

  // §7-lagen (alleen als er een catalogus-regeling achter zit).
  const [{ data: criteria }, { data: maatregelen }, { data: bewijs }, { data: verbanden }] =
    await Promise.all([
      s.regeling_id
        ? supabase.from("regeling_criterium").select("omschrijving, soort, veld, operator, waarde, gewicht, geaccordeerd").eq("regeling_id", s.regeling_id).order("soort", { ascending: true })
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

  // Stamobjecten filteren op basis van doelgroep_type en categorie_ui van de regeling
  const doelgroepType = r?.doelgroep_type ?? null;
  const categorieUi = r?.categorie_ui ?? null;

  const STAM_PER_CATEGORIE: Record<string, string[]> = {
    natuur: ["natuur", "bos", "water", "tuin"],
    klimaat_water: ["water", "natuur", "infrastructuur"],
    landbouw: ["pachtperceel"],
    gebouwen_erfgoed: ["gebouw", "woning"],
    energie: ["gebouw", "woning", "infrastructuur"],
    recreatie_platteland: ["tuin", "natuur", "infrastructuur", "gebouw"],
    financiering_fiscaal: [],
  };

  const relevanteCategorieen =
    doelgroepType === "pachter" || doelgroepType === "beiden"
      ? ["pachtperceel"]
      : (STAM_PER_CATEGORIE[categorieUi ?? ""] ?? []);

  const relevanteObjecten = (stamobjecten ?? []).filter(
    (obj) => relevanteCategorieen.length === 0 || relevanteCategorieen.includes(obj.categorie),
  );

  // Pachtpercelen samenvatten (te veel om allemaal te tonen)
  const pachtpercelen = relevanteObjecten.filter((o) => o.categorie === "pachtperceel");
  const overigeObjecten = relevanteObjecten.filter((o) => o.categorie !== "pachtperceel");

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

        {/* Waarom interessant voor dit landgoed */}
        <Sectie titel={isKans ? `Waarom dit interessant is voor ${naam}` : "Status"}>
          <p className="text-[14px] leading-relaxed">
            {s.redenering ?? (isKans ? "Relevant op basis van het landgoedprofiel." : "Lopende subsidie.")}
          </p>
          {typeof s.match_score === "number" && (
            <div className="mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
              Matchscore: {s.match_score}/100
            </div>
          )}
        </Sectie>

        {/* Op uw landgoed — welke objecten/percelen zijn relevant */}
        {relevanteObjecten.length > 0 && (
          <Sectie titel="Op uw landgoed">
            <p className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
              {doelgroepType === "pachter"
                ? "Deze regeling is bedoeld voor uw pachters, niet voor u als eigenaar. U kunt hen er wel op wijzen."
                : doelgroepType === "beiden"
                ? "Zowel u als uw pachters kunnen aanvragen."
                : "Passend bij deze onderdelen van uw landgoed:"}
            </p>
            {pachtpercelen.length > 0 && (
              <div className="mb-2 flex items-center gap-3">
                <span className="tag tag-amber shrink-0">pachtpercelen</span>
                <span className="text-[13px]">
                  {pachtpercelen.length} percelen — uw pachters kunnen dit aanvragen via een ANLb-collectief of rechtstreeks
                </span>
              </div>
            )}
            {overigeObjecten.map((obj) => (
              <div key={obj.id} className="mb-2 flex items-center gap-3">
                <span className="tag tag-gray shrink-0">{obj.categorie}</span>
                <span className="text-[13px]">{obj.naam}</span>
              </div>
            ))}
          </Sectie>
        )}

        {/* Wat dit oplevert — bedrag + aanvraagperiode */}
        {(r?.budget_indicatie || s.bedrag_indicatie || s.deadline || r?.openstelling_van || r?.openstelling_tot) && (
          <Sectie titel="Wat dit oplevert">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(r?.budget_indicatie || s.bedrag_indicatie) && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>
                    Vergoeding
                  </div>
                  <div className="text-[15px] font-semibold">
                    {r?.budget_indicatie ?? s.bedrag_indicatie}
                  </div>
                </div>
              )}
              {(s.deadline || r?.openstelling_tot) && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>
                    Aanvraag vóór
                  </div>
                  <div className={`text-[15px] font-semibold ${d !== null && d >= 0 && d <= 60 ? "text-red-600" : ""}`}>
                    {s.deadline ?? r?.openstelling_tot}
                    {d !== null && d >= 0 && d <= 60 && (
                      <span className="ml-2 tag tag-red">nog {d} d</span>
                    )}
                  </div>
                </div>
              )}
              {r?.openstelling_van && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>
                    Aanvraag vanaf
                  </div>
                  <div className="text-[15px] font-semibold">{r.openstelling_van}</div>
                </div>
              )}
              {r?.status && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>
                    Status
                  </div>
                  <div className="text-[15px] font-semibold">{r.status}</div>
                </div>
              )}
            </div>
          </Sectie>
        )}

        {/* Over de regeling */}
        {(r?.samenvatting || r?.bron_url || (r?.themas?.length ?? 0) > 0) && (
          <Sectie titel="Over de regeling">
            {r?.samenvatting && <p className="text-[14px] leading-relaxed">{r.samenvatting}</p>}
            {(r?.themas?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r!.themas!.map((t) => (
                  <span key={t} className="tag tag-gray">{t}</span>
                ))}
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
            <ul className="space-y-2 text-[14px]">
              {(criteria ?? [])
                .sort((a, b) => {
                  const volgorde: Record<string, number> = { eis: 0, uitsluiting: 1, pre: 2 };
                  return (volgorde[a.soort ?? ""] ?? 3) - (volgorde[b.soort ?? ""] ?? 3);
                })
                .map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {c.soort === "eis" && <span className="tag tag-red mt-0.5 shrink-0">eis</span>}
                    {c.soort === "uitsluiting" && <span className="tag tag-red mt-0.5 shrink-0">uitsluiting</span>}
                    {c.soort === "pre" && <span className="tag tag-green mt-0.5 shrink-0">pré</span>}
                    {!c.soort && <span style={{ color: "var(--text-3)" }} className="mt-0.5">•</span>}
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
