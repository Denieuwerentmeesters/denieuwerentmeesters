import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { aiBeschikbaar } from "@/lib/ai";
import {
  RadarKaart,
  IcoonKlok,
  IcoonWereld,
  IcoonVinkje,
} from "@/components/RadarKaart";
import {
  nieuwBericht,
  berichtNaarTaak,
  slaProfielOp,
  leidBronnenAf,
  haalBerichtenOp,
} from "./acties";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import LangeActieKnop from "@/components/LangeActieKnop";

const BESTUURSLAAG_LABEL: Record<string, string> = {
  gemeente: "gemeente",
  buurgemeente: "buurgemeente",
  provincie: "provincie",
  waterschap: "waterschap",
  omgevingsdienst: "omgevingsdienst",
};

type Bericht = {
  id: string;
  titel: string | null;
  samenvatting: string | null;
  motivering: string | null;
  thema: string | null;
  status: string | null;
  url: string | null;
  bericht_datum: string | null;
  geo_relatie: string | null;
  geo_status: string | null;
  afstand_m: number | string | null;
  termijn_soort: string | null;
  termijn_einddatum: string | null;
  bestuursorgaan: string | null;
  weggefilterd_reden?: string | null;
};

/** Dagen tot een termijn verloopt; negatief betekent verstreken. */
function dagenTot(datum: string): number {
  const d = new Date(datum);
  const nu = new Date();
  return Math.ceil((d.getTime() - nu.getTime()) / 86400000);
}

export default async function OmgevingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ spoor?: string }>;
}) {
  const { id } = await params;
  const { spoor } = await searchParams;
  // Zonder `spoor` toont de pagina het overzicht met de kaarten; mét spoor de
  // lijst erachter. Zelfde opbouw als de subsidieradar, zodat "een radar" in
  // dit platform overal hetzelfde werkt.
  const huidigSpoor =
    spoor === "actie" || spoor === "weten" || spoor === "afgehandeld" || spoor === "weggefilterd"
      ? spoor
      : null;
  const supabase = await createClient();

  const [
    { data: berichten },
    { data: profiel },
    { data: bronnen },
    { data: runs },
    { data: gefilterdeRijen, count: gefilterdCount },
  ] = await Promise.all([
      supabase
        .from("omgevingsbericht")
        .select(
          "id, titel, samenvatting, relevantie_score, relevant, motivering, thema, status, url, bericht_datum, geo_relatie, geo_status, geo_niveau, afstand_m, termijn_soort, termijn_einddatum, bestuursorgaan",
        )
        .eq("landgoed_id", id)
        // Weggefilterde berichten horen niet in de gewone lijst; die komen
        // alleen boven bij het doorklikken.
        .neq("status", "weggefilterd")
        .order("termijn_einddatum", { ascending: true, nullsFirst: false })
        .order("bericht_datum", { ascending: false }),
      supabase
        .from("omgeving_profiel")
        .select("provincie, gemeenten, themas, trefwoorden, drempel")
        .eq("landgoed_id", id)
        .maybeSingle(),
      supabase
        .from("omgevingsbron")
        .select("id, naam, bestuurslaag, herkomst, laatste_run_op")
        .eq("landgoed_id", id)
        .order("bestuurslaag"),
      supabase
        .from("omgeving_run")
        .select(
          "gestart_op, aantal_opgehaald, aantal_door_poort, aantal_relevant, aantal_onplaatsbaar, fout",
        )
        .eq("landgoed_id", id)
        .order("gestart_op", { ascending: false })
        .limit(1),
      // Wat is er weggefilterd? Dit is het tegengif tegen een filter dat te
      // streng staat zonder dat iemand het merkt. Alleen ophalen als ernaar
      // gevraagd wordt — het zijn er honderden per ronde.
      spoor === "weggefilterd"
        ? supabase
            .from("omgevingsbericht")
            .select(
              "id, titel, samenvatting, motivering, thema, status, url, bericht_datum, geo_relatie, geo_status, afstand_m, termijn_soort, termijn_einddatum, bestuursorgaan, weggefilterd_reden",
            )
            .eq("landgoed_id", id)
            .eq("status", "weggefilterd")
            .order("afstand_m", { ascending: true, nullsFirst: false })
            .limit(300)
        : supabase
            .from("omgevingsbericht")
            .select("id", { count: "exact", head: true })
            .eq("landgoed_id", id)
            .eq("status", "weggefilterd"),
    ]);

  const alle = berichten ?? [];
  // Actie vereist: er loopt een termijn die nog niet verstreken is.
  const actie = alle.filter(
    (b) => b.termijn_einddatum && dagenTot(b.termijn_einddatum) >= 0 && b.status !== "omgezet",
  );
  const afgehandeld = alle.filter((b) => b.status === "omgezet");
  const weten = alle.filter((b) => !actie.includes(b) && !afgehandeld.includes(b));
  const laatsteRun = runs?.[0];

  const basis = `/landgoed/${id}/omgeving`;
  // Krap = minder dan veertien dagen. Dat is het punt waarop een zienswijze
  // schrijven nog kan maar niet meer vrijblijvend is.
  const krap = actie.filter(
    (b) => b.termijn_einddatum && dagenTot(b.termijn_einddatum) <= 14,
  ).length;
  const opGrond = weten.filter((b) => b.geo_relatie === "overlap").length;
  const nietTePlaatsen = weten.filter((b) => b.geo_status !== "geplaatst").length;

  const gefilterd = (gefilterdeRijen ?? []) as unknown as Bericht[];
  const weggefilterd = huidigSpoor === "weggefilterd" ? gefilterd.length : (gefilterdCount ?? 0);

  const spoorTitel =
    huidigSpoor === "actie"
      ? "Actie vereist"
      : huidigSpoor === "weten"
        ? "Goed om te weten"
        : huidigSpoor === "afgehandeld"
          ? "Afgehandeld"
          : huidigSpoor === "weggefilterd"
            ? "Weggefilterd"
            : null;

  const spoorBerichten =
    huidigSpoor === "actie"
      ? actie
      : huidigSpoor === "weten"
        ? weten
        : huidigSpoor === "weggefilterd"
          ? gefilterd
          : afgehandeld;

  /** Eén regel onder aan een kaart: waar gaat het over? */
  function themaRegel(rijen: Bericht[]): string {
    const per = new Map<string, number>();
    for (const b of rijen) {
      const t = b.thema ?? "overig";
      per.set(t, (per.get(t) ?? 0) + 1);
    }
    return [...per.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, n]) => `${t} ${n}`)
      .join(" · ");
  }

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          {spoorTitel ? (
            <>
              <Link href={basis} className="hover:underline">
                Omgevingsradar
              </Link>
              {" › "}
              <span style={{ color: "var(--text-1, inherit)" }}>{spoorTitel}</span>
            </>
          ) : (
            "Omgevingsradar"
          )}
        </div>
      </div>

      <div className="p-7">
        {!huidigSpoor && (
          <header className="mb-6">
            <h1 className="text-[22px] font-bold">Omgevingsradar</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Wat anderen besluiten dat uw landgoed raakt. Kies waar u naar wilt kijken.
              {!aiBeschikbaar() && " (AI-filter staat uit — voeg ANTHROPIC_API_KEY toe.)"}
            </p>
          </header>
        )}


        {/* ─── Niveau 1: het overzicht met de kaarten ─── */}
        {!huidigSpoor && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <RadarKaart
              href={`${basis}?spoor=actie`}
              icoon={IcoonKlok}
              aantal={actie.length}
              eenheid={actie.length === 1 ? "termijn" : "termijnen"}
              titel="Actie vereist"
              uitleg="Er loopt een termijn. Wie dit mist, verliest zijn positie definitief."
              stip={krap > 0 ? "rood" : actie.length > 0 ? "amber" : "grijs"}
              stipTekst={
                krap > 0
                  ? `${krap} ${krap === 1 ? "verloopt" : "verlopen"} binnen 14 dagen`
                  : actie.length > 0
                    ? "Nog ruim de tijd"
                    : "Geen lopende termijn"
              }
              voet={themaRegel(actie)}
            />
            <RadarKaart
              href={`${basis}?spoor=weten`}
              icoon={IcoonWereld}
              aantal={weten.length}
              eenheid="berichten"
              titel="Goed om te weten"
              uitleg="Raakt uw omgeving, maar u hoeft nu niets te doen."
              stip={opGrond > 0 ? "amber" : "grijs"}
              stipTekst={
                opGrond > 0
                  ? `${opGrond} ${opGrond === 1 ? "ligt" : "liggen"} op uw eigen grond`
                  : "Niets op eigen grond"
              }
              voet={
                nietTePlaatsen > 0
                  ? `${themaRegel(weten)}${themaRegel(weten) ? " · " : ""}${nietTePlaatsen} zonder locatie`
                  : themaRegel(weten)
              }
            />
            <RadarKaart
              href={`${basis}?spoor=afgehandeld`}
              icoon={IcoonVinkje}
              aantal={afgehandeld.length}
              eenheid="afgerond"
              titel="Afgehandeld"
              uitleg="Omgezet naar een taak of agendapunt. Hier voor de historie."
              stip="grijs"
              stipTekst={afgehandeld.length > 0 ? "Opgevolgd" : "Nog niets afgehandeld"}
              voet={themaRegel(afgehandeld)}
            />
          </div>
        )}

        {!huidigSpoor && alle.length === 0 && (
          <div className="card mt-4 p-5 text-[13px]" style={{ color: "var(--text-2)" }}>
            {(bronnen ?? []).length === 0
              ? "Nog geen berichten — leid eerst de bronnen af en haal daarna berichten op."
              : laatsteRun
                ? `Niets gevonden dat uw landgoed raakt — ${laatsteRun.aantal_opgehaald} publicaties beoordeeld.`
                : "Nog geen berichten — klik op “Berichten ophalen”."}
          </div>
        )}

        {/* Profiel, bronnen en handmatig toevoegen horen bij het overzicht.
            Achter een spoor gaat het alleen nog om de lijst. */}
        {!huidigSpoor && (
        <>
        <details className="card mb-5 mt-6 p-4">
          <summary className="cursor-pointer text-[13px] font-semibold">
            Relevantieprofiel {profiel?.provincie ? `· ${profiel.provincie}` : ""}
          </summary>
          <form action={slaProfielOp} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="hidden" name="landgoed_id" value={id} />
            <div>
              <label className="label-up mb-1 block">Provincie</label>
              <input className="input" name="provincie" defaultValue={profiel?.provincie ?? ""} />
            </div>
            <div>
              <label className="label-up mb-1 block">Gemeenten (komma)</label>
              <input className="input" name="gemeenten" defaultValue={(profiel?.gemeenten ?? []).join(", ")} />
            </div>
            <div>
              <label className="label-up mb-1 block">Thema&apos;s (komma)</label>
              <input className="input" name="themas" defaultValue={(profiel?.themas ?? []).join(", ")} placeholder="pacht, natuur, monument" />
            </div>
            <div>
              <label className="label-up mb-1 block">Trefwoorden (komma)</label>
              <input className="input" name="trefwoorden" defaultValue={(profiel?.trefwoorden ?? []).join(", ")} />
            </div>
            <div>
              <label className="label-up mb-1 block">Drempel (0-100)</label>
              <input className="input" type="number" name="drempel" defaultValue={profiel?.drempel ?? 60} />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-ghost">Opslaan</button>
            </div>
          </form>
        </details>

        {/* Bronnen — afgeleid uit de percelen, niet ingevuld */}
        <div className="card mb-5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold">Bronnen</div>
              <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                Afgeleid uit de ligging van uw percelen — u hoeft niets in te vullen.
              </div>
            </div>
            <div className="flex gap-2">
              <form action={leidBronnenAf}>
                <input type="hidden" name="landgoed_id" value={id} />
                <LangeActieKnop
                  className="btn btn-ghost btn-sm"
                  bezigTekst="We zoeken uit welke overheden over uw grond gaan"
                >
                  {(bronnen ?? []).length ? "Afleiding verversen" : "Bronnen afleiden"}
                </LangeActieKnop>
              </form>
              {(bronnen ?? []).length > 0 && (
                <form action={haalBerichtenOp}>
                  <input type="hidden" name="landgoed_id" value={id} />
                  <input type="hidden" name="maanden" value="1" />
                  <LangeActieKnop>Berichten ophalen</LangeActieKnop>
                </form>
              )}
            </div>
          </div>

          {(bronnen ?? []).length === 0 ? (
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
              Nog geen bronnen. Klik op &ldquo;Bronnen afleiden&rdquo; — de radar zoekt uit
              welke gemeente, buurgemeenten, provincie en waterschap over uw grond gaan.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {(bronnen ?? []).map((b) => (
                <span key={b.id} className="tag tag-gray">
                  {b.naam}
                  <span style={{ opacity: 0.6 }}>
                    {" · "}
                    {BESTUURSLAAG_LABEL[b.bestuurslaag ?? ""] ?? b.bestuurslaag}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Eén regel in gewone taal. De interne trechtercijfers (hoeveel er
              niet te plaatsen was, waar het opgehaalde werd afgekapt) horen
              niet op het hoofdscherm: dat legt een tekortkoming uit in plaats
              van hem op te lossen. Wie het detail wil, klikt door naar
              "wat is er weggefilterd". */}
          {laatsteRun && (
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-3)" }}>
              Laatst gecontroleerd op{" "}
              {new Date(laatsteRun.gestart_op).toLocaleDateString("nl-NL", {
                day: "numeric",
                month: "long",
              })}
              . {laatsteRun.aantal_opgehaald.toLocaleString("nl-NL")} publicaties bekeken,{" "}
              {laatsteRun.aantal_relevant}{" "}
              {laatsteRun.aantal_relevant === 1 ? "raakt" : "raken"} uw landgoed.
              {weggefilterd > 0 && (
                <>
                  {" "}
                  <Link href={`${basis}?spoor=weggefilterd`} className="underline">
                    Bekijk wat er is weggefilterd ({weggefilterd})
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        {/* Nieuw bericht */}
        <ToevoegenToggle label="bericht toevoegen">
          <form action={nieuwBericht} className="flex flex-col gap-3">
            <input type="hidden" name="landgoed_id" value={id} />
            <div className="flex flex-wrap gap-3">
              <input className="input flex-1" name="titel" placeholder="Titel" required style={{ minWidth: 220 }} />
              <input className="input" type="date" name="bericht_datum" />
              <input className="input flex-1" name="url" placeholder="URL (optioneel)" style={{ minWidth: 180 }} />
            </div>
            <textarea className="input" name="tekst" rows={3} placeholder="Plak de tekst van het bericht — de AI beoordeelt de relevantie." />
            <div>
              <button type="submit" className="btn btn-primary">Toevoegen{aiBeschikbaar() ? " + beoordelen" : ""}</button>
            </div>
          </form>
        </ToevoegenToggle>
        </>
        )}

        {/* ─── Niveau 2: de lijst achter een spoor ─── */}
        {huidigSpoor && (
          <>
            <Link
              href={basis}
              className="text-[12.5px] hover:underline"
              style={{ color: "var(--text-2)" }}
            >
              ← Terug naar de radar
            </Link>
            <h1 className="mt-1 text-[22px] font-bold">{spoorTitel}</h1>
            <p className="mb-5 mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              {huidigSpoor === "actie"
                ? "Er loopt een termijn. Wie dit mist, verliest zijn positie definitief."
                : huidigSpoor === "weten"
                  ? "Raakt uw omgeving, maar u hoeft nu niets te doen."
                  : huidigSpoor === "weggefilterd"
                    ? "Wat de radar heeft gezien maar niet heeft doorgelaten, met de reden erbij. Staat hier zodat u kunt controleren of het filter niet te streng staat — mist u hier iets, laat het weten."
                    : "Omgezet naar een taak of agendapunt."}
            </p>
            <Bak
              titel={spoorTitel ?? ""}
              berichten={spoorBerichten}
              landgoed={id}
              gedempt={huidigSpoor !== "actie"}
              zonderKop
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Eén van de drie bakjes uit het weekbericht. */
function Bak({
  titel,
  berichten,
  landgoed,
  urgent,
  gedempt,
  zonderKop,
}: {
  titel: string;
  berichten: Bericht[];
  landgoed: string;
  urgent?: boolean;
  gedempt?: boolean;
  /** Achter een spoor staat de titel al in de kop van de pagina. */
  zonderKop?: boolean;
}) {
  if (berichten.length === 0 && !urgent && !zonderKop) return null;

  return (
    <section>
      {!zonderKop && (
        <h2 className="mb-2 text-[13px] font-semibold">
          {titel}{" "}
          <span style={{ color: "var(--text-3)", fontWeight: 400 }}>
            ({berichten.length})
          </span>
        </h2>
      )}

      {berichten.length === 0 ? (
        <div className="card p-4 text-[12.5px]" style={{ color: "var(--text-3)" }}>
          Hier staat op dit moment niets.
        </div>
      ) : (
        <div className="flex flex-col gap-3" style={gedempt ? { opacity: 0.85 } : undefined}>
          {berichten.map((b) => {
            const dagen = b.termijn_einddatum ? dagenTot(b.termijn_einddatum) : null;
            const krap = dagen != null && dagen <= 14;
            return (
              <div key={b.id} className="card p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{b.titel}</span>
                      {b.thema && <span className="tag tag-gray">{b.thema}</span>}
                      {b.geo_relatie === "overlap" && (
                        <span className="tag tag-red">op uw grond</span>
                      )}
                      {b.geo_relatie === "omvat" && (
                        <span className="tag tag-blue">u ligt in dit gebied</span>
                      )}
                      {b.geo_relatie === "nabij" && b.afstand_m != null && (
                        <span className="tag tag-amber">
                          {Math.round(Number(b.afstand_m))} m
                        </span>
                      )}
                      {b.geo_status === "onplaatsbaar" && !b.weggefilterd_reden && (
                        <span className="tag tag-gray">niet te plaatsen</span>
                      )}
                      {b.weggefilterd_reden && (
                        <span className="tag tag-gray">
                          {b.weggefilterd_reden === "te_ver"
                            ? b.afstand_m != null
                              ? `${Math.round(Number(b.afstand_m)).toLocaleString("nl-NL")} m — buiten bereik`
                              : "buiten bereik"
                            : b.weggefilterd_reden === "niet_te_plaatsen"
                              ? "adres niet gevonden"
                              : "geen locatie genoemd"}
                        </span>
                      )}
                      {dagen != null && (
                        <span className={`tag ${krap ? "tag-red" : "tag-gray"}`}>
                          {b.termijn_soort}
                          {dagen >= 0 ? ` — nog ${dagen} dagen` : " — verstreken"}
                        </span>
                      )}
                      {b.status === "omgezet" && <span className="tag tag-blue">→ taak</span>}
                    </div>

                    {b.samenvatting && (
                      <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                        {b.samenvatting}
                      </p>
                    )}

                    {/* Verantwoording: waarom komt dit bericht door? Zonder dit
                        vertrouwt niemand het filter en klikt iedereen alles open. */}
                    {b.motivering && (
                      <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                        {b.motivering}
                      </p>
                    )}

                    <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                      {b.bestuursorgaan && <>{b.bestuursorgaan} · </>}
                      {b.bericht_datum}
                      {b.url && (
                        <>
                          {" · "}
                          <a href={b.url} target="_blank" rel="noreferrer" className="underline">
                            bron
                          </a>
                        </>
                      )}
                    </p>
                  </div>

                  {b.status !== "omgezet" && b.status !== "weggefilterd" && (
                    <form action={berichtNaarTaak}>
                      <input type="hidden" name="landgoed_id" value={landgoed} />
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="titel" value={`Opvolgen: ${b.titel}`} />
                      <button type="submit" className="btn btn-ghost btn-sm">
                        Maak taak
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
