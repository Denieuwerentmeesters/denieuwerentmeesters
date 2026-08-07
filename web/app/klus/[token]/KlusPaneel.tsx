"use client";

import { useState } from "react";
import { klusStatusBijwerken, klusNieuwPuntMelden } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  gemeld: "Gemeld",
  beoordelen: "In beoordeling",
  toegewezen: "Toegewezen",
  in_uitvoering: "In uitvoering",
  wacht_op: "Wacht op…",
  klaar: "Klaar",
  geannuleerd: "Geannuleerd",
};

export function KlusPaneel({ token, status }: { token: string; status: string }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [puntGemeld, setPuntGemeld] = useState(false);
  const afgerond = status === "klaar";

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
        <span className="label-up">Status bijwerken</span>
        {afgerond ? (
          <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
            U heeft deze klus op klaar gezet. De beheerder controleert het en sluit af.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <form action={zetStatus}>
              <input type="hidden" name="status" value="in_uitvoering" />
              <button type="submit" className="btn btn-ghost btn-sm" disabled={bezig}>
                Ik ben begonnen
              </button>
            </form>
            <form action={zetStatus} className="flex items-end gap-2">
              <input type="hidden" name="status" value="wacht_op" />
              <div>
                <label className="label-up mb-1 block">Even geblokkeerd?</label>
                <input className="input" name="wacht_reden" placeholder="Reden, bijv. wacht op materiaal" />
              </div>
              <button type="submit" className="btn btn-ghost btn-sm" disabled={bezig}>
                Doorgeven
              </button>
            </form>
            <form action={zetStatus}>
              <input type="hidden" name="status" value="klaar" />
              <button type="submit" className="btn btn-primary btn-sm" disabled={bezig}>
                Klus is klaar
              </button>
            </form>
          </div>
        )}
        {fout && <p className="mt-2 text-[13px]" style={{ color: "var(--red)" }}>{fout}</p>}
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-2)" }}>
          Huidige status: <strong>{STATUS_LABEL[status] ?? status}</strong>
        </p>
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
