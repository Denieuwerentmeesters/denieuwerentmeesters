import { createClient } from "@/lib/supabase/server";
import { nieuweWerkorder } from "../actions";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";

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
    .select("id, titel, prioriteit, status, deadline, wacht_reden, toegewezen_aan, toegewezen_aan_naam, aangemaakt_op, profiel(naam, email)")
    .eq("landgoed_id", id);

  const werkorders = (werkordersRaw ?? []).slice().sort((a, b) => {
    const va = STATUS_VOLGORDE[a.status] ?? 9;
    const vb = STATUS_VOLGORDE[b.status] ?? 9;
    if (va !== vb) return va - vb;
    return a.aangemaakt_op < b.aangemaakt_op ? 1 : -1; // ouder eerst binnen dezelfde status
  });

  const [ledenRaw, relatiesRaw] = await Promise.all([
    supabase.from("lidmaatschap").select("gebruiker_id, profiel(id, naam, email)").eq("landgoed_id", id),
    // Uitvoerders: contacten met een rol die 'werkorder' in koppelbaar_aan heeft.
    supabase
      .from("relatie")
      .select("id, naam, contact_rol!inner(rol_type!inner(koppelbaar_aan))")
      .eq("landgoed_id", id)
      .contains("contact_rol.rol_type.koppelbaar_aan", ["werkorder"])
      .order("naam"),
  ]);

  const leden = (ledenRaw.data ?? []).map((l) => {
    const p = (l.profiel as unknown) as { id: string; naam: string | null; email: string | null } | null;
    return { id: p?.id ?? l.gebruiker_id, naam: p?.naam ?? p?.email ?? l.gebruiker_id };
  });
  const uitvoerderOpties = ((relatiesRaw.data ?? []) as { id: string; naam: string }[]).map((r) => ({
    value: `c:${r.naam}`,
    naam: r.naam,
  }));

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
                      <option key={r.value} value={r.value}>{r.naam}</option>
                    ))}
                  </optgroup>
                )}
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

        <div className="card mt-5 divide-y" style={{ borderColor: "var(--border)" }}>
          {werkorders.length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen meldingen of klussen.
            </div>
          )}
          {werkorders.map((w) => {
            const persoon = (w.profiel as unknown) as { naam: string | null; email: string | null } | null;
            const uitvoerderNaam = persoon?.naam ?? persoon?.email ?? w.toegewezen_aan_naam;
            return (
              <div key={w.id} className="flex items-center gap-3 px-5 py-3.5" style={{ borderColor: "var(--border)" }}>
                <div className="flex-1">
                  <a href={`/landgoed/${id}/werkorder/${w.id}`} className="text-[14px] font-semibold hover:underline">
                    {w.titel}
                  </a>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
                    <span className={`tag ${STATUS_TAG[w.status] ?? "tag-gray"}`}>
                      {STATUS_LABEL[w.status] ?? w.status}
                    </span>
                    {w.status === "wacht_op" && w.wacht_reden && <span>({w.wacht_reden})</span>}
                    {w.deadline && <span>Deadline {w.deadline}</span>}
                    {uitvoerderNaam && <span>👤 {uitvoerderNaam}</span>}
                    {w.prioriteit && (
                      <span className={`tag ${w.prioriteit === "hoog" ? "tag-red" : "tag-gray"}`}>
                        {w.prioriteit}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
