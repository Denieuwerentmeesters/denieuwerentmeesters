"use client";

import { useOptimistic, startTransition, Fragment } from "react";

type Obj = {
  id: string;
  naam: string;
  categorie: string;
  voorstel_reden: string | null;
  bovenliggend_id: string | null;
  lijkt_op_id: string | null;
};

type VerbandItem = {
  id: string;
  bron_id: string;
  doel_id: string;
  rol: string | null;
};

export default function VoorstelReview({
  alleVoorstellen,
  verbanden,
  naamLijst,
  categorieLabel,
  landgoedId,
  accordeerObject,
  wijsAfObject,
  voegSamen,
}: {
  alleVoorstellen: Obj[];
  verbanden: VerbandItem[];
  naamLijst: [string, string][];
  categorieLabel: Record<string, string>;
  landgoedId: string;
  accordeerObject: (fd: FormData) => Promise<void>;
  wijsAfObject: (fd: FormData) => Promise<void>;
  voegSamen: (fd: FormData) => Promise<void>;
}) {
  const naamVan = new Map(naamLijst);
  const label = (id: string) => naamVan.get(id) ?? "onbekend";

  const [optimisticList, removeItem] = useOptimistic(
    alleVoorstellen,
    (state: Obj[], id: string) => state.filter((o) => o.id !== id),
  );

  // Rebuild tree from optimisticList zo dat verwijderde items ook uit de kinderen verdwijnen.
  const proposalIds = new Set(optimisticList.map((o) => o.id));
  const voorstelKinderen = new Map<string, Obj[]>();
  for (const o of optimisticList) {
    if (o.bovenliggend_id && proposalIds.has(o.bovenliggend_id)) {
      const l = voorstelKinderen.get(o.bovenliggend_id) ?? [];
      l.push(o);
      voorstelKinderen.set(o.bovenliggend_id, l);
    }
  }
  const visibleTop = optimisticList.filter(
    (o) => !o.bovenliggend_id || !proposalIds.has(o.bovenliggend_id),
  );

  const koppelingLabels = (objId: string) =>
    verbanden
      .filter(
        (v) =>
          v.rol !== "onderdeel_van" &&
          (v.bron_id === objId || v.doel_id === objId),
      )
      .map((v) => {
        const ander = v.bron_id === objId ? v.doel_id : v.bron_id;
        return `${v.rol ?? "gekoppeld"}: ${label(ander)}`;
      })
      .join(" · ");

  function renderVoorstel(o: Obj, diepte: number) {
    const kopp = koppelingLabels(o.id);
    const parentNaam =
      o.bovenliggend_id && diepte === 0 ? label(o.bovenliggend_id) : null;
    const lijktNaam = o.lijkt_op_id ? label(o.lijkt_op_id) : null;
    const kinderen = voorstelKinderen.get(o.id) ?? [];

    return (
      <Fragment key={o.id}>
        <div
          className="flex items-center gap-3 rounded-[10px] p-3"
          style={{ background: "var(--bg)", marginLeft: diepte * 18 }}
        >
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold">
              {o.naam}{" "}
              <span
                className="text-[11px] font-normal"
                style={{ color: "var(--text-3)" }}
              >
                {categorieLabel[o.categorie] ?? o.categorie}
                {parentNaam ? ` · onderdeel van ${parentNaam}` : ""}
              </span>
            </div>
            {o.voorstel_reden && (
              <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                {o.voorstel_reden}
              </div>
            )}
            {kopp && (
              <div className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
                {kopp}
              </div>
            )}
            {lijktNaam && (
              <div className="mt-1 text-[12px]" style={{ color: "var(--red)" }}>
                Lijkt op bestaand: {lijktNaam} — voeg samen i.p.v. dubbel aanmaken.
              </div>
            )}
          </div>
          {lijktNaam && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const fd = new FormData();
                fd.set("landgoed_id", landgoedId);
                fd.set("id", o.id);
                fd.set("doel_id", o.lijkt_op_id ?? "");
                startTransition(async () => {
                  removeItem(o.id);
                  await voegSamen(fd);
                });
              }}
            >
              Samenvoegen
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              const fd = new FormData();
              fd.set("landgoed_id", landgoedId);
              fd.set("id", o.id);
              startTransition(async () => {
                removeItem(o.id);
                await accordeerObject(fd);
              });
            }}
          >
            Accordeer
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--red)" }}
            onClick={() => {
              const fd = new FormData();
              fd.set("landgoed_id", landgoedId);
              fd.set("id", o.id);
              startTransition(async () => {
                removeItem(o.id);
                await wijsAfObject(fd);
              });
            }}
          >
            Wijs af
          </button>
        </div>
        {kinderen.map((k) => renderVoorstel(k, diepte + 1))}
      </Fragment>
    );
  }

  if (visibleTop.length === 0) return null;

  return (
    <div
      className="card mb-5 p-4"
      style={{ borderColor: "var(--primary-mid)" }}
    >
      <div className="mb-1 text-[14px] font-semibold">
        Te controleren ({visibleTop.length})
      </div>
      <p className="mb-3 text-[12px]" style={{ color: "var(--text-3)" }}>
        Onderdelen staan ingesprongen onder hun hoofdobject. Koppelingen
        (beheerd door, grenst aan…) staan als grijs regeltje onder het object
        en lopen mee bij accorderen.
      </p>
      <div className="flex flex-col gap-2">
        {visibleTop.map((o) => renderVoorstel(o, 0))}
      </div>
    </div>
  );
}
