import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Kalender, { type KalenderEvent } from "@/components/Kalender";
import { nieuwAgendaItem, verwijderAgendaItem, nieuweTaak, taakAfronden } from "../actions";
import TakenAgendaLijst, { type CombinedItem, type Lid } from "./TakenAgendaLijst";

function over(dagen: number) {
  const d = new Date();
  d.setDate(d.getDate() + dagen);
  return d.toISOString().slice(0, 10);
}

export default async function OverzichtPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const binnen90 = over(90);
  const vandaag = new Date().toISOString().slice(0, 10);

  const [
    openTaken,
    contacten,
    contracten,
    aflopend,
    indexatie,
    agendaItems,
    takenMetDeadline,
    contractData,
    vergaderingen,
    alleTagken,
    ledenRaw,
    relatiesRaw,
  ] = await Promise.all([
    supabase
      .from("taak")
      .select("id", { count: "exact", head: true })
      .eq("landgoed_id", id)
      .eq("status", "open"),
    supabase
      .from("relatie")
      .select("id", { count: "exact", head: true })
      .eq("landgoed_id", id),
    supabase
      .from("contract")
      .select("id", { count: "exact", head: true })
      .eq("landgoed_id", id),
    supabase
      .from("contract")
      .select("id", { count: "exact", head: true })
      .eq("landgoed_id", id)
      .gte("einddatum", vandaag)
      .lte("einddatum", binnen90),
    supabase
      .from("contract")
      .select("id", { count: "exact", head: true })
      .eq("landgoed_id", id)
      .gte("volgende_indexatie", vandaag)
      .lte("volgende_indexatie", binnen90),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("agenda_item")
      .select("id, titel, datum, tijd, locatie, toegewezen_aan, profiel(id, naam, email)")
      .eq("landgoed_id", id)
      .order("datum", { ascending: true }),
    supabase
      .from("taak")
      .select("titel, deadline")
      .eq("landgoed_id", id)
      .eq("status", "open")
      .not("deadline", "is", null),
    supabase
      .from("contract")
      .select("titel, einddatum, volgende_indexatie")
      .eq("landgoed_id", id),
    supabase.from("vergadering").select("titel, datum").eq("landgoed_id", id),
    supabase
      .from("taak")
      .select("id, titel, prioriteit, status, deadline, toegewezen_aan, profiel(id, naam, email)")
      .eq("landgoed_id", id)
      .order("status")
      .order("deadline", { nullsFirst: false }),
    supabase
      .from("lidmaatschap")
      .select("gebruiker_id, profiel(id, naam, email)")
      .eq("landgoed_id", id),
    supabase
      .from("relatie")
      .select("id, naam")
      .eq("landgoed_id", id)
      .order("naam"),
  ]);

  // Kalender events
  const events: KalenderEvent[] = [];
  for (const a of (agendaItems.data ?? []) as { id: string; titel: string; datum: string; tijd: string | null }[]) {
    if (a.datum)
      events.push({ datum: a.datum, titel: a.titel, soort: "agenda", tijd: a.tijd, agendaId: a.id });
  }
  for (const t of takenMetDeadline.data ?? []) {
    if (t.deadline)
      events.push({ datum: t.deadline, titel: t.titel, soort: "taak", href: `/landgoed/${id}/overzicht` });
  }
  for (const c of contractData.data ?? []) {
    if (c.einddatum)
      events.push({ datum: c.einddatum, titel: c.titel, soort: "contract", href: `/landgoed/${id}/contracten` });
    if (c.volgende_indexatie)
      events.push({ datum: c.volgende_indexatie, titel: c.titel, soort: "indexatie", href: `/landgoed/${id}/contracten` });
  }
  for (const v of vergaderingen.data ?? []) {
    if (v.datum)
      events.push({ datum: v.datum, titel: v.titel, soort: "vergadering", href: `/landgoed/${id}/vergaderingen` });
  }

  // Leden voor dropdown
  type LidRaw = { gebruiker_id: string; profiel: { id: string; naam: string | null; email: string | null } | null };
  const leden: Lid[] = ((ledenRaw.data ?? []) as unknown as LidRaw[]).map((l) => {
    const p = l.profiel;
    return { id: p?.id ?? l.gebruiker_id, naam: p?.naam ?? p?.email ?? l.gebruiker_id };
  });
  // Contacten (relaties) voor dropdown — waarde-prefix "c:<naam>" zodat server action het onderscheidt
  const relatieOpties = ((relatiesRaw.data ?? []) as { id: string; naam: string }[]).map((r) => ({
    value: `c:${r.naam}`,
    naam: r.naam,
  }));

  // Gecombineerde lijst: taken + agendapunten
  type TaakRaw = { id: string; titel: string; prioriteit: string | null; status: string; deadline: string | null; toegewezen_aan: string | null; profiel: { naam: string | null; email: string | null } | null };
  type AgendaRaw = { id: string; titel: string; datum: string; tijd: string | null; locatie: string | null; toegewezen_aan: string | null; profiel: { naam: string | null; email: string | null } | null };
  const combinedItems: CombinedItem[] = [];
  for (const t of (alleTagken.data ?? []) as unknown as TaakRaw[]) {
    const p = t.profiel;
    combinedItems.push({
      id: t.id,
      type: "taak",
      titel: t.titel,
      datum: t.deadline,
      persoonNaam: p?.naam ?? p?.email ?? null,
      toegewezen_aan: t.toegewezen_aan,
      prioriteit: t.prioriteit,
      status: t.status,
    });
  }
  for (const a of (agendaItems.data ?? []) as unknown as AgendaRaw[]) {
    const p = a.profiel;
    combinedItems.push({
      id: a.id,
      type: "agenda",
      titel: a.titel,
      datum: a.datum,
      persoonNaam: p?.naam ?? p?.email ?? null,
      toegewezen_aan: a.toegewezen_aan,
      tijd: a.tijd,
      locatie: a.locatie,
    });
  }

  const kpis = [
    { label: "Open taken", waarde: openTaken.count ?? 0, href: `/landgoed/${id}/overzicht` },
    { label: "Contacten", waarde: contacten.count ?? 0, href: `/landgoed/${id}/contacten` },
    { label: "Contracten", waarde: contracten.count ?? 0, href: `/landgoed/${id}/contracten` },
    {
      label: "Loopt af < 90 dagen",
      waarde: (aflopend.count ?? 0) + (indexatie.count ?? 0),
      href: `/landgoed/${id}/contracten`,
      let: (aflopend.count ?? 0) + (indexatie.count ?? 0) > 0,
    },
  ];

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          {vandaag}
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Overzicht</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Taken, agenda en de stand van zaken in één oogopslag.
          </p>
        </header>

        {/* KPI tegels */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <Link key={k.label} href={k.href} className="card block p-5">
              <div className="label-up mb-2">{k.label}</div>
              <div
                className="text-[28px] font-bold"
                style={{ color: k.let ? "var(--amber)" : "var(--text)" }}
              >
                {k.waarde}
              </div>
            </Link>
          ))}
        </div>

        {/* Taken en agendapunten */}
        <div className="mb-8">
          <TakenAgendaLijst
            items={combinedItems}
            leden={leden}
            relatieOpties={relatieOpties}
            landgoedId={id}
            taakAfronden={taakAfronden}
            verwijderAgendaItem={verwijderAgendaItem}
            nieuwAgendaItem={nieuwAgendaItem}
            nieuweTaak={nieuweTaak}
          />
        </div>

        {/* Kalender */}
        <h2 className="mb-2 text-[16px] font-bold">Kalender</h2>
        <Kalender
          events={events}
          landgoedId={id}
          vandaag={vandaag}
          nieuwAgendaItem={nieuwAgendaItem}
          verwijderAgendaItem={verwijderAgendaItem}
        />
      </div>
    </div>
  );
}
