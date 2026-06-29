import { createClient } from "@/lib/supabase/server";
import { aiBeschikbaar } from "@/lib/ai";
import {
  importBankCsv,
  nieuweTransactie,
  categoriseerNu,
} from "./acties";

const euro = (n: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export default async function FinancieelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: transacties } = await supabase
    .from("transactie")
    .select("id, datum, bedrag, omschrijving, categorie, richting")
    .eq("landgoed_id", id)
    .order("datum", { ascending: false });

  const tx = (transacties ?? []).map((t) => ({ ...t, bedrag: Number(t.bedrag) }));
  const jaar = new Date().getFullYear();
  const ditJaar = tx.filter((t) => t.datum?.startsWith(String(jaar)));
  const inkomsten = ditJaar.filter((t) => t.bedrag > 0).reduce((s, t) => s + t.bedrag, 0);
  const uitgaven = ditJaar.filter((t) => t.bedrag < 0).reduce((s, t) => s + t.bedrag, 0);
  const saldo = inkomsten + uitgaven;

  // Per maand (laatste 12).
  const perMaand = new Map<string, { in: number; uit: number }>();
  for (const t of tx) {
    const m = t.datum?.slice(0, 7);
    if (!m) continue;
    const r = perMaand.get(m) ?? { in: 0, uit: 0 };
    if (t.bedrag >= 0) r.in += t.bedrag;
    else r.uit += -t.bedrag;
    perMaand.set(m, r);
  }
  const maanden = [...perMaand.entries()].sort().slice(-12);
  const maxMaand = Math.max(1, ...maanden.map(([, r]) => Math.max(r.in, r.uit)));

  // Per categorie (uitgaven).
  const perCat = new Map<string, number>();
  for (const t of tx) {
    if (t.bedrag < 0) {
      const c = t.categorie ?? "ongecategoriseerd";
      perCat.set(c, (perCat.get(c) ?? 0) + -t.bedrag);
    }
  }
  const cats = [...perCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const ongecat = tx.filter((t) => !t.categorie).length;

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Licht financieel inzicht
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Financieel</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Read-only inzicht uit je bank/boekhouding. Cashflow is leidend.
          </p>
        </header>

        {/* KPI's */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <div className="label-up mb-2">Inkomsten {jaar}</div>
            <div className="text-[24px] font-bold" style={{ color: "var(--primary)" }}>
              {euro(inkomsten)}
            </div>
          </div>
          <div className="card p-5">
            <div className="label-up mb-2">Uitgaven {jaar}</div>
            <div className="text-[24px] font-bold" style={{ color: "var(--red)" }}>
              {euro(uitgaven)}
            </div>
          </div>
          <div className="card p-5">
            <div className="label-up mb-2">Saldo {jaar}</div>
            <div
              className="text-[24px] font-bold"
              style={{ color: saldo >= 0 ? "var(--primary)" : "var(--red)" }}
            >
              {euro(saldo)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Cashflow per maand */}
          <div className="card p-5">
            <div className="label-up mb-3">Cashflow per maand</div>
            {maanden.length === 0 && (
              <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen transacties.
              </div>
            )}
            <div className="flex flex-col gap-2">
              {maanden.map(([m, r]) => (
                <div key={m} className="flex items-center gap-2">
                  <div className="w-14 text-[11px]" style={{ color: "var(--text-2)" }}>
                    {m}
                  </div>
                  <div className="flex-1">
                    <div
                      className="mb-0.5 h-2 rounded"
                      style={{
                        width: `${(r.in / maxMaand) * 100}%`,
                        background: "var(--primary)",
                        minWidth: r.in > 0 ? "2px" : 0,
                      }}
                    />
                    <div
                      className="h-2 rounded"
                      style={{
                        width: `${(r.uit / maxMaand) * 100}%`,
                        background: "var(--red)",
                        minWidth: r.uit > 0 ? "2px" : 0,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Kosten per categorie */}
          <div className="card p-5">
            <div className="label-up mb-3">Kosten per categorie</div>
            {cats.length === 0 && (
              <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen uitgaven.
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              {cats.map(([c, bedrag]) => (
                <div key={c} className="flex items-center justify-between text-[13px]">
                  <span>{c}</span>
                  <span className="font-semibold">{euro(bedrag)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Import + handmatig */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <form action={importBankCsv} className="card flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="flex-1">
              <div className="label-up mb-1">Bankexport importeren (CSV)</div>
              <div className="mb-2 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                Kolommen: datum ; bedrag ; omschrijving ; tegenpartij
              </div>
              <input className="input" type="file" name="bestand" accept=".csv,text/csv" required />
            </div>
            <button type="submit" className="btn btn-primary">
              Importeren
            </button>
          </form>

          <form action={nieuweTransactie} className="card flex flex-col gap-2 p-4">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="label-up">Handmatige transactie</div>
            <div className="flex flex-wrap gap-2">
              <input className="input w-full sm:w-[130px]" type="date" name="datum" required />
              <input className="input w-full sm:w-[120px]" name="bedrag" placeholder="-1234,56" required />
              <input className="input w-full flex-1" name="omschrijving" placeholder="Omschrijving" />
              <button type="submit" className="btn btn-ghost">
                Toevoegen
              </button>
            </div>
          </form>
        </div>

        {/* Recent + AI */}
        <div className="mt-5 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Recente transacties</h2>
          {ongecat > 0 && aiBeschikbaar() && (
            <form action={categoriseerNu}>
              <input type="hidden" name="landgoed_id" value={id} />
              <button type="submit" className="btn btn-ghost btn-sm">
                {ongecat} categoriseren met AI
              </button>
            </form>
          )}
        </div>
        <div className="card mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
          {tx.slice(0, 15).map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-5 py-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="w-20 text-[12px]" style={{ color: "var(--text-2)" }}>
                {t.datum}
              </div>
              <div className="flex-1 text-[13px]">{t.omschrijving}</div>
              {t.categorie && <span className="tag tag-gray">{t.categorie}</span>}
              <div
                className="w-24 text-right text-[13px] font-semibold"
                style={{ color: t.bedrag >= 0 ? "var(--primary)" : "var(--text)" }}
              >
                {euro(t.bedrag)}
              </div>
            </div>
          ))}
          {tx.length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen transacties. Importeer een bankexport of voeg er handmatig
              een toe.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
