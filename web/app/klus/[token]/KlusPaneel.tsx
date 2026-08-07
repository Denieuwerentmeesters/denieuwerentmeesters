"use client";

import { useState } from "react";
import { klusStatusBijwerken, klusNieuwPuntMelden } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  gemeld: "Nog niet geaccepteerd",
  geaccepteerd: "Geaccepteerd",
  afgerond: "Afgerond",
};

export function KlusPaneel({ token, status }: { token: string; status: string }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [puntGemeld, setPuntGemeld] = useState(false);

  async function zetStatus(fd: FormData) {
    setBezig(true);
    setFout(null);
    const res = await klusStatusBijwerken(token, fd);
    if (!res.ok) setFout(res.fout);
    setBezig(false);
  }

  return (
    <>
      <div className="card mb-5 p-5">
        <p className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Status: <strong>{STATUS_LABEL[status] ?? status}</strong>
        </p>

        {status === "gemeld" && (
          <form action={zetStatus} className="mt-3">
            <input type="hidden" name="status" value="geaccepteerd" />
            <button type="submit" className="btn btn-primary btn-sm" disabled={bezig}>
              Ik pak dit op
            </button>
          </form>
        )}

        {status === "geaccepteerd" && (
          <form action={zetStatus} className="mt-3">
            <input type="hidden" name="status" value="afgerond" />
            <button type="submit" className="btn btn-primary btn-sm" disabled={bezig}>
              Klus is klaar
            </button>
          </form>
        )}

        {status === "afgerond" && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
            Bedankt — de klus staat als afgerond genoteerd.
          </p>
        )}

        {fout && <p className="mt-2 text-[13px]" style={{ color: "var(--red)" }}>{fout}</p>}
      </div>

      <div className="card p-5">
        <span className="label-up">Iets anders opgevallen?</span>
        {puntGemeld ? (
          <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
            Bedankt — uw punt is doorgegeven aan de beheerder.
          </p>
        ) : (
          <form
            className="mt-3 flex flex-col gap-3"
            action={async (fd) => {
              setBezig(true);
              setFout(null);
              const res = await klusNieuwPuntMelden(token, fd);
              if (res.ok) setPuntGemeld(true);
              else setFout(res.fout);
              setBezig(false);
            }}
          >
            <input className="input w-full" name="titel" placeholder="Bijv. het dak moet ook bekeken worden" required />
            <textarea className="input w-full" name="omschrijving" rows={2} placeholder="Toelichting (optioneel)" />
            <div>
              <button type="submit" className="btn btn-ghost btn-sm" disabled={bezig}>
                Nieuw punt melden
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
