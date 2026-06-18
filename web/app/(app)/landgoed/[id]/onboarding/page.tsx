import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { aiBeschikbaar } from "@/lib/ai";
import BestandVeld from "@/components/BestandVeld";
import SubmitKnop from "@/components/SubmitKnop";
import { uploadBron, verrijkDoc, verrijkTx } from "./acties";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [documentenRes, objectenRes, verbandenRes] = await Promise.all([
    supabase
      .from("document")
      .select("id, titel, bestand_pad")
      .eq("landgoed_id", id)
      .order("aangemaakt_op", { ascending: false }),
    supabase
      .from("stamobject")
      .select("id, geaccordeerd")
      .eq("landgoed_id", id),
    supabase
      .from("verband")
      .select("id, status")
      .eq("landgoed_id", id),
  ]);

  const pdfDocumenten = (documentenRes.data ?? []).filter((d) =>
    d.bestand_pad?.toLowerCase().endsWith(".pdf"),
  );
  const objecten = objectenRes.data ?? [];
  const verbanden = verbandenRes.data ?? [];
  const teControleren =
    objecten.filter((o) => !o.geaccordeerd).length +
    verbanden.filter((v) => v.status === "voorgesteld").length;
  const aiUit = !aiBeschikbaar();

  function Stap({
    n,
    titel,
    children,
  }: {
    n: number;
    titel: string;
    children: React.ReactNode;
  }) {
    return (
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            {n}
          </div>
          <div className="text-[15px] font-semibold">{titel}</div>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Stamgegevens · Onboarding
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Stamgegevens opbouwen</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Lever je bronnen aan; de AI stelt de basisobjecten en koppelingen
            voor. Daarna controleer je ze.
          </p>
        </header>

        <div className="flex max-w-[760px] flex-col gap-4">
          <Stap n={1} titel="Bronnen aanleveren">
            <p className="mb-3 text-[13px]" style={{ color: "var(--text-2)" }}>
              Upload documenten zoals pacht-/huurcontracten, een kadastraal
              uittreksel of een taxatie (PDF).
            </p>
            <form
              action={uploadBron}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="landgoed_id" value={id} />
              <div className="min-w-[200px] flex-1">
                <label className="label-up mb-1 block">Titel (optioneel)</label>
                <input className="input" name="titel" placeholder="Bestandsnaam indien leeg" />
              </div>
              <div>
                <label className="label-up mb-1 block">Bestand</label>
                <BestandVeld maxMb={5} />
              </div>
              <SubmitKnop className="btn btn-primary" pendingTekst="Uploaden…">
                Uploaden
              </SubmitKnop>
            </form>
          </Stap>

          <Stap n={2} titel="AI laten lezen">
            {aiUit && (
              <p className="mb-2 text-[12.5px]" style={{ color: "var(--red)" }}>
                AI staat uit (geen ANTHROPIC_API_KEY). Sla deze stap over of voeg
                objecten handmatig toe op de stamgegevens-pagina.
              </p>
            )}
            {pdfDocumenten.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
                Nog geen PDF-documenten — upload eerst bij stap 1.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {pdfDocumenten.map((d) => (
                  <form
                    key={d.id}
                    action={verrijkDoc}
                    className="flex items-center gap-3"
                  >
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="document_id" value={d.id} />
                    <div className="flex-1 text-[13.5px]">{d.titel}</div>
                    <SubmitKnop
                      className="btn btn-ghost btn-sm"
                      disabled={aiUit}
                      pendingTekst="AI leest…"
                    >
                      Lees met AI
                    </SubmitKnop>
                  </form>
                ))}
                <form action={verrijkTx} className="mt-1">
                  <input type="hidden" name="landgoed_id" value={id} />
                  <SubmitKnop
                    className="btn btn-ghost btn-sm"
                    disabled={aiUit}
                    pendingTekst="AI leest…"
                  >
                    Ook uit transacties afleiden
                  </SubmitKnop>
                </form>
              </div>
            )}
          </Stap>

          <Stap n={3} titel="Controleren & accorderen">
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              {teControleren > 0
                ? `${teControleren} voorstel(len) klaar om te controleren.`
                : "Nog geen voorstellen. Lees eerst een bron met AI."}
            </p>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/landgoed/${id}/stamgegevens`}
                className="btn btn-primary btn-sm"
              >
                Naar de voorstellen
              </Link>
              <Link
                href={`/landgoed/${id}/overzicht`}
                className="btn btn-ghost btn-sm"
              >
                Later afmaken
              </Link>
            </div>
          </Stap>
        </div>
      </div>
    </div>
  );
}
