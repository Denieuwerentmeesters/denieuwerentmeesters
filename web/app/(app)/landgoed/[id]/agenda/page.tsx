import { createClient } from "@/lib/supabase/server";
import { nieuwAgendaItem, verwijderAgendaItem } from "../actions";

export default async function AgendaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Leden voor toewijzings-dropdown
  const { data: ledenRaw } = await supabase
    .from("lidmaatschap")
    .select("gebruiker_id, profiel(id, naam, email)")
    .eq("landgoed_id", id);

  const leden = (ledenRaw ?? []).map((l) => {
    const p = (l.profiel as unknown) as { id: string; naam: string | null; email: string | null } | null;
    return { id: p?.id ?? l.gebruiker_id, naam: p?.naam ?? p?.email ?? l.gebruiker_id };
  });

  // Agenda items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: itemsRaw } = await (supabase as any)
    .from("agenda_item")
    .select("id, titel, datum, tijd, locatie, categorie, omschrijving, toegewezen_aan, profiel(naam, email)")
    .eq("landgoed_id", id)
    .order("datum", { ascending: true });

  const items = (itemsRaw ?? []) as {
    id: string;
    titel: string;
    datum: string;
    tijd: string | null;
    locatie: string | null;
    omschrijving: string | null;
    toegewezen_aan: string | null;
    profiel: { naam: string | null; email: string | null } | null;
  }[];

  const vandaag = new Date().toISOString().slice(0, 10);
  const aankomend = items.filter((i) => i.datum >= vandaag);
  const verleden = items.filter((i) => i.datum < vandaag);

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Agenda
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Agenda</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Aankomende termijnen, afspraken en deadlines.
          </p>
        </header>

        {/* Nieuw agendapunt */}
        <form
          action={nieuwAgendaItem}
          className="card mb-6 flex flex-wrap items-end gap-3 p-4"
        >
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="min-w-[220px] flex-1">
            <label className="label-up mb-1 block">Titel</label>
            <input className="input" name="titel" placeholder="Wat staat er op de agenda?" required />
          </div>
          <div>
            <label className="label-up mb-1 block">Datum</label>
            <input className="input" type="date" name="datum" required />
          </div>
          <div>
            <label className="label-up mb-1 block">Tijd</label>
            <input className="input" type="time" name="tijd" />
          </div>
          <div>
            <label className="label-up mb-1 block">Locatie</label>
            <input className="input" name="locatie" placeholder="Optioneel" />
          </div>
          <div>
            <label className="label-up mb-1 block">Toegewezen aan</label>
            <select className="input" name="toegewezen_aan" defaultValue="">
              <option value="">— niemand —</option>
              {leden.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.naam}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            Toevoegen
          </button>
        </form>

        {/* Aankomend */}
        <section className="mb-8">
          <h2 className="label-up mb-3">Aankomend</h2>
          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {aankomend.length === 0 && (
              <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
                Geen aankomende agendapunten.
              </div>
            )}
            {aankomend.map((item) => (
              <AgendaRij key={item.id} item={item} landgoed_id={id} />
            ))}
          </div>
        </section>

        {/* Verleden */}
        {verleden.length > 0 && (
          <section>
            <h2 className="label-up mb-3">Afgelopen</h2>
            <div className="card divide-y" style={{ borderColor: "var(--border)", opacity: 0.6 }}>
              {verleden.map((item) => (
                <AgendaRij key={item.id} item={item} landgoed_id={id} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function AgendaRij({
  item,
  landgoed_id,
}: {
  item: {
    id: string;
    titel: string;
    datum: string;
    tijd: string | null;
    locatie: string | null;
    omschrijving: string | null;
    profiel: { naam: string | null; email: string | null } | null;
  };
  landgoed_id: string;
}) {
  const datum = new Date(item.datum + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="flex items-start gap-4 px-5 py-4"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="w-[110px] shrink-0">
        <div className="text-[13px] font-semibold">{datum}</div>
        {item.tijd && (
          <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
            {item.tijd}
          </div>
        )}
      </div>
      <div className="flex-1">
        <a href={`/landgoed/${landgoed_id}/agenda/${item.id}`} className="text-[14px] font-semibold hover:underline">{item.titel}</a>
        <div className="mt-0.5 flex flex-wrap gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
          {item.locatie && <span>📍 {item.locatie}</span>}
          {item.profiel && (
            <span>👤 {item.profiel.naam ?? item.profiel.email}</span>
          )}
          {item.omschrijving && <span>{item.omschrijving}</span>}
        </div>
      </div>
      <form action={verwijderAgendaItem}>
        <input type="hidden" name="landgoed_id" value={landgoed_id} />
        <input type="hidden" name="id" value={item.id} />
        <button type="submit" className="btn btn-ghost btn-sm text-[12px]">
          Verwijderen
        </button>
      </form>
    </div>
  );
}
