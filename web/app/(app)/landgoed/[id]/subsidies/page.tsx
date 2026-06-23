import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  nieuweSubsidie,
  zoekKansenActie,
  leesLopendeUitDocument,
} from "./acties";

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

type RegelingMini = {
  is_nieuw: boolean;
  is_tijdelijk: boolean;
  openstelling_tot: string | null;
  scope: string;
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
  regeling: RegelingMini;
};

export default async function SubsidiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: subsidies }, { data: catTel }, { data: laatsteRun }, { data: docs }] =
    await Promise.all([
      supabase
        .from("subsidie")
        .select(
          "id, naam, organisatie, categorie, bedrag_indicatie, status, deadline, soort, match_score, redenering, al_in_gebruik, regeling:regeling_id (is_nieuw, is_tijdelijk, openstelling_tot, scope)",
        )
        .eq("landgoed_id", id)
        .order("match_score", { ascending: false, nullsFirst: false }),
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
    ]);

  const rijen = (subsidies ?? []) as unknown as SubsidieRij[];
  const lopend = rijen.filter((s) => s.soort === "lopend");
  const kansen = rijen
    .filter((s) => s.soort === "kans")
    .sort((a, b) => {
      const w = (x: SubsidieRij) =>
        (x.regeling?.is_nieuw ? 2 : 0) + (x.regeling?.is_tijdelijk ? 1 : 0);
      if (w(b) !== w(a)) return w(b) - w(a);
      return (b.match_score ?? 0) - (a.match_score ?? 0);
    });

  const catTotaal = (catTel ?? []).length;
  const catGeaccordeerd = (catTel ?? []).filter((r) => r.geaccordeerd).length;

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
            Twee sporen: lopende subsidies beheren en kansen ontdekken.
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

        {/* ── Spoor 1: Lopend ── */}
        <section className="mb-8">
          <h2 className="mb-2 text-[15px] font-semibold">Lopende subsidies</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            Wat er nu loopt — beheren, voldoen aan eisen, verantwoorden.
          </p>

          <form
            action={nieuweSubsidie}
            className="card mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4"
          >
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="col-span-2">
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
          <h2 className="mb-2 text-[15px] font-semibold">Subsidiekansen</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            Heat map: waar valt mogelijk iets te halen. Nieuw &amp; tijdelijk bovenaan.
          </p>

          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {kansen.length === 0 && (
              <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen kansen gevonden. Klik op &ldquo;Zoek kansen&rdquo; zodra de catalogus
                gevuld en geaccordeerd is.
              </div>
            )}
            {kansen.map((s) => {
              const d = dagenTot(s.deadline);
              const urgent = d !== null && d >= 0 && d <= 30;
              const kansrijk = (s.match_score ?? 0) >= 70;
              return (
                <Link
                  key={s.id}
                  href={`/landgoed/${id}/subsidies/${s.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.02]"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold">{s.naam}</span>
                      {typeof s.match_score === "number" && (
                        <span className={`tag ${kansrijk ? "tag-green" : "tag-gray"}`}>
                          {kansrijk ? "Kansrijk" : "Mogelijk"}
                        </span>
                      )}
                      {s.regeling?.is_nieuw && <span className="tag tag-blue">Nieuw</span>}
                      {s.regeling?.is_tijdelijk && (
                        <span className="tag tag-red">Tijdelijk / beperkt budget</span>
                      )}
                      {s.regeling?.scope === "provinciaal" && (
                        <span className="tag tag-gray">provinciaal</span>
                      )}
                    </div>
                    {s.redenering && (
                      <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                        {s.redenering}
                      </div>
                    )}
                  </div>
                  {s.deadline && (
                    <span className={`tag ${urgent ? "tag-red" : "tag-gray"}`}>
                      {urgent ? `nog ${d} d` : s.deadline}
                    </span>
                  )}
                  <span style={{ color: "var(--text-3)" }}>→</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
