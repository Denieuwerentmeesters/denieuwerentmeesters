import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bewerkContact, voegRolToe, verwijderRol, maakRolType, archiveerContact } from "../acties";

const GROEP_LABEL: Record<string, string> = {
  relatie: "Relatie",
  dienstverlener: "Dienstverlener",
  instantie: "Instantie",
  overig: "Overig",
};

const STATUS_TAG: Record<string, string> = {
  actief: "tag-green",
  latent: "tag-gray",
  gearchiveerd: "tag-red",
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string; contactId: string }>;
}) {
  const { id, contactId } = await params;
  const supabase = await createClient();

  const [{ data: contact }, { data: rolTypen }] = await Promise.all([
    supabase
      .from("relatie")
      .select(`
        id, naam, organisatie, email, telefoon,
        verantwoordelijkheden, omschrijving, status, bron, aangemaakt_op,
        contact_rol(id, notitie, rol_type_id, rol_type(id, naam, groep))
      `)
      .eq("id", contactId)
      .eq("landgoed_id", id)
      .single(),
    supabase
      .from("rol_type")
      .select("id, naam, groep")
      .order("groep")
      .order("naam"),
  ]);

  if (!contact) notFound();

  // Wat ligt er bij dit contact? Kan alleen sinds de werkorder een échte
  // verwijzing naar de relatie heeft (uitvoerder_relatie_id, migratie 0067) —
  // op een losse naam valt niet betrouwbaar te filteren.
  const { data: klussen } = await supabase
    .from("werkorder")
    .select("id, titel, status, deadline, aangemaakt_op")
    .eq("landgoed_id", id)
    .eq("uitvoerder_relatie_id", contactId)
    .order("aangemaakt_op", { ascending: false });

  type RolRow = { id: string; notitie: string | null; rol_type_id: string; rol_type: { id: string; naam: string; groep: string } | null };
  const rollen = (contact.contact_rol ?? []) as unknown as RolRow[];
  const alleRolTypen = rolTypen ?? [];
  const gebruikteRolTypeIds = new Set(rollen.map((r) => r.rol_type_id));
  const beschikbareRolTypen = alleRolTypen.filter((r) => !gebruikteRolTypeIds.has(r.id));

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-2)" }}>
          <Link href={`/landgoed/${id}/contacten`} className="hover:underline">Contacten</Link>
          <span>/</span>
          <span>{contact.naam}</span>
        </div>
      </div>

      <div className="p-7 max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold">{contact.naam}</h1>
            {contact.organisatie && (
              <div className="mt-0.5 text-[14px]" style={{ color: "var(--text-2)" }}>{contact.organisatie}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`tag ${STATUS_TAG[contact.status] ?? "tag-gray"}`}>{contact.status}</span>
            {contact.status !== "gearchiveerd" && (
              <form action={archiveerContact}>
                <input type="hidden" name="landgoed_id" value={id} />
                <input type="hidden" name="contact_id" value={contactId} />
                <button type="submit" className="btn btn-ghost btn-sm text-[12px]">Archiveren</button>
              </form>
            )}
          </div>
        </div>

        {/* Rollen */}
        <section className="card mb-5 p-5">
          <div className="mb-3 text-[13px] font-semibold">Rollen</div>
          {rollen.length === 0 && (
            <div className="mb-3 text-[13px]" style={{ color: "var(--text-3)" }}>Geen rollen toegewezen.</div>
          )}
          {rollen.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {rollen.map((r) => (
                <div key={r.id} className="flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: "var(--border)" }}>
                  <span className="text-[13px] font-medium">{r.rol_type?.naam ?? "—"}</span>
                  {r.notitie && (
                    <span className="text-[12px]" style={{ color: "var(--text-3)" }}>— {r.notitie}</span>
                  )}
                  <form action={verwijderRol} className="ml-1">
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="contact_id" value={contactId} />
                    <input type="hidden" name="contact_rol_id" value={r.id} />
                    <button type="submit" className="text-[11px] leading-none" style={{ color: "var(--text-3)" }} title="Verwijder rol">×</button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {/* Rol toevoegen */}
          {beschikbareRolTypen.length > 0 && (
            <form action={voegRolToe} className="flex flex-wrap gap-2">
              <input type="hidden" name="landgoed_id" value={id} />
              <input type="hidden" name="contact_id" value={contactId} />
              <select className="input text-[13px]" name="rol_type_id" required defaultValue="">
                <option value="" disabled>Kies rol…</option>
                {Object.entries(
                  beschikbareRolTypen.reduce<Record<string, typeof beschikbareRolTypen>>((acc, r) => {
                    (acc[r.groep] = acc[r.groep] ?? []).push(r);
                    return acc;
                  }, {})
                ).map(([groep, items]) => (
                  <optgroup key={groep} label={GROEP_LABEL[groep] ?? groep}>
                    {items.map((r) => (
                      <option key={r.id} value={r.id}>{r.naam}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <input className="input flex-1 text-[13px]" name="notitie" placeholder="Notitie (optioneel)" />
              <button type="submit" className="btn btn-sm">Toevoegen</button>
            </form>
          )}

          {/* Nieuwe rol-type aanmaken */}
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px]" style={{ color: "var(--text-2)" }}>
              Nieuwe rol-type aanmaken
            </summary>
            <form action={maakRolType} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="landgoed_id" value={id} />
              <input type="hidden" name="contact_id" value={contactId} />
              <input className="input text-[13px]" name="naam" placeholder="Naam rol-type" required />
              <select className="input text-[13px]" name="groep" defaultValue="overig">
                {Object.entries(GROEP_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-sm">Aanmaken & koppelen</button>
            </form>
          </details>
        </section>

        {/* Meldingen & klussen die bij dit contact liggen */}
        {(klussen ?? []).length > 0 && (
          <section className="card mb-5 p-5">
            <div className="mb-3 text-[13px] font-semibold">Meldingen &amp; klussen</div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {(klussen ?? []).map((k) => (
                <div key={k.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1">
                    <div className="text-[13.5px] font-semibold">{k.titel}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
                      <span>{k.status}</span>
                      {k.deadline && <span>Deadline {k.deadline}</span>}
                    </div>
                  </div>
                  <a href={`/landgoed/${id}/werkorder/${k.id}`} className="btn btn-ghost btn-sm">
                    Bekijk
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contactgegevens bewerken */}
        <section className="card p-5">
          <div className="mb-3 text-[13px] font-semibold">Gegevens</div>
          <form action={bewerkContact} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="landgoed_id" value={id} />
            <input type="hidden" name="contact_id" value={contactId} />

            <div>
              <label className="label-up mb-1 block">Naam</label>
              <input className="input" name="naam" defaultValue={contact.naam} required />
            </div>
            <div>
              <label className="label-up mb-1 block">Organisatie</label>
              <input className="input" name="organisatie" defaultValue={contact.organisatie ?? ""} />
            </div>
            <div>
              <label className="label-up mb-1 block">E-mail</label>
              <input className="input" name="email" type="email" defaultValue={contact.email ?? ""} />
            </div>
            <div>
              <label className="label-up mb-1 block">Telefoon</label>
              <input className="input" name="telefoon" defaultValue={contact.telefoon ?? ""} />
            </div>
            <div>
              <label className="label-up mb-1 block">Status</label>
              <select className="input" name="status" defaultValue={contact.status}>
                <option value="actief">Actief</option>
                <option value="latent">Latent</option>
                <option value="gearchiveerd">Gearchiveerd</option>
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Herkomst</label>
              <input className="input" name="bron" defaultValue={contact.bron ?? ""} placeholder="bv. doorgestuurd via mail" />
            </div>
            <div className="sm:col-span-2">
              <label className="label-up mb-1 block">Omschrijving</label>
              <input className="input" name="omschrijving" defaultValue={contact.omschrijving ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <label className="label-up mb-1 block">Verantwoordelijkheden</label>
              <textarea
                className="input"
                name="verantwoordelijkheden"
                rows={3}
                defaultValue={contact.verantwoordelijkheden ?? ""}
                placeholder="Vrije tekst — wat doet dit contact voor het landgoed?"
              />
            </div>

            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">Opslaan</button>
            </div>
          </form>

          {contact.aangemaakt_op && (
            <div className="mt-4 text-[11px]" style={{ color: "var(--text-3)" }}>
              Aangemaakt op {new Date(contact.aangemaakt_op).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
