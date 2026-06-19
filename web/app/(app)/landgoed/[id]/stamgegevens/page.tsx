import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { aiBeschikbaar } from "@/lib/ai";
import SubmitKnop from "@/components/SubmitKnop";
import ObjectBewerken from "@/components/ObjectBewerken";
import {
  verrijkUitBron,
  accordeerObject,
  wijsAfObject,
  accordeerVerband,
  wijsAfVerband,
  objectHandmatig,
  bewerkObject,
  verwijderObject,
} from "./acties";

const CATEGORIE_LABEL: Record<string, string> = {
  gebouw: "Gebouwen",
  woning: "Woningen",
  opstal: "Opstallen",
  pachtperceel: "Pachtpercelen",
  natuurbeheertype: "Natuurbeheertypen",
  onderhoudszone: "Onderhoudszones",
  risicoplek: "Risicoplekken",
  wandelroute: "Wandelroutes",
  weg_pad: "Wegen & paden",
  bomenlaan: "Bomenlanen",
  kabel_leiding: "Kabels & leidingen",
  waterloop: "Waterlopen",
  brug: "Bruggen",
  hek: "Hekken",
  vijver_sloot: "Vijvers & sloten",
  tuin: "Tuinen",
  natuur: "Natuur",
  infrastructuur: "Infrastructuur",
  water: "Water",
  overig: "Overig",
};

const HANDMATIG_CATEGORIEEN = [
  "gebouw",
  "woning",
  "opstal",
  "pachtperceel",
  "tuin",
  "natuur",
  "infrastructuur",
  "water",
  "overig",
];

const GEBRUIK_OPTIES = [
  "Wonen",
  "Bedrijf",
  "Natuur",
  "Agrarisch",
  "Recreatie",
  "Maatschappelijk",
];

type Obj = {
  id: string;
  naam: string;
  categorie: string;
  beschrijving: string | null;
  voorstel_reden: string | null;
  kenmerken: Record<string, unknown> | null;
};
type Verband = {
  id: string;
  bron_type: string;
  bron_id: string;
  doel_type: string;
  doel_id: string;
  rol: string | null;
  voorstel_reden: string | null;
};

export default async function StamgegevensPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [objectenRes, verbandenRes, documentenRes, runsRes] = await Promise.all([
    supabase
      .from("stamobject")
      .select(
        "id, naam, categorie, beschrijving, geaccordeerd, voorstel_reden, kenmerken",
      )
      .eq("landgoed_id", id)
      .order("categorie"),
    supabase
      .from("verband")
      .select("id, bron_type, bron_id, doel_type, doel_id, rol, status, voorstel_reden")
      .eq("landgoed_id", id),
    supabase
      .from("document")
      .select("id, titel, bestand_pad")
      .eq("landgoed_id", id)
      .order("aangemaakt_op", { ascending: false }),
    supabase
      .from("extractie_run")
      .select("id, bron_soort, aantal_objecten, aantal_koppelingen, fout, aangemaakt_op")
      .eq("landgoed_id", id)
      .order("aangemaakt_op", { ascending: false })
      .limit(5),
  ]);

  const alleObjecten = (objectenRes.data ?? []) as (Obj & {
    geaccordeerd: boolean;
  })[];
  const voorgesteldeObjecten = alleObjecten.filter((o) => !o.geaccordeerd);
  const geaccordeerdeObjecten = alleObjecten.filter((o) => o.geaccordeerd);

  const alleVerbanden = (verbandenRes.data ?? []) as (Verband & {
    status: string;
  })[];
  const voorgesteldeVerbanden = alleVerbanden.filter(
    (v) => v.status === "voorgesteld",
  );

  // Labelkaarten voor het weergeven van koppelingen.
  const contractenRes = await supabase
    .from("contract")
    .select("id, titel")
    .eq("landgoed_id", id);
  const relatiesRes = await supabase
    .from("relatie")
    .select("id, naam")
    .eq("landgoed_id", id);

  const naamVan = new Map<string, string>();
  alleObjecten.forEach((o) => naamVan.set(o.id, o.naam));
  (contractenRes.data ?? []).forEach((c) => naamVan.set(c.id, c.titel));
  (relatiesRes.data ?? []).forEach((r) => naamVan.set(r.id, r.naam));
  const label = (id: string) => naamVan.get(id) ?? "onbekend";

  const pdfDocumenten = (documentenRes.data ?? []).filter((d) =>
    d.bestand_pad?.toLowerCase().endsWith(".pdf"),
  );

  const gegroepeerd = new Map<string, Obj[]>();
  for (const o of geaccordeerdeObjecten) {
    const lijst = gegroepeerd.get(o.categorie) ?? [];
    lijst.push(o);
    gegroepeerd.set(o.categorie, lijst);
  }

  const aiUit = !aiBeschikbaar();
  const categorieOpties: [string, string][] = HANDMATIG_CATEGORIEEN.map((c) => [
    c,
    CATEGORIE_LABEL[c] ?? c,
  ]);

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Stamgegevens
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold">Stamgegevens</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              De basisobjecten van het landgoed. Laat de AI ze uit je documenten
              en administratie halen; jij controleert en vult aan.
            </p>
          </div>
          <Link href={`/landgoed/${id}/onboarding`} className="btn btn-ghost btn-sm">
            Onboarding-wizard
          </Link>
        </header>

        {aiUit && (
          <div
            className="card mb-5 p-4 text-[13px]"
            style={{ color: "var(--text-2)" }}
          >
            AI staat uit (geen <code>ANTHROPIC_API_KEY</code>). Verrijken werkt
            niet; handmatig toevoegen kan wel.
          </div>
        )}

        {/* Verrijk uit bron */}
        <div className="card mb-5 p-4">
          <div className="mb-3 text-[14px] font-semibold">Verrijk uit een bron</div>
          <form action={verrijkUitBron} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="min-w-[260px] flex-1">
              <label className="label-up mb-1 block">Bron</label>
              <select className="input" name="bron" required>
                <option value="">Kies een bron…</option>
                {pdfDocumenten.length > 0 && (
                  <optgroup label="Documenten">
                    {pdfDocumenten.map((d) => (
                      <option key={d.id} value={`doc:${d.id}`}>
                        {d.titel}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Administratie">
                  <option value="transacties">Banktransacties (Financieel)</option>
                </optgroup>
              </select>
            </div>
            <SubmitKnop
              className="btn btn-primary"
              disabled={aiUit}
              pendingTekst="AI leest…"
            >
              Lees met AI
            </SubmitKnop>
          </form>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
            Kies een document of je banktransacties; de AI stelt objecten en
            koppelingen voor die je daarna controleert. (E-mail en boekhouding
            komen later als extra bron.)
          </p>
          {pdfDocumenten.length === 0 && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
              Geen PDF-documenten gevonden. Upload er eerst een bij{" "}
              <Link href={`/landgoed/${id}/documenten`} className="underline">
                Documenten
              </Link>
              .
            </p>
          )}
          {(runsRes.data ?? []).length > 0 && (
            <div className="mt-3 text-[12px]" style={{ color: "var(--text-2)" }}>
              {(runsRes.data ?? []).map((r) => (
                <div key={r.id}>
                  {r.bron_soort}:{" "}
                  {r.fout
                    ? `⚠ ${r.fout}`
                    : `${r.aantal_objecten} objecten, ${r.aantal_koppelingen} koppelingen voorgesteld`}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Review-wachtrij */}
        {(voorgesteldeObjecten.length > 0 ||
          voorgesteldeVerbanden.length > 0) && (
          <div
            className="card mb-5 p-4"
            style={{ borderColor: "var(--primary-mid)" }}
          >
            <div className="mb-3 text-[14px] font-semibold">
              Te controleren ({voorgesteldeObjecten.length +
                voorgesteldeVerbanden.length})
            </div>

            <div className="flex flex-col gap-2">
              {voorgesteldeObjecten.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 rounded-[10px] p-3"
                  style={{ background: "var(--bg)" }}
                >
                  <div className="flex-1">
                    <div className="text-[13.5px] font-semibold">
                      {o.naam}{" "}
                      <span
                        className="text-[11px] font-normal"
                        style={{ color: "var(--text-3)" }}
                      >
                        {CATEGORIE_LABEL[o.categorie] ?? o.categorie}
                      </span>
                    </div>
                    {o.voorstel_reden && (
                      <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                        {o.voorstel_reden}
                      </div>
                    )}
                  </div>
                  <form action={accordeerObject}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={o.id} />
                    <button className="btn btn-primary btn-sm">Accordeer</button>
                  </form>
                  <form action={wijsAfObject}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={o.id} />
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--red)" }}
                    >
                      Wijs af
                    </button>
                  </form>
                </div>
              ))}

              {voorgesteldeVerbanden.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-[10px] p-3"
                  style={{ background: "var(--bg)" }}
                >
                  <div className="flex-1">
                    <div className="text-[13.5px] font-semibold">
                      {label(v.bron_id)} → {label(v.doel_id)}{" "}
                      <span
                        className="text-[11px] font-normal"
                        style={{ color: "var(--text-3)" }}
                      >
                        {v.rol ?? "koppeling"}
                      </span>
                    </div>
                    {v.voorstel_reden && (
                      <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
                        {v.voorstel_reden}
                      </div>
                    )}
                  </div>
                  <form action={accordeerVerband}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={v.id} />
                    <button className="btn btn-primary btn-sm">Accordeer</button>
                  </form>
                  <form action={wijsAfVerband}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={v.id} />
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--red)" }}
                    >
                      Wijs af
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Handmatig toevoegen */}
        <form
          action={objectHandmatig}
          className="card mb-5 flex flex-wrap items-end gap-3 p-4"
        >
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="min-w-[200px] flex-1">
            <label className="label-up mb-1 block">Object handmatig toevoegen</label>
            <input className="input" name="naam" placeholder="Naam, bv. Koetshuis" required />
          </div>
          <div>
            <label className="label-up mb-1 block">Categorie</label>
            <select className="input" name="categorie" defaultValue="gebouw">
              {HANDMATIG_CATEGORIEEN.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-ghost">
            Toevoegen
          </button>
        </form>

        {/* Lijst per categorie */}
        {geaccordeerdeObjecten.length === 0 ? (
          <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
            Nog geen stamobjecten. Verrijk uit een document of voeg er handmatig
            een toe.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {[...gegroepeerd.entries()].map(([categorie, objecten]) => (
              <div key={categorie} className="card p-4">
                <div className="mb-2 text-[13px] font-semibold">
                  {CATEGORIE_LABEL[categorie] ?? categorie} ({objecten.length})
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {objecten.map((o) => {
                    const kn = o.kenmerken ?? {};
                    const isGebouw = ["gebouw", "woning", "opstal"].includes(
                      o.categorie,
                    );
                    const m2 = Number(kn.oppervlakte_m2);
                    const opp = Number.isFinite(m2)
                      ? isGebouw
                        ? `${m2} m²`
                        : `${(m2 / 10000).toLocaleString("nl-NL", {
                            maximumFractionDigits: 2,
                          })} ha`
                      : null;
                    const detail = [
                      o.beschrijving,
                      kn.adres ? String(kn.adres) : null,
                      opp,
                      kn.bouwjaar ? `bouwjaar ${String(kn.bouwjaar)}` : null,
                      kn.pandstatus ? String(kn.pandstatus) : null,
                      kn.gebruik ? String(kn.gebruik) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const koppelingen = alleVerbanden
                      .filter(
                        (v) =>
                          v.status === "geaccordeerd" &&
                          (v.bron_id === o.id || v.doel_id === o.id),
                      )
                      .map((v) => {
                        const ander = v.bron_id === o.id ? v.doel_id : v.bron_id;
                        return `${v.rol ?? "gekoppeld"}: ${label(ander)}`;
                      })
                      .join(" · ");
                    return (
                      <ObjectBewerken
                        key={o.id}
                        object={{
                          id: o.id,
                          naam: o.naam,
                          categorie: o.categorie,
                          beschrijving: o.beschrijving,
                          gebruik: kn.gebruik != null ? String(kn.gebruik) : null,
                        }}
                        detail={detail}
                        koppelingen={koppelingen}
                        categorieOpties={categorieOpties}
                        gebruikOpties={GEBRUIK_OPTIES}
                        landgoedId={id}
                        bewerkObject={bewerkObject}
                        verwijderObject={verwijderObject}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
