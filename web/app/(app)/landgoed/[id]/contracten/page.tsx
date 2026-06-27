import { createClient } from "@/lib/supabase/server";
import { nieuwContract } from "../actions";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";

function dagenTot(datum: string | null): number | null {
  if (!datum) return null;
  const d = new Date(datum).getTime() - Date.now();
  return Math.ceil(d / 86400000);
}

function euro(n: number | null) {
  if (n === null || n === undefined) return null;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function ContractenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contracten } = await supabase
    .from("contract")
    .select(
      "id, titel, type, partij, bedrag, ingangsdatum, einddatum, indexatie_type, volgende_indexatie, servicekosten, achterstand, status",
    )
    .eq("landgoed_id", id)
    .order("einddatum", { nullsFirst: false });

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Contracten
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Contracten</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Pacht, erfpacht, huur en beheer — met signalering op einddatum en
            indexatie.
          </p>
        </header>

        <ToevoegenToggle label="contract toevoegen">
          <form action={nieuwContract} className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="col-span-2 md:col-span-1">
              <label className="label-up mb-1 block">Titel</label>
              <input className="input" name="titel" placeholder="Bijv. Pacht weiland zuid" required />
            </div>
            <div>
              <label className="label-up mb-1 block">Type</label>
              <select className="input" name="type" defaultValue="pacht">
                <option value="pacht">Pacht</option>
                <option value="erfpacht">Erfpacht</option>
                <option value="huur">Huur</option>
                <option value="beheer">Beheer</option>
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Partij</label>
              <input className="input" name="partij" placeholder="Tegenpartij" />
            </div>
            <div>
              <label className="label-up mb-1 block">Bedrag (€/jaar)</label>
              <input className="input" name="bedrag" inputMode="decimal" placeholder="0" />
            </div>
            <div>
              <label className="label-up mb-1 block">Servicekosten (€)</label>
              <input className="input" name="servicekosten" inputMode="decimal" placeholder="0" />
            </div>
            <div>
              <label className="label-up mb-1 block">Ingangsdatum</label>
              <input className="input" type="date" name="ingangsdatum" />
            </div>
            <div>
              <label className="label-up mb-1 block">Einddatum</label>
              <input className="input" type="date" name="einddatum" />
            </div>
            <div>
              <label className="label-up mb-1 block">Indexatie</label>
              <select className="input" name="indexatie_type" defaultValue="">
                <option value="">Geen</option>
                <option value="CBS-CPI">CBS-CPI</option>
                <option value="vast %">Vast %</option>
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Volgende indexatie</label>
              <input className="input" type="date" name="volgende_indexatie" />
            </div>
            <div>
              <label className="label-up mb-1 block">Achterstand (€)</label>
              <input className="input" name="achterstand" inputMode="decimal" placeholder="0" />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className="label-up mb-1 block">Notitie achterstand</label>
              <input
                className="input"
                name="achterstand_notitie"
                placeholder="bijv. herinnering gestuurd 1-6"
              />
            </div>
            <div className="col-span-2 flex items-end md:col-span-3">
              <button type="submit" className="btn btn-primary">
                Contract toevoegen
              </button>
            </div>
          </form>
        </ToevoegenToggle>

        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {(contracten ?? []).length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen contracten.
            </div>
          )}
          {(contracten ?? []).map((c) => {
            const eindDagen = dagenTot(c.einddatum);
            const indexDagen = dagenTot(c.volgende_indexatie);
            const eindAlert = eindDagen !== null && eindDagen >= 0 && eindDagen <= 90;
            const indexAlert =
              indexDagen !== null && indexDagen >= 0 && indexDagen <= 90;
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">{c.titel}</span>
                    {c.type && <span className="tag tag-gray">{c.type}</span>}
                  </div>
                  <div
                    className="mt-0.5 text-[12px]"
                    style={{ color: "var(--text-2)" }}
                  >
                    {c.partij ? `${c.partij} · ` : ""}
                    {euro(c.bedrag) ? `${euro(c.bedrag)}/jaar` : "geen bedrag"}
                    {c.einddatum ? ` · loopt af ${c.einddatum}` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {eindAlert && (
                    <span className="tag tag-amber">
                      Loopt af over {eindDagen} d
                    </span>
                  )}
                  {indexAlert && (
                    <span className="tag tag-blue">
                      Indexatie over {indexDagen} d
                    </span>
                  )}
                  {Number(c.achterstand) > 0 && (
                    <span className="tag tag-red">
                      Achterstand {euro(c.achterstand)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
