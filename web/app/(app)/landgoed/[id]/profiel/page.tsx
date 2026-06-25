import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  controleerRijksmonumenten,
  accordeerMonument,
  verwijderMonument,
  bewaarProfiel,
} from "./acties";

// ── Hulpfuncties ──
function ha(m2: number): string {
  return (m2 / 10000).toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}
function datumKort(iso: unknown): string | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    : null;
}

const PERCEEL_CATS = new Set(["pachtperceel", "perceel"]);

// Perceel-/grondgebruik -> verdeling. Eerst expliciet `gebruik`, anders de
// categorie. Bewust grof; honest label op de tegel ("afgeleid").
function soortVanObject(categorie: string, gebruik: string | null): string {
  const t = `${gebruik ?? ""} ${categorie}`.toLowerCase();
  if (/bos|laan|hout|park.?bos/.test(t)) return "Bos & laanstructuur";
  if (/weide|weiland|gras|pacht|agrar|landbouw/.test(t)) return "Weiland (pacht)";
  if (/park|tuin|gazon/.test(t)) return "Park & tuinen";
  if (/water|vijver|sloot|vecht|gracht|waterloop/.test(t)) return "Water";
  return "Nog niet ingedeeld";
}
const VERDELING_KLEUR: Record<string, string> = {
  "Bos & laanstructuur": "var(--primary)",
  "Weiland (pacht)": "var(--primary-muted)",
  "Park & tuinen": "var(--amber)",
  Water: "#5a9bb5",
  "Nog niet ingedeeld": "var(--border)",
};

// Klein herkomst-/bronlabel onder een tegel.
function Bron({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 text-[11px]" style={{ color: "var(--text-2)" }}>
      {children}
    </div>
  );
}

export default async function ProfielPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: landgoed }, { data: objecten }] = await Promise.all([
    supabase
      .from("landgoed")
      .select(
        "naam, gemeente, provincie, plaats, hectare, nsw_status, nsw_sinds, nsw_openstelling_dagen, nsw_nummer, eigendomsvorm, rechtsvorm, lat, lon, monumenten_gecontroleerd_op",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("stamobject")
      .select("id, naam, categorie, kenmerken, geaccordeerd")
      .eq("landgoed_id", id),
  ]);

  const objs = objecten ?? [];

  // ── Oppervlakte + verdeling (uit percelen) ──
  let perceelM2 = 0;
  let aantalPercelen = 0;
  const verdeling = new Map<string, number>();
  const secties = new Map<string, string[]>(); // "Gemeente Sectie" -> nummers
  for (const o of objs) {
    if (!o.geaccordeerd) continue;
    const k = (o.kenmerken ?? {}) as {
      oppervlakte_m2?: unknown;
      gebruik?: string | null;
      kadastrale_gemeente?: unknown;
      sectie?: unknown;
      perceelnummer?: unknown;
    };
    if (!PERCEEL_CATS.has(o.categorie)) continue;
    aantalPercelen++;
    const m2 = Number(k.oppervlakte_m2);
    if (Number.isFinite(m2)) {
      perceelM2 += m2;
      const soort = soortVanObject(o.categorie, k.gebruik ?? null);
      verdeling.set(soort, (verdeling.get(soort) ?? 0) + m2);
    }
    // Kadastrale aanduiding groeperen
    if (k.sectie) {
      const sleutel = [k.kadastrale_gemeente, `sectie ${k.sectie}`]
        .filter(Boolean)
        .join(" · ");
      const arr = secties.get(sleutel) ?? [];
      if (k.perceelnummer != null) arr.push(String(k.perceelnummer));
      secties.set(sleutel, arr);
    }
  }

  const heeftPercelen = perceelM2 > 0 || aantalPercelen > 0;
  const totaalHa = heeftPercelen
    ? ha(perceelM2)
    : landgoed?.hectare != null
      ? Number(landgoed.hectare).toLocaleString("nl-NL", { maximumFractionDigits: 1 })
      : null;
  const oppervlakteBron = heeftPercelen
    ? "Som van de percelen · Kadaster/PDOK"
    : "Handmatig ingevoerd (geen percelen op de kaart)";

  const verdelingRijen = [...verdeling.entries()].sort((a, b) => b[1] - a[1]);

  // ── Rijksmonumenten ──
  const monumenten = objs.filter((o) => o.categorie === "rijksmonument");
  const monGeaccordeerd = monumenten.filter((o) => o.geaccordeerd);
  const monVoorgesteld = monumenten.filter((o) => !o.geaccordeerd);
  const monumentNrs = monGeaccordeerd
    .map((o) => (o.kenmerken as { rijksmonument_nummer?: unknown })?.rijksmonument_nummer)
    .filter(Boolean);
  const monGecontroleerd = datumKort(landgoed?.monumenten_gecontroleerd_op);

  // ── NSW ──
  const nswActief = (landgoed?.nsw_status ?? "").toLowerCase();
  const nswLabel =
    nswActief.includes("ja") || nswActief.includes("actief") || nswActief.includes("gerangschikt")
      ? "Actief"
      : landgoed?.nsw_status
        ? landgoed.nsw_status
        : "Onbekend";

  const subtitel = [landgoed?.plaats || landgoed?.gemeente, landgoed?.provincie]
    .filter(Boolean)
    .join(", ");
  const basisIngesteld = landgoed?.lat != null && landgoed?.lon != null;

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Profiel
        </div>
      </div>

      <div className="p-7">
        {/* Identiteitskop */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-bold">{landgoed?.naam ?? "Landgoed"}</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Identiteit, oppervlakte, monumenten en kadaster
              {subtitel ? ` · ${subtitel}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <a href="#bewerken" className="btn btn-ghost btn-sm">
              Profiel bewerken
            </a>
            <Link href={`/landgoed/${id}/kaart`} className="btn btn-ghost btn-sm">
              Kadasterkaart openen
            </Link>
          </div>
        </header>

        {/* Vier kerntegels */}
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Oppervlakte */}
          <div
            className="card p-5"
            style={{ background: "var(--primary)", color: "white" }}
          >
            <div className="text-[11px] uppercase tracking-wide opacity-80">
              Oppervlakte landgoed
            </div>
            <div className="mt-1 text-[30px] font-bold leading-tight">
              {totaalHa ? `${totaalHa} ha` : "—"}
            </div>
            <div className="text-[12px] opacity-80">
              {verdelingRijen
                .filter(([s]) => s !== "Nog niet ingedeeld")
                .map(([s]) => s.split(" ")[0].toLowerCase())
                .join(" · ") || "verdeling nog niet ingedeeld"}
            </div>
            <div className="mt-2 text-[11px] opacity-70">{oppervlakteBron}</div>
          </div>

          {/* Rijksmonumenten */}
          <div className="card p-5">
            <div className="label-up">Rijksmonumenten</div>
            <div className="mt-1 text-[30px] font-bold">{monGeaccordeerd.length}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              {monumentNrs.length
                ? `nrs ${monumentNrs.slice(0, 4).join(", ")}${monumentNrs.length > 4 ? "…" : ""}`
                : monVoorgesteld.length
                  ? `${monVoorgesteld.length} voorstel(len) — accordeer hieronder`
                  : "nog niet gecontroleerd"}
            </div>
            <Bron>
              RCE Rijksmonumentenregister
              {monGecontroleerd ? ` · ${monGecontroleerd}` : ""}
            </Bron>
          </div>

          {/* NSW-status */}
          <div className="card p-5">
            <div className="label-up">NSW-status</div>
            <div className="mt-1 text-[30px] font-bold">{nswLabel}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              {landgoed?.nsw_sinds ? `Gerangschikt sinds ${landgoed.nsw_sinds}` : "—"}
              {landgoed?.nsw_openstelling_dagen
                ? ` · ${landgoed.nsw_openstelling_dagen} dgn openstelling`
                : ""}
            </div>
            <Bron>Eigenaar / RVO-beschikking (niet-openbaar)</Bron>
          </div>

          {/* Kadasterpercelen */}
          <div className="card p-5">
            <div className="label-up">Kadasterpercelen</div>
            <div className="mt-1 text-[30px] font-bold">{aantalPercelen}</div>
            <div className="text-[12px]" style={{ color: "var(--text-2)" }}>
              {[...secties.keys()][0] ?? "nog geen percelen op de kaart"}
            </div>
            <Bron>Kadaster/PDOK · geplaatst op de kaart</Bron>
          </div>
        </div>

        {/* Twee kolommen: verdeling + kadaster/juridisch */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Oppervlakteverdeling */}
          <div className="card p-5">
            <h2 className="mb-3 text-[15px] font-bold">Oppervlakteverdeling</h2>
            {verdelingRijen.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
                Nog geen percelen met oppervlakte. Plaats percelen op de{" "}
                <Link href={`/landgoed/${id}/kaart`} className="underline">
                  kaart
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {verdelingRijen.map(([soort, m2]) => {
                  const pct = perceelM2 > 0 ? Math.round((m2 / perceelM2) * 100) : 0;
                  return (
                    <div key={soort}>
                      <div className="mb-1 flex justify-between text-[12.5px]">
                        <span>{soort}</span>
                        <span style={{ color: "var(--text-2)" }}>
                          {ha(m2)} ha · {pct}%
                        </span>
                      </div>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--bg)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: VERDELING_KLEUR[soort] ?? "var(--primary)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Bron>
              Afgeleid uit perceelgebruik — verfijn het gebruik per perceel in{" "}
              <Link href={`/landgoed/${id}/stamgegevens`} className="underline">
                Stamgegevens
              </Link>
              .
            </Bron>
          </div>

          {/* Kadaster & juridisch */}
          <div className="card p-5">
            <h2 className="mb-3 text-[15px] font-bold">Kadaster &amp; juridisch</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              <Rij label="Gemeente" waarde={landgoed?.gemeente} />
              <Rij label="Provincie" waarde={landgoed?.provincie} />
              {[...secties.entries()].map(([s, nrs]) => (
                <Rij
                  key={s}
                  label={s}
                  waarde={nrs.length ? `nrs ${nrs.join(", ")}` : "—"}
                />
              ))}
              <Rij label="Eigendomsvorm" waarde={landgoed?.eigendomsvorm} />
              <Rij label="Rechtsvorm (aanvrager)" waarde={landgoed?.rechtsvorm} />
              <Rij label="NSW-nummer" waarde={landgoed?.nsw_nummer} />
            </dl>
            <Bron>Kadaster/PDOK (percelen) + handmatige invoer (juridisch)</Bron>
          </div>
        </div>

        {/* Monumenten controleren / cureren */}
        <div className="card mt-4 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold">Rijksmonumenten controleren</h2>
            <form action={controleerRijksmonumenten}>
              <input type="hidden" name="landgoed_id" value={id} />
              <button
                className="btn btn-ghost btn-sm"
                disabled={!basisIngesteld}
                title={
                  basisIngesteld
                    ? undefined
                    : "Bepaal eerst de basislocatie op de kaart"
                }
              >
                Controleer (RCE)
              </button>
            </form>
          </div>
          {!basisIngesteld && (
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              Bepaal eerst de basislocatie op de{" "}
              <Link href={`/landgoed/${id}/kaart`} className="underline">
                kaart
              </Link>
              ; dan kan het RCE-register rond het landgoed worden bevraagd.
            </p>
          )}
          {monVoorgesteld.length > 0 && (
            <div className="mb-3">
              <div className="label-up mb-2">
                Voorgesteld ({monVoorgesteld.length}) — horen deze bij het landgoed?
              </div>
              <ul className="flex flex-col gap-2">
                {monVoorgesteld.map((m) => {
                  const k = (m.kenmerken ?? {}) as { url?: string };
                  return (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md p-2"
                      style={{ background: "var(--bg)" }}
                    >
                      <span className="text-[13px]">
                        {k.url ? (
                          <a href={k.url} target="_blank" rel="noreferrer" className="underline">
                            {m.naam}
                          </a>
                        ) : (
                          m.naam
                        )}
                      </span>
                      <span className="flex gap-2">
                        <form action={accordeerMonument}>
                          <input type="hidden" name="landgoed_id" value={id} />
                          <input type="hidden" name="id" value={m.id} />
                          <button className="btn btn-primary btn-sm">Hoort erbij</button>
                        </form>
                        <form action={verwijderMonument}>
                          <input type="hidden" name="landgoed_id" value={id} />
                          <input type="hidden" name="id" value={m.id} />
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--red)" }}
                          >
                            Verwijderen
                          </button>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {monGeaccordeerd.length > 0 && (
            <div>
              <div className="label-up mb-2">Bevestigd ({monGeaccordeerd.length})</div>
              <ul className="flex flex-col gap-1 text-[13px]">
                {monGeaccordeerd.map((m) => {
                  const k = (m.kenmerken ?? {}) as { url?: string };
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span>
                        {k.url ? (
                          <a href={k.url} target="_blank" rel="noreferrer" className="underline">
                            {m.naam}
                          </a>
                        ) : (
                          m.naam
                        )}
                      </span>
                      <form action={verwijderMonument}>
                        <input type="hidden" name="landgoed_id" value={id} />
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--red)" }}
                        >
                          Verwijderen
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Bron>
            Bron: RCE Rijksmonumentenregister (WFS). Voorstellen rond de basislocatie;
            de eigenaar bevestigt welke tot het landgoed horen.
          </Bron>
        </div>

        {/* Profiel bewerken */}
        <details id="bewerken" className="card mt-4 p-5">
          <summary className="cursor-pointer text-[15px] font-bold">
            Profiel bewerken
          </summary>
          <form action={bewaarProfiel} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Veld label="NSW-status" name="nsw_status" defaultValue={landgoed?.nsw_status} placeholder="bv. actief / gerangschikt" />
              <Veld label="NSW gerangschikt sinds (jaar)" name="nsw_sinds" defaultValue={landgoed?.nsw_sinds} type="number" placeholder="bv. 2017" />
              <Veld label="Openstelling (dagen/jaar)" name="nsw_openstelling_dagen" defaultValue={landgoed?.nsw_openstelling_dagen} type="number" placeholder="bv. 40" />
              <Veld label="NSW-nummer" name="nsw_nummer" defaultValue={landgoed?.nsw_nummer} placeholder="beschikkingskenmerk" />
              <Veld label="Eigendomsvorm" name="eigendomsvorm" defaultValue={landgoed?.eigendomsvorm} placeholder="bv. Stichting X" />
              <Veld label="Rechtsvorm (aanvrager)" name="rechtsvorm" defaultValue={landgoed?.rechtsvorm} placeholder="particulier / stichting / bv / …" />
              <Veld label="Oppervlakte handmatig (ha)" name="hectare" defaultValue={landgoed?.hectare} type="number" placeholder="alleen als er geen percelen zijn" />
            </div>
            <div>
              <button className="btn btn-primary btn-sm" type="submit">
                Opslaan
              </button>
            </div>
          </form>
          <Bron>
            NSW-gegevens zijn niet-openbaar en komen van de eigenaar/RVO-beschikking.
            Oppervlakte uit percelen heeft voorrang; het handmatige veld is een fallback.
          </Bron>
        </details>
      </div>
    </div>
  );
}

function Rij({ label, waarde }: { label: string; waarde?: unknown }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: "var(--text-2)" }}>{label}</dt>
      <dd className="text-right font-medium">
        {waarde != null && String(waarde).trim() !== "" ? String(waarde) : "—"}
      </dd>
    </div>
  );
}

function Veld({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: unknown;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px]">
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <input
        className="input"
        name={name}
        type={type}
        defaultValue={defaultValue != null ? String(defaultValue) : ""}
        placeholder={placeholder}
      />
    </label>
  );
}
