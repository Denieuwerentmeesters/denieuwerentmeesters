import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { nieuwContact, bevestigContact, voegContactSamen } from "./acties";
import { bevestigExtractie, afwijsExtractie } from "../actions";
import type { ExtractieRunRow } from "@/lib/extractie_mail";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";

function nf(val: string | undefined | null) {
  return !val || val === "niet gevonden" ? null : val;
}

const STATUS_TAG: Record<string, string> = {
  actief: "tag-green",
  latent: "tag-gray",
  gearchiveerd: "tag-red",
};

const GROEP_LABEL: Record<string, string> = {
  relatie: "Relatie",
  dienstverlener: "Dienstverlener",
  instantie: "Instantie",
  overig: "Overig",
};

function ConceptKaart({ run, landgoed_id }: { run: ExtractieRunRow; landgoed_id: string }) {
  const c = (run.concept ?? {}) as Record<string, string>;
  const naam = nf(c.naam) ?? "Onbekend";
  const rol = nf(c.rol_voorstel);
  const status = nf(c.status_voorstel);

  return (
    <div
      className="card mb-4 border-l-4 p-5"
      style={{ borderLeftColor: "var(--accent)", borderColor: "var(--border)" }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
            AI-voorstel uit mail
          </div>
          <div className="mt-0.5 text-[16px] font-bold">{naam}</div>
          {nf(c.omschrijving) && (
            <div className="mt-0.5 text-[13px]" style={{ color: "var(--text-2)" }}>{c.omschrijving}</div>
          )}
        </div>
        <div className="flex gap-1.5">
          {rol && <span className="tag tag-gray">{rol}</span>}
          {status && <span className="tag tag-gray">{status}</span>}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
        {([["E-mail", c.email], ["Telefoon", c.telefoon], ["Organisatie", c.organisatie], ["Herkomst", c.bron_notitie]] as [string, string][]).map(([label, val]) => (
          <div key={label} className="flex gap-1.5">
            <span className="shrink-0 font-medium" style={{ color: "var(--text-2)" }}>{label}:</span>
            <span style={{ color: nf(val) ? "inherit" : "var(--text-3)" }}>{nf(val) ?? "—"}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <form action={bevestigExtractie}>
          <input type="hidden" name="landgoed_id" value={landgoed_id} />
          <input type="hidden" name="run_id" value={run.id} />
          <button type="submit" className="btn btn-primary text-[13px]">Toevoegen als contact</button>
        </form>
        <form action={afwijsExtractie}>
          <input type="hidden" name="landgoed_id" value={landgoed_id} />
          <input type="hidden" name="run_id" value={run.id} />
          <button type="submit" className="btn text-[13px]">Afwijzen</button>
        </form>
      </div>
    </div>
  );
}

// Het contactenregister (herzien op wens Steven, zelfde recept als het
// contractenregister): de lijst als tabel met filterpillen; toevoegen als
// bescheiden tekstlink eronder. AI-contacten die op bevestiging wachten
// krijgen een teller-banner en hun acties in de tabel.
export default async function ContactenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    rol?: string;
    q?: string;
    sorteer?: string;
    richting?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const filterStatus = sp.status ?? "actief";
  const filterRol = sp.rol ?? "";
  const zoek = (sp.q ?? "").trim();
  const SORTEERBAAR = ["contact", "rollen", "status", "tedoen"];
  const sorteer = SORTEERBAAR.includes(sp.sorteer ?? "") ? sp.sorteer! : "contact";
  const richting = sp.richting === "neer" ? "neer" : "op";

  const supabase = await createClient();

  const [{ data: conceptRuns }, { data: rolTypen }, contactenRes] = await Promise.all([
    supabase
      .from("intake_run")
      .select("*")
      .eq("landgoed_id", id)
      .eq("status", "concept")
      .order("aangemaakt_op", { ascending: false }),
    supabase
      .from("rol_type")
      .select("id, naam, groep")
      .order("groep")
      .order("naam"),
    supabase
      .from("relatie")
      .select("id, naam, organisatie, email, telefoon, omschrijving, status, herkomst, geaccordeerd, contact_rol(rol_type_id, rol_type(naam))")
      .eq("landgoed_id", id)
      .eq("status", filterStatus || "actief")
      .order("naam"),
  ]);

  const runs = (conceptRuns ?? []) as ExtractieRunRow[];
  const rollen = rolTypen ?? [];

  type ContactRolRow = { rol_type_id: string; rol_type: { naam: string } | null };
  type ContactRow = {
    id: string; naam: string; organisatie: string | null; email: string | null;
    telefoon: string | null; omschrijving: string | null; status: string;
    herkomst: string; geaccordeerd: boolean;
    contact_rol: ContactRolRow[];
  };

  const alleBinnenStatus = (contactenRes.data ?? []) as unknown as ContactRow[];
  const naRol = filterRol
    ? alleBinnenStatus.filter((c) =>
        c.contact_rol.some((cr) => cr.rol_type_id === filterRol)
      )
    : alleBinnenStatus;

  // Zoeken en sorteren in het geheugen — klein register, alle kolommen
  // sorteerbaar (zelfde recept als het contractenregister).
  const zoekLc = zoek.toLowerCase();
  const rolTekst = (c: ContactRow) =>
    c.contact_rol
      .map((cr) => cr.rol_type?.naam ?? "")
      .sort()
      .join(", ");
  const vergelijk: Record<string, (a: ContactRow, b: ContactRow) => number> = {
    contact: (a, b) => a.naam.localeCompare(b.naam, "nl"),
    rollen: (a, b) => rolTekst(a).localeCompare(rolTekst(b), "nl"),
    status: (a, b) => a.status.localeCompare(b.status, "nl"),
    // "Nog te doen": onbevestigde AI-contacten eerst.
    tedoen: (a, b) =>
      Number(b.herkomst === "ai" && !b.geaccordeerd) -
      Number(a.herkomst === "ai" && !a.geaccordeerd),
  };
  const contacten = (
    zoekLc
      ? naRol.filter((c) =>
          [c.naam, c.organisatie, c.email, c.telefoon, c.omschrijving].some((v) =>
            (v ?? "").toLowerCase().includes(zoekLc),
          ),
        )
      : [...naRol]
  ).sort(vergelijk[sorteer]);
  if (richting === "neer") contacten.reverse();

  // Alleen rollen die binnen deze status echt voorkomen als filterpil.
  const rollenInGebruik = new Map<string, string>();
  for (const c of alleBinnenStatus) {
    for (const cr of c.contact_rol) {
      if (cr.rol_type?.naam) rollenInGebruik.set(cr.rol_type_id, cr.rol_type.naam);
    }
  }
  const teBevestigen = alleBinnenStatus.filter(
    (c) => c.herkomst === "ai" && !c.geaccordeerd,
  ).length;

  const statusOpties = [
    { value: "actief", label: "Actief" },
    { value: "latent", label: "Latent" },
    { value: "gearchiveerd", label: "Gearchiveerd" },
  ];

  const basisPad = `/landgoed/${id}/contacten`;
  // Eén href-bouwer: wat je niet meegeeft blijft staan; "" wist expliciet.
  function bouwHref(over: {
    status?: string;
    rol?: string;
    q?: string;
    sorteer?: string;
    richting?: string;
  }) {
    const qd = new URLSearchParams();
    const s = over.status ?? filterStatus;
    if (s) qd.set("status", s);
    const r = over.rol ?? filterRol;
    if (r) qd.set("rol", r);
    const z = over.q ?? zoek;
    if (z) qd.set("q", z);
    const so = over.sorteer ?? sorteer;
    if (so !== "contact") qd.set("sorteer", so);
    const ri = over.richting ?? richting;
    if (ri !== "op") qd.set("richting", ri);
    const str = qd.toString();
    return str ? `${basisPad}?${str}` : basisPad;
  }
  function filterHref(nieuweStatus: string, nieuweRol: string) {
    return bouwHref({ status: nieuweStatus, rol: nieuweRol });
  }
  function sorteerHref(kolom: string) {
    return bouwHref({
      sorteer: kolom,
      richting: sorteer === kolom && richting === "op" ? "neer" : "op",
    });
  }
  const sorteerKop = (kolom: string, label: string, klasse: string) => (
    <th className={`label-up py-3 font-semibold ${klasse}`}>
      <Link href={sorteerHref(kolom)} className="inline-flex items-center gap-1 hover:underline">
        {label}
        {sorteer === kolom && <span>{richting === "op" ? "↑" : "↓"}</span>}
      </Link>
    </th>
  );
  const pil = (actief: boolean) =>
    `rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
      actief
        ? "border-transparent bg-[var(--primary)] text-white"
        : "border-[var(--border)] bg-white text-[var(--text-2)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
    }`;

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>Contacten</div>
      </div>

      <div className="p-7">
        <header className="mb-5">
          <h1 className="text-[22px] font-bold">Contacten</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Iedereen rond het landgoed: pachters, huurders, overheden, dienstverleners.
          </p>
        </header>

        {/* Concept-runs uit mail */}
        {runs.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 text-[13px] font-semibold">Te beoordelen ({runs.length})</div>
            {runs.map((run) => (
              <ConceptKaart key={run.id} run={run} landgoed_id={id} />
            ))}
          </section>
        )}

        {teBevestigen > 0 && (
          <div
            className="mb-4 rounded-md border px-4 py-3 text-[12.5px] font-medium"
            style={{ background: "#FEF3C7", borderColor: "#F59E0B", color: "#92400E" }}
          >
            {teBevestigen === 1
              ? "1 contact is aangemaakt door AI en wacht op je bevestiging."
              : `${teBevestigen} contacten zijn aangemaakt door AI en wachten op je bevestiging.`}
          </div>
        )}

        {/* Filters: status en (gebruikte) rollen als pillen. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {statusOpties.map((s) => (
            <Link
              key={s.value}
              href={filterHref(s.value, filterRol)}
              className={pil(filterStatus === s.value)}
            >
              {s.label}
            </Link>
          ))}
          {rollenInGebruik.size > 0 && (
            <>
              <span className="mx-1 text-[12px]" style={{ color: "var(--text-3)" }}>·</span>
              <Link href={filterHref(filterStatus, "")} className={pil(filterRol === "")}>
                Alle rollen
              </Link>
              {[...rollenInGebruik.entries()]
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([rolId, naam]) => (
                  <Link
                    key={rolId}
                    href={filterHref(filterStatus, rolId)}
                    className={pil(filterRol === rolId)}
                  >
                    {naam}
                  </Link>
                ))}
            </>
          )}
          {/* Zoekveld: Enter zoekt; filters en sortering reizen mee. */}
          <form method="get" className="ml-auto flex items-center gap-2">
            {filterStatus && <input type="hidden" name="status" value={filterStatus} />}
            {filterRol && <input type="hidden" name="rol" value={filterRol} />}
            {sorteer !== "contact" && <input type="hidden" name="sorteer" value={sorteer} />}
            {richting !== "op" && <input type="hidden" name="richting" value={richting} />}
            <input
              className="input py-1 text-[12.5px]"
              style={{ height: "auto", width: 220 }}
              name="q"
              defaultValue={zoek}
              placeholder="Zoek op naam, e-mail, organisatie…"
            />
            {zoek && (
              <Link
                href={bouwHref({ q: "" })}
                className="text-[12px] underline"
                style={{ color: "var(--text-2)" }}
              >
                wis
              </Link>
            )}
          </form>
        </div>

        {/* Het register zelf. */}
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {sorteerKop("contact", "Contact", "px-5")}
                {sorteerKop("rollen", "Rollen", "px-3")}
                {sorteerKop("status", "Status", "px-3")}
                {sorteerKop("tedoen", "Nog te doen", "px-5")}
              </tr>
            </thead>
            <tbody>
              {contacten.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-5 text-[13px]" style={{ color: "var(--text-2)" }}>
                    Geen contacten gevonden{zoek ? ` voor “${zoek}”` : ""}.
                  </td>
                </tr>
              )}
              {contacten.map((c) => (
                <tr key={c.id} className="align-top" style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`${basisPad}/${c.id}`}
                        className="text-[14px] font-semibold underline"
                      >
                        {c.naam}
                      </Link>
                      {c.organisatie && (
                        <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                          · {c.organisatie}
                        </span>
                      )}
                    </div>
                    {[c.email, c.telefoon, c.omschrijving].filter(Boolean).length > 0 && (
                      <div className="mt-0.5 max-w-[420px] truncate text-[12px]" style={{ color: "var(--text-2)" }}>
                        {[c.email, c.telefoon, c.omschrijving].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.contact_rol.slice(0, 3).map((cr) => (
                        <span key={cr.rol_type_id} className="tag tag-gray text-[11px]">
                          {cr.rol_type?.naam ?? "—"}
                        </span>
                      ))}
                      {c.contact_rol.length > 3 && (
                        <span className="tag tag-gray text-[11px]">+{c.contact_rol.length - 3}</span>
                      )}
                      {c.contact_rol.length === 0 && (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`tag ${STATUS_TAG[c.status] ?? "tag-gray"} text-[11px]`}>{c.status}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {c.herkomst === "ai" && !c.geaccordeerd ? (
                      <div className="flex flex-col items-start gap-1.5">
                        <span className="tag tag-amber text-[11px]">Aangemaakt door AI</span>
                        <form action={bevestigContact}>
                          <input type="hidden" name="landgoed_id" value={id} />
                          <input type="hidden" name="contact_id" value={c.id} />
                          <button type="submit" className="btn btn-primary btn-sm text-[11.5px]">
                            Bevestig
                          </button>
                        </form>
                        {/* Blijkt het een dubbele van een bestaand contact
                            (andere schrijfwijze): samenvoegen — koppelingen
                            verhuizen mee, de dubbele verdwijnt. */}
                        <form action={voegContactSamen} className="flex items-center gap-1">
                          <input type="hidden" name="landgoed_id" value={id} />
                          <input type="hidden" name="contact_id" value={c.id} />
                          <select
                            className="input text-[11.5px] py-1"
                            style={{ height: "auto", maxWidth: 170 }}
                            name="doel_contact_id"
                            defaultValue=""
                            required
                          >
                            <option value="">— is dezelfde als… —</option>
                            {contacten
                              .filter((ander) => ander.id !== c.id)
                              .map((ander) => (
                                <option key={ander.id} value={ander.id}>
                                  {ander.naam}
                                </option>
                              ))}
                          </select>
                          <button type="submit" className="btn btn-ghost btn-sm text-[11.5px]">
                            Voeg samen
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-3)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Nieuw contact: bescheiden tekstlink onder het register. */}
        <div className="mt-4">
          <ToevoegenToggle label="contact toevoegen" stijl="tekst">
            <form action={nieuwContact}>
              <input type="hidden" name="landgoed_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="label-up mb-1 block">Naam *</label>
                  <input className="input" name="naam" placeholder="Voor- en achternaam" required />
                </div>
                <div>
                  <label className="label-up mb-1 block">Organisatie</label>
                  <input className="input" name="organisatie" placeholder="Bedrijf / firma" />
                </div>
                <div>
                  <label className="label-up mb-1 block">Rol</label>
                  <select className="input" name="rol_type_id" defaultValue="">
                    <option value="">— geen rol —</option>
                    {Object.entries(
                      rollen.reduce<Record<string, typeof rollen>>((acc, r) => {
                        (acc[r.groep] = acc[r.groep] ?? []).push(r);
                        return acc;
                      }, {})
                    ).map(([groep, items]) => (
                      <optgroup key={groep} label={GROEP_LABEL[groep] ?? groep}>
                        {items.map((r) => (
                          <option key={r.id} value={r.id}>{r.naam}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-up mb-1 block">E-mail</label>
                  <input className="input" name="email" type="email" placeholder="naam@…" />
                </div>
                <div>
                  <label className="label-up mb-1 block">Telefoon</label>
                  <input className="input" name="telefoon" placeholder="06…" />
                </div>
                <div>
                  <label className="label-up mb-1 block">Status</label>
                  <select className="input" name="status" defaultValue="actief">
                    <option value="actief">Actief</option>
                    <option value="latent">Latent</option>
                    <option value="gearchiveerd">Gearchiveerd</option>
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label-up mb-1 block">Omschrijving</label>
                  <input className="input" name="omschrijving" placeholder="Korte omschrijving" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label-up mb-1 block">Herkomst</label>
                  <input
                    className="input"
                    name="bron"
                    placeholder="bv. doorgestuurd via mail 12-6, aangedragen door Jos"
                  />
                </div>
              </div>
              <div className="mt-4">
                <button type="submit" className="btn btn-primary">Toevoegen</button>
              </div>
            </form>
          </ToevoegenToggle>
        </div>
      </div>
    </div>
  );
}
