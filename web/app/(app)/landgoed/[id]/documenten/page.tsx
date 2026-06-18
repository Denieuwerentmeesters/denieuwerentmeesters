import { createClient } from "@/lib/supabase/server";
import BestandVeld from "@/components/BestandVeld";
import SubmitKnop from "@/components/SubmitKnop";
import { uploadDocument, verwijderDocument } from "./acties";

export default async function DocumentenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: documenten } = await supabase
    .from("document")
    .select("id, titel, bestand_pad, samenvatting, aangemaakt_op")
    .eq("landgoed_id", id)
    .order("aangemaakt_op", { ascending: false });

  // Korte signed-URLs voor download (private bucket).
  const metUrl = await Promise.all(
    (documenten ?? []).map(async (d) => {
      let url: string | null = null;
      if (d.bestand_pad) {
        const { data } = await supabase.storage
          .from("documenten")
          .createSignedUrl(d.bestand_pad, 3600);
        url = data?.signedUrl ?? null;
      }
      return { ...d, url };
    }),
  );

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Documenten
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Documenten</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Eén centraal archief: contracten, vergunningen, plannen.
          </p>
        </header>

        <form
          action={uploadDocument}
          className="card mb-5 flex flex-wrap items-end gap-3 p-4"
        >
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="min-w-[200px] flex-1">
            <label className="label-up mb-1 block">Titel (optioneel)</label>
            <input className="input" name="titel" placeholder="Bestandsnaam wordt gebruikt indien leeg" />
          </div>
          <div>
            <label className="label-up mb-1 block">Bestand</label>
            <BestandVeld maxMb={5} />
          </div>
          <SubmitKnop className="btn btn-primary" pendingTekst="Uploaden…">
            Uploaden
          </SubmitKnop>
        </form>

        <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
          {metUrl.length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Nog geen documenten.
            </div>
          )}
          {metUrl.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 px-5 py-3.5"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex-1">
                <div className="text-[14px] font-semibold">{d.titel}</div>
                {d.samenvatting && (
                  <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                    {d.samenvatting}
                  </div>
                )}
              </div>
              {d.url && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  Openen
                </a>
              )}
              <form action={verwijderDocument}>
                <input type="hidden" name="landgoed_id" value={id} />
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="pad" value={d.bestand_pad ?? ""} />
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--red)" }}
                >
                  Verwijderen
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
