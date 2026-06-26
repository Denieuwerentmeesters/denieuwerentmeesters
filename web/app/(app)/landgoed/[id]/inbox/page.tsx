import { createClient } from "@/lib/supabase/server";
import InboxKaarten from "./InboxKaarten";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: voorstellenRaw } = await (supabase as any)
    .from("inbound_extractie")
    .select(
      "id, type, titel, samenvatting, voorgestelde_velden, bron_citaat, zekerheid, aangemaakt_op, " +
        "inbound_email(id, van_adres, van_naam, onderwerp, ontvangen_op, body_text)",
    )
    .eq("landgoed_id", id)
    .eq("status", "concept")
    .order("aangemaakt_op", { ascending: false });

  // Leden van dit landgoed (voor de toewijzings-dropdown)
  const { data: ledenRaw } = await supabase
    .from("lidmaatschap")
    .select("gebruiker_id, profiel(id, naam, email)")
    .eq("landgoed_id", id);

  const leden = (ledenRaw ?? []).map((l) => {
    const p = (l.profiel as unknown) as { id: string; naam: string | null; email: string | null } | null;
    return { id: p?.id ?? l.gebruiker_id, naam: p?.naam ?? null, email: p?.email ?? null };
  });

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Inbox
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Inbox</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Voorstellen uit doorgestuurde e-mails — bewerk en bevestig elk voorstel vóór het verwerkt wordt.
          </p>
        </header>

        <InboxKaarten
          voorstellen={voorstellenRaw ?? []}
          landgoed_id={id}
          leden={leden}
        />
      </div>
    </div>
  );
}
