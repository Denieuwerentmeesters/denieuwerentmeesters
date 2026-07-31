"use client";

import { useState } from "react";
import Link from "next/link";
import SubmitKnop from "@/components/SubmitKnop";
import { VerwijderKnop } from "@/components/VerwijderKnop";

type Obj = {
  id: string;
  naam: string;
  categorie: string;
  beschrijving: string | null;
  gebruik: string | null;
};

export default function ObjectBewerken({
  object,
  detail,
  koppelingen,
  categorieOpties,
  gebruikOpties,
  bovenliggendId,
  bovenliggendOpties,
  landgoedId,
  bewerkObject,
  verwijderObject,
}: {
  object: Obj;
  detail: string;
  koppelingen: string;
  categorieOpties: [string, string][];
  gebruikOpties: string[];
  bovenliggendId: string | null;
  bovenliggendOpties: [string, string][];
  landgoedId: string;
  bewerkObject: (fd: FormData) => Promise<void>;
  verwijderObject: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 py-2.5">
        <div className="flex-1">
          <div className="text-[14px] font-semibold">{object.naam}</div>
          {detail && (
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              {detail}
            </div>
          )}
          {koppelingen && (
            <div className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
              {koppelingen}
            </div>
          )}
        </div>
        <Link
          href={`/landgoed/${landgoedId}/object/${object.id}`}
          className="btn btn-ghost btn-sm"
        >
          Details
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-ghost btn-sm"
        >
          Pas aan
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-[480px] p-5"
            style={{ background: "white" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-[15px] font-bold">Stamgegeven bewerken</div>

            <form
              action={async (fd) => {
                await bewerkObject(fd);
                setOpen(false);
              }}
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="landgoed_id" value={landgoedId} />
              <input type="hidden" name="id" value={object.id} />

              <div>
                <label className="label-up mb-1 block">Naam</label>
                <input
                  className="input"
                  name="naam"
                  defaultValue={object.naam}
                  required
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="label-up mb-1 block">Categorie</label>
                  <select
                    className="input"
                    name="categorie"
                    defaultValue={object.categorie}
                  >
                    {categorieOpties.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="label-up mb-1 block">Gebruik</label>
                  <select
                    className="input"
                    name="gebruik"
                    defaultValue={object.gebruik ?? ""}
                  >
                    <option value="">— geen —</option>
                    {gebruikOpties.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label-up mb-1 block">Onderdeel van</label>
                <select
                  className="input"
                  name="bovenliggend_id"
                  defaultValue={bovenliggendId ?? ""}
                >
                  <option value="">— hoofdobject (geen onderdeel) —</option>
                  {bovenliggendOpties.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-up mb-1 block">Beschrijving</label>
                <textarea
                  className="input"
                  name="beschrijving"
                  rows={3}
                  defaultValue={object.beschrijving ?? ""}
                />
              </div>

              <div className="mt-1 flex items-center justify-between">
                <VerwijderKnop
                  vraag={`"${object.naam}"`}
                  onBevestig={async () => {
                    const fd = new FormData();
                    fd.set("landgoed_id", landgoedId);
                    fd.set("id", object.id);
                    await verwijderObject(fd);
                    setOpen(false);
                  }}
                >
                  Verwijder
                </VerwijderKnop>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setOpen(false)}
                  >
                    Annuleer
                  </button>
                  <SubmitKnop className="btn btn-primary" pendingTekst="Opslaan…">
                    Opslaan
                  </SubmitKnop>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
