"use client";

import { useState } from "react";
import { hernoemGesprek } from "./acties";

/**
 * Klikbare titel: klik op "Opname 8 juli" om er "Vergadering 8 juli" of
 * "Gesprek met Bart 8 juli" van te maken. De datum kan meteen mee.
 */
export function TitelBewerken({
  gesprekId,
  landgoedId,
  titel,
  datum,
}: {
  gesprekId: string;
  landgoedId: string;
  titel: string;
  datum: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Klik om te hernoemen"
        className="text-left"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        <span className="text-[22px] font-bold">{titel}</span>
        <span className="ml-2 text-[12.5px]" style={{ color: "var(--text-3)" }}>✎ hernoemen</span>
      </button>
    );
  }

  return (
    <form
      action={hernoemGesprek}
      onSubmit={() => setOpen(false)}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="gesprek_id" value={gesprekId} />
      <input type="hidden" name="landgoed_id" value={landgoedId} />
      <div style={{ minWidth: 260 }}>
        <label className="label-up mb-1 block">Titel</label>
        <input className="input w-full" name="titel" defaultValue={titel} autoFocus required />
      </div>
      <div>
        <label className="label-up mb-1 block">Datum</label>
        <input className="input" type="date" name="datum" defaultValue={datum ?? ""} />
      </div>
      <button type="submit" className="btn btn-primary btn-sm">Opslaan</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        Annuleren
      </button>
    </form>
  );
}
