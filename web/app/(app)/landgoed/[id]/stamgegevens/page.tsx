import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { aiBeschikbaar } from "@/lib/ai";
import SubmitKnop from "@/components/SubmitKnop";
import ObjectBewerken from "@/components/ObjectBewerken";
import VoorstelReview from "./VoorstelReview";
import {
  verrijkUitBron,
  accordeerObject,
  wijsAfObject,
  voegSamen,
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
  bovenliggend_id: string | null;
  lijkt_op_id: string | null;
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
        "id, naam, categorie, beschrijving, geaccordeerd, voorstel_reden, kenmerken, bovenliggend_id, lijkt_op_id",
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
  const naamLijst: [string, string][] = Array.from(naamVan.entries());
  const voorgesteldeVerbandItems = alleVerbanden
    .filter((v) => v.status === "voorgesteld")
    .map((v) => ({ id: v.id, bron_id: v.bron_id, doel_id: v.doel_id, rol: v.rol }));

  const pdfDocumenten = (documentenRes.data ?? []).filter((d) =>
    d.bestand_pad?.toLowerCase().endsWith(".pdf"),
  );

  // Koppeling-labels (géén onderdeel_van — dat is hiërarchie) voor één object.
  const koppelingLabels = (
    objId: string,
    status: "voorgesteld" | "geaccordeerd",
  ) =>
    alleVerbanden
      .filter(
        (v) =>
          v.status === status &&
          v.rol !== "onderdeel_van" &&
          (v.bron_id === objId || v.doel_id === objId),
      )
      .map((v) => {
        const ander = v.bron_id === objId ? v.doel_id : v.bron_id;
        return `${v.rol ?? "gekoppeld"}: ${label(ander)}`;
      })
      .join(" · ");

  // ── Geaccordeerde catalogus: hoofdobjecten per categorie, onderdelen genest ──
  const acceptedIds = new Set(geaccordeerdeObjecten.map((o) => o.id));
  const isHoofd = (o: Obj) =>
    !o.bovenliggend_id || !acceptedIds.has(o.bovenliggend_id);
  const kinderenVan = new Map<string, Obj[]>();
  for (const o of geaccordeerdeObjecten) {
    if (!isHoofd(o) && o.bovenliggend_id) {
      const l = kinderenVan.get(o.bovenliggend_id) ?? [];
      l.push(o);
      kinderenVan.set(o.bovenliggend_id, l);
    }
  }
  const gegroepeerd = new Map<string, Obj[]>();
  for (const o of geaccordeerdeObjecten) {
    if (!isHoofd(o)) continue; // onderdelen verschijnen genest onder hun hoofdobject
    const lijst = gegroepeerd.get(o.categorie) ?? [];
    lijst.push(o);
    gegroepeerd.set(o.categorie, lijst);
  }
  const bovenliggendOptiesAlle: [string, string][] = geaccordeerdeObjecten.map(
    (o) => [o.id, o.naam],
  );

  const aiUit = !aiBeschikbaar();
  const categorieOpties: [string, string][] = HANDMATIG_CATEGORIEEN.map((c) => [
    c,
    CATEGORIE_LABEL[c] ?? c,
  ]);

  // Eén catalogus-rij (recursief: onderdelen ingesprongen onder hun hoofdobject).
  function renderTak(o: Obj, diepte: number) {
    const kn = o.kenmerken ?? {};
    const isGebouw = ["gebouw", "woning", "opstal"].includes(o.categorie);
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
    return (
      <Fragment key={o.id}>
        <div style={{ marginLeft: diepte * 18 }}>
          <ObjectBewerken
            object={{
              id: o.id,
              naam: o.naam,
              categorie: o.categorie,
              beschrijving: o.beschrijving,
              gebruik: kn.gebruik != null ? String(kn.gebruik) : null,
            }}
            detail={detail}
            koppelingen={koppelingLabels(o.id, "geaccordeerd")}
            categorieOpties={categorieOpties}
            gebruikOpties={GEBRUIK_OPTIES}
            bovenliggendId={o.bovenliggend_id}
            bovenliggendOpties={bovenliggendOptiesAlle.filter(
              ([v]) => v !== o.id,
            )}
            landgoedId={id}
            bewerkObject={bewerkObject}
            verwijderObject={verwijderObject}
          />
        </div>
        {(kinderenVan.get(o.id) ?? []).map((k) => renderTak(k, diepte + 1))}
      </Fragment>
    );
  }

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
          <form action={verrijkUitBron} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="flex-1">
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
        {voorgesteldeObjecten.length > 0 && (
          <VoorstelReview
            alleVoorstellen={voorgesteldeObjecten}
            verbanden={voorgesteldeVerbandItems}
            naamLijst={naamLijst}
            categorieLabel={CATEGORIE_LABEL}
            landgoedId={id}
            accordeerObject={accordeerObject}
            wijsAfObject={wijsAfObject}
            voegSamen={voegSamen}
          />
        )}

        {/* Handmatig toevoegen */}
        <form
          action={objectHandmatig}
          className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <input type="hidden" name="landgoed_id" value={id} />
          <div className="flex-1">
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
                  {objecten.map((o) => renderTak(o, 0))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
