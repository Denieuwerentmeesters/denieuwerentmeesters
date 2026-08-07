import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MeldlinkKaart } from "./MeldlinkKaart";
import { nieuweWerkorder, accordeerWerkorderVoorstel, drempelbedragInstellen } from "../actions";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import { LocatieVeld } from "@/components/LocatieVeld";

const STATUS_LABEL: Record<string, string> = {
  gemeld: "Gemeld",
  beoordelen: "Beoordelen",
  toegewezen: "Toegewezen",
  in_uitvoering: "In uitvoering",
  wacht_op: "Wacht op…",
  klaar: "Klaar",
  geannuleerd: "Geannuleerd",
};

const STATUS_TAG: Record<string, string> = {
  gemeld: "tag-blue",
  beoordelen: "tag-amber",
  toegewezen: "tag-blue",
  in_uitvoering: "tag-amber",
  wacht_op: "tag-red",
  klaar: "tag-green",
  geannuleerd: "tag-gray",
};

// Sortering "wat aandacht vraagt" (bronplan hfst 7.2): nieuw eerst, dan
// gepland/in uitvoering, dan wachtend, dan afgerond/geannuleerd onderaan.
const STATUS_VOLGORDE: Record<string, number> = {
  gemeld: 0,
  beoordelen: 1,
  wacht_op: 2,
  toegewezen: 3,
  in_uitvoering: 4,
  klaar: 5,
  geannuleerd: 6,
};

export default async function WerkordersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: werkordersRaw } = await supabase
    .from("werkorder")
    .select("id, titel, prioriteit, status, deadline, wacht_reden, toegewezen_aan, toegewezen_aan_naam, aangemaakt_op, ai_voorstel, ai_voorstel_status, profiel!werkorder_toegewezen_aan_fkey(naam, email), stamobject(id, naam)")
    .eq("landgoed_id", id);

  const werkorders = (werkordersRaw ?? []).slice().sort((a, b) => {
    const va = STATUS_VOLGORDE[a.status] ?? 9;
    const vb = STATUS_VOLGORDE[b.status] ?? 9;
    if (va !== vb) return va - vb;
    return a.aangemaakt_op < b.aangemaakt_op ? 1 : -1; // ouder eerst binnen dezelfde status
  });

  const { data: landgoed } = await supabase
    .from("landgoed")
    .select("meld_token, werkorder_drempelbedrag")
    .eq("id", id)
    .maybeSingle();

  const { data: rol } = await supabase.rpc("rol_op", { doel_landgoed: id });
  const isEigenaar = rol === "eigenaar";

  // Volledige URL, want een kaal pad is niet te delen met een huurder.
  const kop = await headers();
  const host = kop.get("host") ?? "";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const basisUrl = `${protocol}://${host}`;

  const [ledenRaw, relatiesRaw, objectenRaw] = await Promise.all([
    supabase.from("lidmaatschap").select("gebruiker_id, profiel(id, naam, email)").eq("landgoed_id", id),
    // Uitvoerders: contacten met een rol die 'werkorder' in koppelbaar_aan heeft.
    supabase
      .from("relatie")
      .select("id, naam, contact_rol!inner(rol_type!inner(koppelbaar_aan))")
      .eq("landgoed_id", id)
      .contains("contact_rol.rol_type.koppelbaar_aan", ["werkorder"])
      .order("naam"),
    // Alleen geaccordeerde objecten, net als op de kaart: een voorgesteld
    // object is nog geen feit en hoort niet als keuze in een formulier.
    supabase
      .from("stamobject")
      .select("id, naam, categorie")
      .eq("landgoed_id", id)
      .eq("geaccordeerd", true)
      .order("naam"),
  ]);
  const objecten = (objectenRaw.data ?? []) as { id: string; naam: string; categorie: string }[];

  const leden = (ledenRaw.data ?? []).map((l) => {
    const p = (l.profiel as unknown) as { id: string; naam: string | null; email: string | null } | null;
    return { id: p?.id ?? l.gebruiker_id, naam: p?.naam ?? p?.email ?? l.gebruiker_id };
  });
  const uitvoerderOpties = ((relatiesRaw.data ?? []) as { id: string; naam: string }[]).map((r) => ({
    waarde: `c:${r.id}`,
    naam: r.naam,
  }));
  const ledenOpties = leden.map((l) => ({ waarde: `u:${l.id}`, naam: l.naam }));

  // Vertaalt de "u:<uuid>"/"c:<naam>"-waarde uit het AI-voorstel naar een naam,
  // zodat het triage-blok toont wíe er wordt voorgesteld in plaats van alleen
  // "Akkoord" — blind akkoord geven op een onzichtbare keuze is geen keuze.
  const naamVoorWaarde = (waarde: string | null) =>
    waarde
      ? ([...ledenOpties, ...uitvoerderOpties].find((o) => o.waarde === waarde)?.naam ?? null)
      : null;

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Meldingen &amp; klussen
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Meldingen &amp; klussen</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Van melding tot afgerond werk — één kaartje dat meegroeit.
          </p>
        </header>

        <ToevoegenToggle label="melding toevoegen">
          <form action={nieuweWerkorder} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="flex-1 basis-full">
              <label className="label-up mb-1 block">Wat is er aan de hand?</label>
              <input className="input" name="titel" placeholder="Bijv. hek bij de weide is kapot" required />
            </div>
            <div className="flex-1 basis-full">
              <label className="label-up mb-1 block">Toelichting</label>
              <textarea className="input w-full" name="omschrijving" rows={2} />
            </div>
            <div>
              <label className="label-up mb-1 block">Prioriteit</label>
              <select className="input" name="prioriteit" defaultValue="">
                <option value="">—</option>
                <option value="hoog">Hoog</option>
                <option value="middel">Middel</option>
                <option value="laag">Laag</option>
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Deadline</label>
              <input className="input" type="date" name="deadline" />
            </div>
            <div>
              <label className="label-up mb-1 block">Uitvoerder</label>
              <select className="input" name="toegewezen_aan" defaultValue="">
                <option value="">— nog te bepalen —</option>
                {leden.length > 0 && (
                  <optgroup label="Gebruikers">
                    {leden.map((l) => (
                      <option key={l.id} value={`u:${l.id}`}>{l.naam}</option>
                    ))}
                  </optgroup>
                )}
                {uitvoerderOpties.length > 0 && (
                  <optgroup label="Uitvoerders">
                    {uitvoerderOpties.map((r) => (
                      <option key={r.waarde} value={r.waarde}>{r.naam}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <LocatieVeld />
            <div>
              <label className="label-up mb-1 block">Object</label>
              <select className="input" name="stamobject_id" defaultValue="">
                <option value="">— geen —</option>
                {objecten.map((o) => (
                  <option key={o.id} value={o.id}>{o.naam}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Foto&apos;s</label>
              <input className="input" type="file" name="fotos" accept="image/*" multiple />
            </div>
            <button type="submit" className="btn btn-primary">
              Toevoegen
            </button>
          </form>
        </ToevoegenToggle>

        {landgoed?.meld_token && (
          <MeldlinkKaart url={`${basisUrl}/melden/${landgoed.meld_token}`} />
        )}

        {isEigenaar && (
          <div className="card mb-5 p-4">
            <span className="label-up">Drempelbedrag voor akkoord</span>
            <form action={drempelbedragInstellen} className="mt-2 flex flex-wrap items-end gap-3">
              <input type="hidden" name="landgoed_id" value={id} />
              <input
                className="input"
                type="number"
                step="1"
                min="0"
                name="drempelbedrag"
                defaultValue={landgoed?.werkorder_drempelbedrag ?? 500}
              />
              <button type="submit" className="btn btn-ghost btn-sm">Opslaan</button>
              <span className="text-[12px]" style={{ color: "var(--text-2)" }}>
                Boven dit bedrag wacht een klus op uw akkoord voordat er geld wordt uitgegeven.
              </span>
            </form>
          </div>
        )}

        <div className="card mt-5 divide-y" style={{ borderColor: "var(--border)" }}>
          {werkorders.length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen meldingen of klussen.
            </div>
          )}
          {werkorders.map((w) => {
            const persoon = (w.profiel as unknown) as { naam: string | null; email: string | null } | null;
            const uitvoerderNaam = persoon?.naam ?? persoon?.email ?? w.toegewezen_aan_naam;
            const voorstel = w.ai_voorstel as { uitvoerder_waarde: string | null; urgentie: string; toelichting: string } | null;
            const toonTriage = w.status === "beoordelen" && w.ai_voorstel_status === "voorgesteld" && voorstel;
            return (
              <div key={w.id} className="flex flex-col gap-2 px-5 py-3.5" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <a href={`/landgoed/${id}/werkorder/${w.id}`} className="text-[14px] font-semibold hover:underline">
                      {w.titel}
                    </a>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
                      <span className={`tag ${STATUS_TAG[w.status] ?? "tag-gray"}`}>
                        {STATUS_LABEL[w.status] ?? w.status}
                      </span>
                      {w.status === "wacht_op" && w.wacht_reden && <span>({w.wacht_reden})</span>}
                      {(() => {
                        const obj = (w.stamobject as unknown) as { id: string; naam: string } | null;
                        return obj ? <span>📍 {obj.naam}</span> : null;
                      })()}
                      {w.deadline && <span>Deadline {w.deadline}</span>}
                      {uitvoerderNaam && <span>👤 {uitvoerderNaam}</span>}
                      {w.prioriteit && (
                        <span className={`tag ${w.prioriteit === "hoog" ? "tag-red" : "tag-gray"}`}>
                          {w.prioriteit}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Expliciete actieknop naast de titel-link: een titel die
                      toevallig klikbaar is, is geen zichtbare uitweg. */}
                  <a href={`/landgoed/${id}/werkorder/${w.id}`} className="btn btn-ghost btn-sm">
                    Bekijk
                  </a>
                </div>
                {toonTriage && (() => {
                  const voorgesteld = naamVoorWaarde(voorstel.uitvoerder_waarde);
                  return (
                    <div className="rounded-[8px] p-3 text-[12.5px]" style={{ background: "var(--bg)" }}>
                      <div style={{ color: "var(--text-2)" }}>
                        → AI-voorstel ({voorstel.urgentie}):{" "}
                        {voorgesteld ? <strong>{voorgesteld}</strong> : <strong>geen uitvoerder voorgesteld</strong>}
                        {" — "}
                        {voorstel.toelichting}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {/* Akkoord alleen als er iets is om akkoord op te geven:
                            zonder voorgestelde uitvoerder zou de klus op
                            "Toegewezen" komen met niemand erop. */}
                        {voorgesteld && (
                          <form action={accordeerWerkorderVoorstel}>
                            <input type="hidden" name="landgoed_id" value={id} />
                            <input type="hidden" name="id" value={w.id} />
                            <button type="submit" className="btn btn-primary btn-sm">
                              Akkoord — {voorgesteld}
                            </button>
                          </form>
                        )}
                        <a
                          href={`/landgoed/${id}/werkorder/${w.id}`}
                          className={`btn btn-sm ${voorgesteld ? "btn-ghost" : "btn-primary"}`}
                        >
                          Aanpassen
                        </a>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
