import { createClient } from "@/lib/supabase/server";
import BestandVeld from "@/components/BestandVeld";
import SubmitKnop from "@/components/SubmitKnop";
import { haalNotulen } from "@/lib/notulen";
import { NotulenOverzicht } from "@/components/NotulenOverzicht";
import { uploadDocument, verwijderDocument } from "./acties";

export default async function DocumentenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; q?: string; van?: string; tot?: string }>;
}) {
  const { id } = await params;
  const { tab, q, van, tot } = await searchParams;
  const supabase = await createClient();

  const basisPad = `/landgoed/${id}/documenten`;
  const notulenTab = tab === "notulen";

  // ── Tab "Notulen": de AI-notulen uit de vergadermodule, hier terug te vinden ──
  if (notulenTab) {
    const { gesprekken, fout } = await haalNotulen(supabase, id, { titel: q, van, tot });

    return (
      <div className="flex flex-col">
        <div
          className="flex items-center justify-between gap-4 bg-white px-7 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>Documenten / Notulen</div>
          <div className="flex gap-2">
            <a href={basisPad} className="btn btn-ghost btn-sm">Bestanden</a>
            <a href={`${basisPad}?tab=notulen`} className="btn btn-primary btn-sm">📄 Notulen</a>
          </div>
        </div>

        <div className="p-7">
          <header className="mb-5">
            <h1 className="text-[22px] font-bold">Notulen</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Notulen van vergaderingen en opnames — automatisch bewaard bij het gesprek.
            </p>
          </header>

          {fout ? (
            <div className="card p-5 text-[13px]" style={{ color: "var(--red)" }}>
              Notulen ophalen mislukt: {fout}
            </div>
          ) : (
            <NotulenOverzicht
              gesprekken={gesprekken}
              landgoedId={id}
              actie={basisPad}
              verborgenVelden={{ tab: "notulen" }}
              q={q ?? ""}
              van={van ?? ""}
              tot={tot ?? ""}
            />
          )}
        </div>
      </div>
    );
  }

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
      {/* Notulen staat rechtsboven in de balk, net als op de vergaderingenpagina. */}
      <div
        className="flex items-center justify-between gap-4 bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Documenten
        </div>
        <a href={`${basisPad}?tab=notulen`} className="btn btn-primary btn-sm">📄 Notulen</a>
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
          className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="flex-1">
            <label className="label-up mb-1 block">Titel (optioneel)</label>
            <input className="input w-full" name="titel" placeholder="Bestandsnaam wordt gebruikt indien leeg" />
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
              className="flex flex-wrap items-center gap-2 px-4 py-3.5"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{d.titel}</div>
                {d.samenvatting && (
                  <div className="truncate text-[12px]" style={{ color: "var(--text-2)" }}>
                    {d.samenvatting}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
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
                    className="btn btn-ghost btn-sm btn-danger"
                  >
                    Verwijderen
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
