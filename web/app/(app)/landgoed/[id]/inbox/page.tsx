import { createClient } from "@/lib/supabase/server";
import { bevestigInboundVoorstel, verWerpInboundVoorstel } from "../actions";

type InboundMailRef = {
  id: string;
  van_adres: string;
  van_naam: string | null;
  onderwerp: string;
  ontvangen_op: string;
};

type InboundVoorstelRij = {
  id: string;
  type: string;
  titel: string;
  samenvatting: string;
  voorgestelde_velden: Record<string, string | null>;
  bron_citaat: string;
  zekerheid: string;
  status: string;
  aangemaakt_op: string;
  inbound_email: InboundMailRef | null;
};

const TYPE_LABELS: Record<string, string> = {
  taak: "Taak",
  agendapunt: "Agendapunt",
  documentintake: "Document",
  informatie: "Informatie",
};

const TYPE_COLORS: Record<string, string> = {
  taak: "tag-red",
  agendapunt: "tag-blue",
  documentintake: "tag-purple",
  informatie: "tag-gray",
};

const ZEKERHEID_LABELS: Record<string, string> = {
  hoog: "Hoog",
  midden: "Midden",
  laag: "Laag — controleer goed",
};

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
      "id, type, titel, samenvatting, voorgestelde_velden, bron_citaat, zekerheid, status, aangemaakt_op, " +
        "inbound_email(id, van_adres, van_naam, onderwerp, ontvangen_op)",
    )
    .eq("landgoed_id", id)
    .eq("status", "concept")
    .order("aangemaakt_op", { ascending: false });

  const voorstellen = (voorstellenRaw ?? []) as InboundVoorstelRij[];

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
            Voorstellen uit doorgestuurde e-mails — beoordeel elk voorstel vóór het verwerkt wordt.
          </p>
        </header>

        {voorstellen.length === 0 ? (
          <div className="card p-6 text-[13px]" style={{ color: "var(--text-2)" }}>
            Geen openstaande voorstellen. Stuur een e-mail door naar het landgoed-adres om te beginnen.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {voorstellen.map((v) => {
              const mail = v.inbound_email;
              const laagZekerheid = v.zekerheid === "laag";

              return (
                <div
                  key={v.id}
                  className="card p-5"
                  style={
                    laagZekerheid
                      ? { borderLeft: "3px solid var(--warning, #f59e0b)" }
                      : undefined
                  }
                >
                  {/* Header: type + zekerheid */}
                  <div className="mb-3 flex flex-wrap items-start gap-2">
                    <span className={`tag ${TYPE_COLORS[v.type] ?? "tag-gray"}`}>
                      {TYPE_LABELS[v.type] ?? v.type}
                    </span>
                    {laagZekerheid && (
                      <span className="tag tag-yellow text-[11px]">
                        {ZEKERHEID_LABELS[v.zekerheid]}
                      </span>
                    )}
                    <span
                      className="ml-auto text-[11px]"
                      style={{ color: "var(--text-3)" }}
                    >
                      Zekerheid: {ZEKERHEID_LABELS[v.zekerheid] ?? v.zekerheid}
                    </span>
                  </div>

                  {/* Titel + samenvatting */}
                  <h2 className="mb-1 text-[15px] font-semibold">{v.titel}</h2>
                  {v.samenvatting && (
                    <p className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
                      {v.samenvatting}
                    </p>
                  )}

                  {/* Bron-citaat — het hart van transparantie */}
                  {v.bron_citaat && (
                    <blockquote
                      className="mb-3 rounded-[6px] p-3 text-[12.5px] italic"
                      style={{
                        background: "var(--bg)",
                        borderLeft: "3px solid var(--border-strong, var(--border))",
                        color: "var(--text-2)",
                      }}
                    >
                      &ldquo;{v.bron_citaat}&rdquo;
                    </blockquote>
                  )}

                  {/* Herkomst mail */}
                  {mail && (
                    <div
                      className="mb-4 text-[11.5px]"
                      style={{ color: "var(--text-3)" }}
                    >
                      Uit: <span className="font-medium">{mail.van_naam ?? mail.van_adres}</span>
                      {mail.van_naam && <span> &lt;{mail.van_adres}&gt;</span>}
                      {" — "}
                      {mail.onderwerp}
                      {" — "}
                      {new Date(mail.ontvangen_op).toLocaleDateString("nl-NL")}
                    </div>
                  )}

                  {/* Acties */}
                  <div className="flex gap-2">
                    <form action={bevestigInboundVoorstel}>
                      <input type="hidden" name="landgoed_id" value={id} />
                      <input type="hidden" name="voorstel_id" value={v.id} />
                      <button type="submit" className="btn btn-primary btn-sm">
                        Bevestigen
                      </button>
                    </form>
                    <form action={verWerpInboundVoorstel}>
                      <input type="hidden" name="landgoed_id" value={id} />
                      <input type="hidden" name="voorstel_id" value={v.id} />
                      <button type="submit" className="btn btn-ghost btn-sm">
                        Verwerpen
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
