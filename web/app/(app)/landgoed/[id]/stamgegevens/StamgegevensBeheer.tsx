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
  accordeerVerband,
  wijsAfVerband,
} from "./acties";
import {
  CATEGORIE_LABEL,
  HANDMATIG_CATEGORIEEN,
  categorieOptiesVoor,
  gebruikOptiesVoor,
} from "./constanten";

// Het volledige stamgegevens-beheer (verrijken, review, handmatig, catalogus).
// Gedeeld door de profielpagina en de stamgegevenspagina — voorheen stond dit
// blok als kopie op beide, met scheefgroei tot gevolg. Haalt zijn eigen data op.

type Obj = {
  id: string;
  naam: string;
  categorie: string;
  beschrijving: string | null;
  voorstel_reden: string | null;
  kenmerken: Record<string, unknown> | null;
  bovenliggend_id: string | null;
  lijkt_op_id: string | null;
  geaccordeerd: boolean;
  herkomst: string | null;
  aangemaakt_op: string | null;
};
type Verband = {
  id: string;
  bron_type: string;
  bron_id: string;
  doel_type: string;
  doel_id: string;
  rol: string | null;
  voorstel_reden: string | null;
  status: string;
};

export default async function StamgegevensBeheer({ landgoedId }: { landgoedId: string }) {
  const id = landgoedId;
  const supabase = await createClient();

  const [objectenRes, verbandenRes, documentenRes, runsRes, contractenRes, relatiesRes] =
    await Promise.all([
      supabase
        .from("stamobject")
        .select(
          "id, naam, categorie, beschrijving, geaccordeerd, voorstel_reden, kenmerken, bovenliggend_id, lijkt_op_id, herkomst, aangemaakt_op",
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
      supabase.from("contract").select("id, titel").eq("landgoed_id", id),
      supabase.from("relatie").select("id, naam").eq("landgoed_id", id),
    ]);

  // Kadastrale registratie: per beheerperceel de gekoppelde percelen (stap 1).
  const { data: kadData } = await supabase
    .from("beheerperceel_kadastraal")
    .select("stamobject_id, dekking, kadastraal_perceel(kadastrale_aanduiding, oppervlakte_m2)")
    .eq("landgoed_id", id);
  const kadVan = new Map<string, { aanduiding: string; oppervlakteM2: number | null; dekking: string }[]>();
  for (const rij of (kadData ?? []) as unknown as {
    stamobject_id: string;
    dekking: string;
    kadastraal_perceel: { kadastrale_aanduiding: string; oppervlakte_m2: number | null } | null;
  }[]) {
    if (!rij.kadastraal_perceel) continue;
    const lijst = kadVan.get(rij.stamobject_id) ?? [];
    lijst.push({
      aanduiding: rij.kadastraal_perceel.kadastrale_aanduiding,
      oppervlakteM2: rij.kadastraal_perceel.oppervlakte_m2 != null ? Number(rij.kadastraal_perceel.oppervlakte_m2) : null,
      dekking: rij.dekking,
    });
    kadVan.set(rij.stamobject_id, lijst);
  }

  const alleObjecten = (objectenRes.data ?? []) as Obj[];
  const voorgesteldeObjecten = alleObjecten.filter((o) => !o.geaccordeerd);
  const geaccordeerdeObjecten = alleObjecten.filter((o) => o.geaccordeerd);
  const alleVerbanden = (verbandenRes.data ?? []) as Verband[];

  // Labelkaarten voor het weergeven van koppelingen.
  const naamVan = new Map<string, string>();
  alleObjecten.forEach((o) => naamVan.set(o.id, o.naam));
  (contractenRes.data ?? []).forEach((c) => naamVan.set(c.id, c.titel));
  (relatiesRes.data ?? []).forEach((r) => naamVan.set(r.id, r.naam));
  const label = (eid: string) => naamVan.get(eid) ?? "onbekend";
  const naamLijst: [string, string][] = Array.from(naamVan.entries());

  const voorgesteldeVerbanden = alleVerbanden.filter((v) => v.status === "voorgesteld");
  const voorgesteldeVerbandItems = voorgesteldeVerbanden.map((v) => ({
    id: v.id,
    bron_id: v.bron_id,
    doel_id: v.doel_id,
    rol: v.rol,
  }));

  // Losse voorgestelde koppelingen: beide eindpunten bestaan al (geen van beide
  // zit in de review-wachtrij). Die worden bij het accorderen van een object dus
  // NIET meegenomen en waren voorheen onzichtbaar — hier apart te beoordelen.
  const voorstelIds = new Set(voorgesteldeObjecten.map((o) => o.id));
  const losseVoorstellen = voorgesteldeVerbanden.filter(
    (v) => !voorstelIds.has(v.bron_id) && !voorstelIds.has(v.doel_id),
  );

  const pdfDocumenten = (documentenRes.data ?? []).filter((d) =>
    d.bestand_pad?.toLowerCase().endsWith(".pdf"),
  );

  // Koppeling-labels (géén onderdeel_van — dat is hiërarchie) voor één object.
  const koppelingLabels = (objId: string, status: "voorgesteld" | "geaccordeerd") =>
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
  const isHoofd = (o: Obj) => !o.bovenliggend_id || !acceptedIds.has(o.bovenliggend_id);
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
  const bovenliggendOptiesAlle: [string, string][] = geaccordeerdeObjecten.map((o) => [
    o.id,
    o.naam,
  ]);

  const aiUit = !aiBeschikbaar();

  // Eén catalogus-rij (recursief: onderdelen ingesprongen onder hun hoofdobject).
  function renderTak(o: Obj, diepte: number) {
    const kn = o.kenmerken ?? {};
    const isGebouw = ["gebouw", "woning", "opstal"].includes(o.categorie);
    // Kadastrale registratie is leidend voor oppervlakte en aanduidingen;
    // de kenmerken-json is de terugval.
    const kad = kadVan.get(o.id) ?? [];
    const kadM2 = kad.reduce((som, p) => som + (p.oppervlakteM2 ?? 0), 0);
    const m2 = kadM2 > 0 ? kadM2 : Number(kn.oppervlakte_m2);
    const opp = Number.isFinite(m2)
      ? isGebouw
        ? `${m2} m²`
        : `${(m2 / 10000).toLocaleString("nl-NL", { maximumFractionDigits: 2 })} ha`
      : null;
    const kadastraal = kad.length
      ? `kadastraal: ${kad
          .map((p) => p.aanduiding + (p.dekking === "gedeeltelijk" ? " (deels)" : ""))
          .join(", ")}`
      : null;
    const isMonumentGebouw = isGebouw && kn.is_rijksmonument === true;
    // Herkomst altijd zichtbaar: waar komt dit object vandaan, en wanneer?
    const d = o.aangemaakt_op ? new Date(o.aangemaakt_op) : null;
    const herkomstLabel = `${o.herkomst === "ai" ? "AI" : "handmatig"}${
      d && Number.isFinite(d.getTime())
        ? ` · ${d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`
        : ""
    }`;
    const detail = [
      o.beschrijving,
      kn.adres ? String(kn.adres) : null,
      opp,
      kadastraal,
      kn.bouwjaar ? `bouwjaar ${String(kn.bouwjaar)}` : null,
      kn.pandstatus ? String(kn.pandstatus) : null,
      kn.gebruik ? String(kn.gebruik) : null,
      herkomstLabel,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <Fragment key={o.id}>
        <div style={{ marginLeft: diepte * 18 }}>
          {isMonumentGebouw && (
            <div className="mb-1 ml-1 mt-1">
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style={{ background: "#fef3c7", color: "#92400e" }}
              >
                Rijksmonument
                {kn.rijksmonument_nummer != null ? ` #${String(kn.rijksmonument_nummer)}` : ""}
                {kn.rijksmonument_categorie != null
                  ? ` · ${String(kn.rijksmonument_categorie)}`
                  : ""}
              </span>
            </div>
          )}
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
            categorieOpties={categorieOptiesVoor(o.categorie)}
            gebruikOpties={gebruikOptiesVoor(o.categorie, kn.gebruik != null ? String(kn.gebruik) : null)}
            bovenliggendId={o.bovenliggend_id}
            bovenliggendOpties={bovenliggendOptiesAlle.filter(([v]) => v !== o.id)}
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
    <>
      {aiUit && (
        <div className="card mb-5 p-4 text-[13px]" style={{ color: "var(--text-2)" }}>
          AI staat uit (geen <code>ANTHROPIC_API_KEY</code>). Verrijken werkt niet;
          handmatig toevoegen kan wel.
        </div>
      )}

      {/* Verrijk uit bron */}
      <div className="card mb-5 p-4">
        <div className="mb-3 text-[14px] font-semibold">Verrijk uit een bron</div>
        <form
          action={verrijkUitBron}
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
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
          <SubmitKnop className="btn btn-primary" disabled={aiUit} pendingTekst="AI leest…">
            Lees met AI
          </SubmitKnop>
        </form>
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
          Kies een document of je banktransacties; de AI stelt objecten en koppelingen
          voor die je daarna controleert. (E-mail en boekhouding komen later als extra
          bron.)
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

      {/* Review-wachtrij voor voorgestelde objecten */}
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

      {/* Losse voorgestelde koppelingen (beide kanten bestaan al) */}
      {losseVoorstellen.length > 0 && (
        <div className="card mb-5 p-4">
          <div className="mb-1 text-[14px] font-semibold">
            Voorgestelde koppelingen ({losseVoorstellen.length})
          </div>
          <p className="mb-3 text-[12px]" style={{ color: "var(--text-3)" }}>
            Koppelingen tussen bestaande gegevens, voorgesteld door de AI. Beoordeel ze
            los van de objecten.
          </p>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {losseVoorstellen.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-[220px] flex-1">
                  <div className="text-[13.5px]">
                    <span className="font-semibold">{label(v.bron_id)}</span>
                    <span style={{ color: "var(--text-2)" }}>
                      {" "}
                      — {v.rol ?? "gekoppeld aan"} —{" "}
                    </span>
                    <span className="font-semibold">{label(v.doel_id)}</span>
                  </div>
                  {v.voorstel_reden && (
                    <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                      {v.voorstel_reden}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <form action={accordeerVerband}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={v.id} />
                    <SubmitKnop className="btn btn-primary btn-sm" pendingTekst="…">
                      Akkoord
                    </SubmitKnop>
                  </form>
                  <form action={wijsAfVerband}>
                    <input type="hidden" name="landgoed_id" value={id} />
                    <input type="hidden" name="id" value={v.id} />
                    <SubmitKnop className="btn btn-ghost btn-sm" pendingTekst="…">
                      Wijs af
                    </SubmitKnop>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Handmatig toevoegen */}
      <form
        action={objectHandmatig}
        className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end"
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

      {/* Catalogus per categorie */}
      {geaccordeerdeObjecten.length === 0 ? (
        <div className="card p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
          Nog geen stamobjecten. Verrijk uit een document of voeg er handmatig een toe.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {[...gegroepeerd.entries()].map(([categorie, objectenLijst]) => (
            <div key={categorie} className="card p-4">
              <div className="mb-2 text-[13px] font-semibold">
                {CATEGORIE_LABEL[categorie] ?? categorie} ({objectenLijst.length})
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {objectenLijst.map((o) => renderTak(o, 0))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
