import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MeldlinkKaart } from "./MeldlinkKaart";
import { nieuweWerkorder, accordeerWerkorderVoorstel, drempelbedragInstellen } from "../actions";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import { LocatieVeld } from "@/components/LocatieVeld";
import { RadarKaart, IcoonZon, IcoonKlok, IcoonGeld } from "@/components/RadarKaart";

// De databasewaarden blijven gemeld/geaccepteerd/afgerond; dit zijn de woorden
// op het scherm. "Nieuw" en "Wordt aan gewerkt" zeggen de gebruiker meer.
const STATUS_LABEL: Record<string, string> = {
  gemeld: "Nieuw",
  geaccepteerd: "Wordt aan gewerkt",
  afgerond: "Afgerond",
};

// Het spoor in de URL (?status=) los van de databasewaarde, zodat de link
// leesbaar blijft.
const SPOOR_NAAR_STATUS: Record<string, string> = {
  nieuw: "gemeld",
  werk: "geaccepteerd",
  afgerond: "afgerond",
};

const STATUS_TAG: Record<string, string> = {
  gemeld: "tag-blue",
  geaccepteerd: "tag-amber",
  afgerond: "tag-green",
};

// Sortering "wat aandacht vraagt": nieuwe meldingen eerst, afgerond onderaan.
const STATUS_VOLGORDE: Record<string, number> = {
  gemeld: 0,
  geaccepteerd: 1,
  afgerond: 2,
};

export default async function WerkordersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status: spoorRuw } = await searchParams;
  const spoor = spoorRuw && SPOOR_NAAR_STATUS[spoorRuw] ? spoorRuw : null;
  const spoorStatus = spoor ? SPOOR_NAAR_STATUS[spoor] : null;
  const supabase = await createClient();

  const { data: werkordersRaw } = await supabase
    .from("werkorder")
    .select("id, titel, prioriteit, status, deadline, wacht_op_akkoord, toegewezen_aan, toegewezen_aan_naam, aangemaakt_op, ai_voorstel, ai_voorstel_status, profiel!werkorder_toegewezen_aan_fkey(naam, email), stamobject(id, naam)")
    .eq("landgoed_id", id);

  const alle = (werkordersRaw ?? []).slice().sort((a, b) => {
    const va = STATUS_VOLGORDE[a.status] ?? 9;
    const vb = STATUS_VOLGORDE[b.status] ?? 9;
    if (va !== vb) return va - vb;
    return a.aangemaakt_op < b.aangemaakt_op ? 1 : -1; // ouder eerst binnen dezelfde status
  });

  const perStatus = (s: string) => alle.filter((w) => w.status === s);
  const nieuw = perStatus("gemeld");
  const inWerk = perStatus("geaccepteerd");
  const afgerond = perStatus("afgerond");
  // Op het overzicht (geen spoor gekozen) tonen we geen lijst; met spoor alleen
  // de klussen van dat spoor.
  const werkorders = spoorStatus ? perStatus(spoorStatus) : [];

  // Wachten er klussen op akkoord? Dat is het enige dat om directe actie vraagt
  // en hoort daarom op de kaart, niet verstopt in de lijst.
  const wachtNieuw = nieuw.filter((w) => w.wacht_op_akkoord).length;
  const wachtWerk = inWerk.filter((w) => w.wacht_op_akkoord).length;
  const oudsteNieuw = nieuw.length > 0 ? nieuw[nieuw.length - 1].aangemaakt_op : null;

  const { data: landgoed } = await supabase
    .from("landgoed")
    .select("meld_token, werkorder_drempelbedrag")
    .eq("id", id)
    .maybeSingle();

  const { data: rol } = await supabase.rpc("rol_op", { doel_landgoed: id });
  const isEigenaar = rol === "eigenaar";

  // Volledige URL, want een kaal pad is niet te delen met een huurder.
  const kop = await headers();
  const host = kop.get("host") ?? "";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const basisUrl = `${protocol}://${host}`;

  const [ledenRaw, relatiesRaw, objectenRaw] = await Promise.all([
    supabase.from("lidmaatschap").select("gebruiker_id, profiel(id, naam, email)").eq("landgoed_id", id),
    // Alle contacten; wie de 'werkorder'-rol heeft komt bovenaan te staan.
    supabase
      .from("relatie")
      .select("id, naam, contact_rol(rol_type(koppelbaar_aan))")
      .eq("landgoed_id", id)
      .order("naam"),
    // Alleen geaccordeerde objecten, net als op de kaart: een voorgesteld
    // object is nog geen feit en hoort niet als keuze in een formulier.
    supabase
      .from("stamobject")
      .select("id, naam, categorie")
      .eq("landgoed_id", id)
      .eq("geaccordeerd", true)
      .order("naam"),
  ]);
  const objecten = (objectenRaw.data ?? []) as { id: string; naam: string; categorie: string }[];

  const leden = (ledenRaw.data ?? []).map((l) => {
    const p = (l.profiel as unknown) as { id: string; naam: string | null; email: string | null } | null;
    return { id: p?.id ?? l.gebruiker_id, naam: p?.naam ?? p?.email ?? l.gebruiker_id };
  });
  type RelatieRij = {
    id: string;
    naam: string;
    contact_rol?: { rol_type?: { koppelbaar_aan?: string[] | null } | null }[] | null;
  };
  const alleRelaties = (relatiesRaw.data ?? []) as unknown as RelatieRij[];
  const isUitvoerder = (r: RelatieRij) =>
    (r.contact_rol ?? []).some((cr) => cr.rol_type?.koppelbaar_aan?.includes("werkorder"));
  const uitvoerderOpties = alleRelaties
    .filter(isUitvoerder)
    .map((r) => ({ waarde: `c:${r.id}`, naam: r.naam }));
  const overigeContacten = alleRelaties
    .filter((r) => !isUitvoerder(r))
    .map((r) => ({ waarde: `c:${r.id}`, naam: r.naam }));
  const ledenOpties = leden.map((l) => ({ waarde: `u:${l.id}`, naam: l.naam }));

  // Vertaalt de "u:<uuid>"/"c:<naam>"-waarde uit het AI-voorstel naar een naam,
  // zodat het triage-blok toont wíe er wordt voorgesteld in plaats van alleen
  // "Akkoord" — blind akkoord geven op een onzichtbare keuze is geen keuze.
  const naamVoorWaarde = (waarde: string | null) =>
    waarde
      ? ([...ledenOpties, ...uitvoerderOpties].find((o) => o.waarde === waarde)?.naam ?? null)
      : null;

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Meldingen &amp; klussen
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          {spoor ? (
            <>
              <a
                href={`/landgoed/${id}/werkorders`}
                className="text-[12.5px] hover:underline"
                style={{ color: "var(--text-2)" }}
              >
                ← Alle meldingen
              </a>
              <h1 className="mt-1 text-[22px] font-bold">{STATUS_LABEL[spoorStatus!]}</h1>
            </>
          ) : (
            <>
              <h1 className="text-[22px] font-bold">Meldingen &amp; klussen</h1>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                Van melding tot afgerond werk — één kaartje dat meegroeit.
              </p>
            </>
          )}
        </header>

        <ToevoegenToggle label="melding toevoegen">
          <form action={nieuweWerkorder} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="flex-1 basis-full">
              <label className="label-up mb-1 block">Wat is er aan de hand?</label>
              <input className="input" name="titel" placeholder="Bijv. hek bij de weide is kapot" required />
            </div>
            <div className="flex-1 basis-full">
              <label className="label-up mb-1 block">Toelichting</label>
              <textarea className="input w-full" name="omschrijving" rows={2} />
            </div>
            <div>
              <label className="label-up mb-1 block">Prioriteit</label>
              <select className="input" name="prioriteit" defaultValue="">
                <option value="">—</option>
                <option value="hoog">Hoog</option>
                <option value="middel">Middel</option>
                <option value="laag">Laag</option>
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Deadline</label>
              <input className="input" type="date" name="deadline" />
            </div>
            <div>
              <label className="label-up mb-1 block">Uitvoerder</label>
              <select className="input" name="toegewezen_aan" defaultValue="">
                <option value="">— nog te bepalen —</option>
                {leden.length > 0 && (
                  <optgroup label="Gebruikers">
                    {leden.map((l) => (
                      <option key={l.id} value={`u:${l.id}`}>{l.naam}</option>
                    ))}
                  </optgroup>
                )}
                {uitvoerderOpties.length > 0 && (
                  <optgroup label="Uitvoerders">
                    {uitvoerderOpties.map((r) => (
                      <option key={r.waarde} value={r.waarde}>{r.naam}</option>
                    ))}
                  </optgroup>
                )}
                {overigeContacten.length > 0 && (
                  <optgroup label="Overige contacten">
                    {overigeContacten.map((c) => (
                      <option key={c.waarde} value={c.waarde}>{c.naam}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <LocatieVeld />
            <div>
              <label className="label-up mb-1 block">Object</label>
              <select className="input" name="stamobject_id" defaultValue="">
                <option value="">— geen —</option>
                {objecten.map((o) => (
                  <option key={o.id} value={o.id}>{o.naam}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-up mb-1 block">Foto&apos;s</label>
              <input className="input" type="file" name="fotos" accept="image/*" multiple />
            </div>
            <button type="submit" className="btn btn-primary">
              Toevoegen
            </button>
          </form>
        </ToevoegenToggle>

        {landgoed?.meld_token && (
          <MeldlinkKaart url={`${basisUrl}/melden/${landgoed.meld_token}`} />
        )}

        {!spoor && (
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <RadarKaart
              href={`/landgoed/${id}/werkorders?status=nieuw`}
              icoon={IcoonZon}
              aantal={nieuw.length}
              eenheid="nieuw"
              titel="Nieuw"
              uitleg="Binnengekomen meldingen die nog door niemand zijn opgepakt."
              stip={nieuw.length > 0 ? "amber" : "grijs"}
              stipTekst={
                wachtNieuw > 0
                  ? `${wachtNieuw} ${wachtNieuw === 1 ? "wacht" : "wachten"} op akkoord`
                  : nieuw.length > 0
                    ? "Wacht op iemand die het oppakt"
                    : "Niets nieuws"
              }
              voet={
                oudsteNieuw
                  ? `Oudste melding: ${new Date(oudsteNieuw).toLocaleDateString("nl-NL")}`
                  : "Geen openstaande meldingen"
              }
            />
            <RadarKaart
              href={`/landgoed/${id}/werkorders?status=werk`}
              icoon={IcoonKlok}
              aantal={inWerk.length}
              eenheid="lopend"
              titel="Wordt aan gewerkt"
              uitleg="Iemand heeft dit opgepakt. Klaar? Dan wordt de melding afgerond."
              stip={wachtWerk > 0 ? "rood" : "grijs"}
              stipTekst={
                wachtWerk > 0
                  ? `${wachtWerk} ${wachtWerk === 1 ? "wacht" : "wachten"} op akkoord`
                  : "Geen blokkades"
              }
              voet={`${inWerk.length} ${inWerk.length === 1 ? "klus" : "klussen"} onderhanden`}
            />
            <RadarKaart
              href={`/landgoed/${id}/werkorders?status=afgerond`}
              icoon={IcoonGeld}
              aantal={afgerond.length}
              eenheid="afgerond"
              titel="Afgerond"
              uitleg="Afgehandeld werk. Blijft bewaard als historie bij het object."
              stip="grijs"
              stipTekst="Niets meer te doen"
              voet={`${afgerond.length} ${afgerond.length === 1 ? "melding" : "meldingen"} afgehandeld`}
            />
          </div>
        )}

        {isEigenaar && !spoor && (
          <div className="card mb-5 p-4">
            <span className="label-up">Drempelbedrag voor akkoord</span>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-2)" }}>
              Klussen met verwachte kosten <strong>tot en met €{" "}
              {landgoed?.werkorder_drempelbedrag ?? 500}</strong> mogen zonder verdere
              toestemming worden uitgevoerd. Komen de verwachte kosten daar<strong>boven</strong>,
              dan krijgt de melding het label &quot;wacht op akkoord&quot; en moet u die eerst
              goedkeuren voordat er geld wordt uitgegeven.
            </p>
            <form action={drempelbedragInstellen} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="landgoed_id" value={id} />
              <div>
                <label className="label-up mb-1 block">Bedrag in euro</label>
                <input
                  className="input"
                  type="number"
                  step="1"
                  min="0"
                  name="drempelbedrag"
                  defaultValue={landgoed?.werkorder_drempelbedrag ?? 500}
                />
              </div>
              <button type="submit" className="btn btn-ghost btn-sm">Opslaan</button>
            </form>
          </div>
        )}

        {spoor && (
        <div className="card mt-5 divide-y" style={{ borderColor: "var(--border)" }}>
          {werkorders.length === 0 && (
            <div className="p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
              Niets in dit spoor.
            </div>
          )}
          {werkorders.map((w) => {
            const persoon = (w.profiel as unknown) as { naam: string | null; email: string | null } | null;
            const uitvoerderNaam = persoon?.naam ?? persoon?.email ?? w.toegewezen_aan_naam;
            const voorstel = w.ai_voorstel as { uitvoerder_waarde: string | null; urgentie: string; toelichting: string } | null;
            const toonTriage = w.status === "gemeld" && w.ai_voorstel_status === "voorgesteld" && voorstel;
            return (
              <div key={w.id} className="flex flex-col gap-2 px-5 py-3.5" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <a href={`/landgoed/${id}/werkorder/${w.id}`} className="text-[14px] font-semibold hover:underline">
                      {w.titel}
                    </a>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
                      <span className={`tag ${STATUS_TAG[w.status] ?? "tag-gray"}`}>
                        {STATUS_LABEL[w.status] ?? w.status}
                      </span>
                      {w.wacht_op_akkoord && <span className="tag tag-red">wacht op akkoord</span>}
                      {(() => {
                        const obj = (w.stamobject as unknown) as { id: string; naam: string } | null;
                        return obj ? <span>📍 {obj.naam}</span> : null;
                      })()}
                      {w.deadline && <span>Deadline {w.deadline}</span>}
                      {uitvoerderNaam && <span>👤 {uitvoerderNaam}</span>}
                      {w.prioriteit && (
                        <span className={`tag ${w.prioriteit === "hoog" ? "tag-red" : "tag-gray"}`}>
                          {w.prioriteit}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Expliciete actieknop naast de titel-link: een titel die
                      toevallig klikbaar is, is geen zichtbare uitweg. */}
                  <a href={`/landgoed/${id}/werkorder/${w.id}`} className="btn btn-ghost btn-sm">
                    Bekijk
                  </a>
                </div>
                {toonTriage && (() => {
                  const voorgesteld = naamVoorWaarde(voorstel.uitvoerder_waarde);
                  return (
                    <div className="rounded-[8px] p-3 text-[12.5px]" style={{ background: "var(--bg)", color: "var(--text-2)" }}>
                      → AI-voorstel ({voorstel.urgentie}):{" "}
                      {voorgesteld ? <strong>{voorgesteld}</strong> : <strong>geen uitvoerder voorgesteld</strong>}
                      {" — "}
                      {voorstel.toelichting}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
