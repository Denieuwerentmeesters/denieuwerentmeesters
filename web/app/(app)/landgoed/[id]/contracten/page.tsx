import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { nieuwContract } from "../actions";
import { nieuwContractUitDocument } from "./acties";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import ContractUploadVak from "@/components/ContractUploadVak";
import { CONTRACT_STATUS_LABEL, CONTRACT_TYPE_LABEL } from "./constanten";
import { afloopTekst, beoordeelAfloop } from "@/lib/contracten/afloop";

// De AI leest bij bulk-upload meerdere pdf's achter elkaar — dat duurt
// langer dan de standaard serverless-limiet.
export const maxDuration = 300;

function dagenTot(datum: string | null): number | null {
  if (!datum) return null;
  const d = new Date(datum).getTime() - Date.now();
  return Math.ceil(d / 86400000);
}

function euro(n: number | null) {
  if (n === null || n === undefined) return null;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

const STATUS_TAG: Record<string, string> = {
  actief: "tag-green",
  concept: "tag-amber",
  beeindiging_aangekondigd: "tag-amber",
  beeindigd: "tag-gray",
};

// Het contractenregister (herzien op wens Steven): de lijst is de hoofdmoot
// — filterbaar, gesorteerd op aflopen, met een duidelijke kolom voor de
// aflooptermijn (oranje binnen de verlengtermijn, rood als verlopen). De
// AI-upload blijft direct beschikbaar, maar als compacte strook.
export default async function ContractenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    melding?: string;
    type?: string;
    status?: string;
    q?: string;
    sorteer?: string;
    richting?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const melding = sp.melding;
  const filterType = sp.type && sp.type in CONTRACT_TYPE_LABEL ? sp.type : "";
  const filterStatus =
    sp.status && sp.status in CONTRACT_STATUS_LABEL ? sp.status : "";
  const zoek = (sp.q ?? "").trim();
  const SORTEERBAAR = ["contract", "type", "prijs", "status", "afloop"];
  const sorteer = SORTEERBAAR.includes(sp.sorteer ?? "") ? sp.sorteer! : "afloop";
  const richting = sp.richting === "neer" ? "neer" : "op";
  const supabase = await createClient();

  let query = supabase
    .from("contract")
    .select(
      "id, titel, contractnummer, type, partij, bedrag, ingangsdatum, einddatum, indexatie_type, volgende_indexatie, status",
    )
    .eq("landgoed_id", id)
    .order("einddatum", { nullsFirst: false });
  if (filterType) query = query.eq("type", filterType);
  if (filterStatus) query = query.eq("status", filterStatus);
  const { data: contracten } = await query;

  const vandaag = new Date().toISOString().slice(0, 10);
  const rijen = (contracten ?? []).map((c) => ({
    ...c,
    afloop: beoordeelAfloop(vandaag, c.ingangsdatum, c.einddatum),
    indexatieDagen: dagenTot(c.volgende_indexatie),
  }));
  const aandacht = rijen.filter(
    (r) => r.afloop && r.afloop.oordeel !== "rustig" && r.status !== "beeindigd",
  ).length;

  // Zoeken (titel, nummer, partij) en sorteren gebeuren in het geheugen —
  // het register is klein en zo blijven alle kolommen sorteerbaar.
  const zoekLc = zoek.toLowerCase();
  const vergelijk: Record<string, (a: (typeof rijen)[number], b: (typeof rijen)[number]) => number> = {
    contract: (a, b) => a.titel.localeCompare(b.titel, "nl"),
    type: (a, b) => String(a.type ?? "").localeCompare(String(b.type ?? ""), "nl"),
    prijs: (a, b) =>
      (a.bedrag == null ? Number.POSITIVE_INFINITY : Number(a.bedrag)) -
      (b.bedrag == null ? Number.POSITIVE_INFINITY : Number(b.bedrag)),
    status: (a, b) => String(a.status ?? "").localeCompare(String(b.status ?? ""), "nl"),
    afloop: (a, b) => (a.einddatum ?? "9999").localeCompare(b.einddatum ?? "9999"),
  };
  const getoond = (
    zoekLc
      ? rijen.filter((r) =>
          [r.titel, r.contractnummer, r.partij].some((v) =>
            (v ?? "").toLowerCase().includes(zoekLc),
          ),
        )
      : [...rijen]
  ).sort(vergelijk[sorteer]);
  if (richting === "neer") getoond.reverse();

  const basisPad = `/landgoed/${id}/contracten`;
  // Eén href-bouwer voor filters, zoeken en sorteren: wat je niet
  // meegeeft blijft staan; "" wist expliciet.
  function bouwHref(over: {
    type?: string;
    status?: string;
    q?: string;
    sorteer?: string;
    richting?: string;
  }) {
    const qd = new URLSearchParams();
    const t = over.type ?? filterType;
    if (t) qd.set("type", t);
    const s = over.status ?? filterStatus;
    if (s) qd.set("status", s);
    const z = over.q ?? zoek;
    if (z) qd.set("q", z);
    const so = over.sorteer ?? sorteer;
    if (so !== "afloop") qd.set("sorteer", so);
    const ri = over.richting ?? richting;
    if (ri !== "op") qd.set("richting", ri);
    const str = qd.toString();
    return str ? `${basisPad}?${str}` : basisPad;
  }
  function filterHref(nieuwType: string, nieuwStatus: string) {
    return bouwHref({ type: nieuwType, status: nieuwStatus });
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
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Contracten
        </div>
      </div>

      <div className="p-7">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold">Contracten</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Pacht, erfpacht, huur en beheer — met signalering op einddatum en
              indexatie.
            </p>
          </div>
          <Link href={`${basisPad}/kaart`} className="btn btn-ghost btn-sm">
            Bekijk op de kaart
          </Link>
        </header>

        {melding && (
          <div
            className="card mb-4 p-4 text-[13px]"
            style={{ background: "var(--amber-light, #fef3c7)" }}
          >
            {melding}
          </div>
        )}

        {/* AI-invoer: compacte strook — slepen of kiezen werkt direct. */}
        <ContractUploadVak landgoedId={id} action={nieuwContractUitDocument} compact />

        {aandacht > 0 && (
          <div
            className="mb-4 rounded-md border px-4 py-3 text-[12.5px] font-medium"
            style={{ background: "#FEF3C7", borderColor: "#F59E0B", color: "#92400E" }}
          >
            {aandacht === 1
              ? "1 contract zit binnen de verlengtermijn — tijd om te verlengen of op te zeggen."
              : `${aandacht} contracten zitten binnen de verlengtermijn — tijd om te verlengen of op te zeggen.`}
          </div>
        )}

        {/* Filters: type en status, als losse pillen. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href={filterHref("", filterStatus)} className={pil(filterType === "")}>
            Alle typen
          </Link>
          {Object.entries(CONTRACT_TYPE_LABEL).map(([w, l]) => (
            <Link key={w} href={filterHref(w, filterStatus)} className={pil(filterType === w)}>
              {l}
            </Link>
          ))}
          <span className="mx-1 text-[12px]" style={{ color: "var(--text-3)" }}>
            ·
          </span>
          <Link href={filterHref(filterType, "")} className={pil(filterStatus === "")}>
            Alle statussen
          </Link>
          {Object.entries(CONTRACT_STATUS_LABEL).map(([w, l]) => (
            <Link
              key={w}
              href={filterHref(filterType, w)}
              className={pil(filterStatus === w)}
            >
              {l}
            </Link>
          ))}
          {/* Zoekveld: Enter zoekt; filters en sortering reizen mee. */}
          <form method="get" className="ml-auto flex items-center gap-2">
            {filterType && <input type="hidden" name="type" value={filterType} />}
            {filterStatus && <input type="hidden" name="status" value={filterStatus} />}
            {sorteer !== "afloop" && <input type="hidden" name="sorteer" value={sorteer} />}
            {richting !== "op" && <input type="hidden" name="richting" value={richting} />}
            <input
              className="input py-1 text-[12.5px]"
              style={{ height: "auto", width: 220 }}
              name="q"
              defaultValue={zoek}
              placeholder="Zoek op titel, nummer of partij…"
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

        {/* Het register zelf: gesorteerd op einddatum, met de aflooptermijn
            als eigen kolom. */}
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {sorteerKop("contract", "Contract", "px-5")}
                {sorteerKop("type", "Type", "px-3")}
                {sorteerKop("prijs", "Prijs", "px-3")}
                {sorteerKop("status", "Status", "px-3")}
                {sorteerKop("afloop", "Loopt af", "px-5")}
              </tr>
            </thead>
            <tbody>
              {getoond.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-5 text-[13px]"
                    style={{ color: "var(--text-2)" }}
                  >
                    Geen contracten
                    {zoek
                      ? ` gevonden voor “${zoek}”`
                      : filterType || filterStatus
                        ? " binnen dit filter"
                        : ""}
                    .
                  </td>
                </tr>
              )}
              {getoond.map((c) => (
                <tr
                  key={c.id}
                  className="align-top"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`${basisPad}/${c.id}`}
                      className="text-[14px] font-semibold underline"
                    >
                      {c.titel}
                    </Link>
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-2)" }}>
                      {[c.contractnummer, c.partij].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    {c.type && (
                      <span className="tag tag-gray">
                        {CONTRACT_TYPE_LABEL[c.type] ?? c.type}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5">
                    {euro(c.bedrag) ? `${euro(c.bedrag)}/jaar` : "—"}
                  </td>
                  <td className="px-3 py-3.5">
                    {c.status && (
                      <span className={`tag ${STATUS_TAG[c.status] ?? "tag-gray"}`}>
                        {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    {c.afloop ? (
                      <div className="flex flex-col items-start gap-1">
                        {c.afloop.oordeel === "verlopen" && (
                          <span className="tag tag-red">verlopen</span>
                        )}
                        {c.afloop.oordeel === "aandacht" && (
                          <span className="tag tag-amber">
                            {afloopTekst(c.afloop.dagen)}
                          </span>
                        )}
                        {c.afloop.oordeel === "rustig" && (
                          <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                            {afloopTekst(c.afloop.dagen)}
                          </span>
                        )}
                        <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
                          {c.einddatum}
                        </span>
                        {c.indexatieDagen !== null &&
                          c.indexatieDagen >= 0 &&
                          c.indexatieDagen <= 90 && (
                            <span className="tag tag-blue">
                              indexatie over {c.indexatieDagen} d
                            </span>
                          )}
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

        <div className="mt-4">
          <ToevoegenToggle label="contract handmatig toevoegen" stijl="tekst">
            <form action={nieuwContract} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <input type="hidden" name="landgoed_id" value={id} />
              <div className="sm:col-span-2 md:col-span-1">
                <label className="label-up mb-1 block">Titel</label>
                <input className="input" name="titel" placeholder="Bijv. Pacht weiland zuid" required />
              </div>
              <div>
                <label className="label-up mb-1 block">Type</label>
                <select className="input" name="type" defaultValue="pacht">
                  <option value="pacht">Pacht</option>
                  <option value="erfpacht">Erfpacht</option>
                  <option value="huur">Huur</option>
                  <option value="beheer">Beheer</option>
                </select>
              </div>
              <div>
                <label className="label-up mb-1 block">Partij</label>
                <input className="input" name="partij" placeholder="Tegenpartij" />
              </div>
              <div>
                <label className="label-up mb-1 block">Bedrag (€/jaar)</label>
                <input className="input" name="bedrag" inputMode="decimal" placeholder="0" />
              </div>
              <div>
                <label className="label-up mb-1 block">Servicekosten (€)</label>
                <input className="input" name="servicekosten" inputMode="decimal" placeholder="0" />
              </div>
              <div>
                <label className="label-up mb-1 block">Ingangsdatum</label>
                <input className="input" type="date" name="ingangsdatum" />
              </div>
              <div>
                <label className="label-up mb-1 block">Einddatum</label>
                <input className="input" type="date" name="einddatum" />
              </div>
              <div>
                <label className="label-up mb-1 block">Indexatie</label>
                <select className="input" name="indexatie_type" defaultValue="">
                  <option value="">Geen</option>
                  <option value="CBS-CPI">CBS-CPI</option>
                  <option value="vast %">Vast %</option>
                </select>
              </div>
              <div>
                <label className="label-up mb-1 block">Volgende indexatie</label>
                <input className="input" type="date" name="volgende_indexatie" />
              </div>
              <div className="sm:col-span-2 md:col-span-3">
                <button type="submit" className="btn btn-primary">
                  Contract toevoegen
                </button>
              </div>
            </form>
          </ToevoegenToggle>
        </div>
      </div>
    </div>
  );
}
