"use client";

import { useState } from "react";
import { meldWerkorderPubliek } from "./actions";

export function MeldFormulier({ token, landgoedNaam }: { token: string; landgoedNaam: string }) {
  const [status, setStatus] = useState<"invullen" | "bezig" | "verstuurd">("invullen");
  const [fout, setFout] = useState<string | null>(null);

  if (status === "verstuurd") {
    return (
      <div className="card p-5">
        <h2 className="text-[16px] font-bold">Bedankt, uw melding is doorgegeven.</h2>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
          De beheerder van {landgoedNaam} bekijkt de melding en pakt het op.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-4"
          onClick={() => setStatus("invullen")}
        >
          Nog een melding doen
        </button>
      </div>
    );
  }

  return (
    <form
      className="card flex flex-col gap-3 p-5"
      action={async (fd) => {
        setStatus("bezig");
        setFout(null);
        const res = await meldWerkorderPubliek(token, fd);
        if (res.ok) setStatus("verstuurd");
        else {
          setFout(res.fout);
          setStatus("invullen");
        }
      }}
    >
      <div>
        <label className="label-up mb-1 block">Wat is er aan de hand?</label>
        <input className="input w-full" name="titel" placeholder="Bijv. de cv-ketel doet het niet" required />
      </div>
      <div>
        <label className="label-up mb-1 block">Toelichting</label>
        <textarea className="input w-full" name="omschrijving" rows={3} placeholder="Optioneel — waar precies, sinds wanneer?" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label className="label-up mb-1 block">Uw naam</label>
          <input className="input w-full" name="melder_naam" />
        </div>
        <div className="flex-1">
          <label className="label-up mb-1 block">Uw e-mail</label>
          <input className="input w-full" type="email" name="melder_email" placeholder="Om u op de hoogte te houden" />
        </div>
      </div>
      {fout && (
        <p className="text-[13px]" style={{ color: "var(--red)" }}>{fout}</p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={status === "bezig"}>
          {status === "bezig" ? "Bezig…" : "Melding versturen"}
        </button>
      </div>
    </form>
  );
}
