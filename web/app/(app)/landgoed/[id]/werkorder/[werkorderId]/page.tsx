import { createClient } from "@/lib/supabase/server";
import { voegNotitieToe } from "../../actions";
import {
  werkorderStatusWijzigen,
  werkorderAfronden,
  maakKlusLink,
  werkorderToewijzen,
  accordeerWerkorderVoorstel,
  werkorderKostenBijwerken,
  werkorderAkkoordGeven,
  werkorderObjectKoppelen,
} from "../../actions";

const STATUS_LABEL: Record<string, string> = {
  gemeld: "Gemeld",
  geaccepteerd: "Geaccepteerd",
  afgerond: "Afgerond",
};

const STATUS_TAG: Record<string, string> = {
  gemeld: "tag-blue",
  geaccepteerd: "tag-amber",
  afgerond: "tag-green",
};

export default async function WerkorderDetailPage({
  params,
}: {
  params: Promise<{ id: string; werkorderId: string }>;
}) {
  const { id: landgoed_id, werkorderId } = await params;
  const supabase = await createClient();

  const { data: werkorder } = await supabase
    .from("werkorder")
    .select("id, titel, omschrijving, prioriteit, status, deadline, toegewezen_aan, toegewezen_aan_naam, uitvoerder_relatie_id, kosten_verwacht, kosten_werkelijk, wacht_op_akkoord, ai_voorstel, ai_voorstel_status, fotos_voor, fotos_na, stamobject_id, locatie_omschrijving, lat, lon, profiel!werkorder_toegewezen_aan_fkey(naam, email), stamobject(id, naam)")
    .eq("id", werkorderId)
    .eq("landgoed_id", landgoed_id)
    .single();

  // Alleen nog geldige links tonen — een verlopen link is geen link meer.
  const { data: klusLinks } = await supabase
    .from("werkorder_toegangstoken")
    .select("token, verloopt_op")
    .eq("werkorder_id", werkorderId)
    .gt("verloopt_op", new Date().toISOString())
    .order("aangemaakt_op", { ascending: false })
    .limit(1);
  const klusLink = (klusLinks ?? [])[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notities } = await (supabase as any)
    .from("notitie")
    .select("id, tekst, aangemaakt_op, geschreven_door, profiel(naam, email)")
    .eq("object_type", "werkorder")
    .eq("object_id", werkorderId)
    .order("aangemaakt_op", { ascending: true });

  const { data: landgoed } = await supabase
    .from("landgoed")
    .select("werkorder_drempelbedrag")
    .eq("id", landgoed_id)
    .maybeSingle();

  // De akkoord-knop is voorbehouden aan de eigenaar; de server action toetst
  // dat nogmaals — dit bepaalt alleen of het knopje getoond wordt.
  const { data: rol } = await supabase.rpc("rol_op", { doel_landgoed: landgoed_id });
  const isEigenaar = rol === "eigenaar";

  // Voor het toewijzen-formulier: leden + contacten met een 'werkorder'-rol,
  // zelfde bron als op de lijstpagina.
  const [ledenRaw, relatiesRaw, objectenRaw] = await Promise.all([
    supabase.from("lidmaatschap").select("gebruiker_id, profiel(id, naam, email)").eq("landgoed_id", landgoed_id),
    // Alle contacten van het landgoed, met hun rollen. Bewust géén filter op de
    // 'werkorder'-rol meer: dat maakte de lijst leeg zolang niemand die rol had
    // gekregen, en dwong de gebruiker eerst een rol te gaan instellen. Wie de
    // rol wél heeft staat straks bovenaan.
    supabase
      .from("relatie")
      .select("id, naam, contact_rol(rol_type(koppelbaar_aan))")
      .eq("landgoed_id", landgoed_id)
      .order("naam"),
    supabase
      .from("stamobject")
      .select("id, naam")
      .eq("landgoed_id", landgoed_id)
      .eq("geaccordeerd", true)
      .order("naam"),
  ]);
  const objecten = (objectenRaw.data ?? []) as { id: string; naam: string }[];
  const ledenOpties = (ledenRaw.data ?? []).map((l) => {
    const p = (l.profiel as unknown) as { id: string; naam: string | null; email: string | null } | null;
    return { waarde: `u:${p?.id ?? l.gebruiker_id}`, naam: p?.naam ?? p?.email ?? l.gebruiker_id };
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

  if (!werkorder) {
    return <div className="p-7">Melding/klus niet gevonden.</div>;
  }

  const persoon = (werkorder.profiel as unknown) as { naam: string | null; email: string | null } | null;
  const uitvoerderNaam = persoon?.naam ?? persoon?.email ?? werkorder.toegewezen_aan_naam;
  const drempelbedrag = Number(landgoed?.werkorder_drempelbedrag ?? 0);
  const gekoppeldObject = (werkorder.stamobject as unknown) as { id: string; naam: string } | null;
  const punt =
    werkorder.lat != null && werkorder.lon != null
      ? { lat: werkorder.lat as number, lon: werkorder.lon as number }
      : null;
  const wachtOpAkkoord = werkorder.wacht_op_akkoord === true;

  // De bucket "documenten" is privé, dus een pad alleen is niet te tonen: er
  // moet een tijdelijke ondertekende URL bij (zelfde aanpak als het
  // objectdossier). Eén uur is ruim genoeg voor het bekijken van een pagina.
  async function fotoUrls(paden: string[] | null): Promise<string[]> {
    if (!paden || paden.length === 0) return [];
    const urls = await Promise.all(
      paden.map(async (pad) => {
        const { data } = await supabase.storage.from("documenten").createSignedUrl(pad, 3600);
        return data?.signedUrl ?? null;
      }),
    );
    return urls.filter((u): u is string => Boolean(u));
  }
  const fotosVoor = await fotoUrls(werkorder.fotos_voor as string[] | null);
  const fotosNa = await fotoUrls(werkorder.fotos_na as string[] | null);

  // AI-routeringsvoorstel: stond eerst in de lijst, maar die is nu een
  // overzicht zonder knoppen. Het voorstel hoort dus hier, waar je de melding
  // toch al opent om hem op te pakken.
  const voorstel = werkorder.ai_voorstel as
    | { uitvoerder_waarde: string | null; urgentie: string; toelichting: string }
    | null;
  const toonVoorstel = werkorder.ai_voorstel_status === "voorgesteld" && voorstel;
  const voorgesteldeNaam = voorstel?.uitvoerder_waarde
    ? ([...ledenOpties, ...uitvoerderOpties].find((o) => o.waarde === voorstel.uitvoerder_waarde)?.naam ?? null)
    : null;

  return (
    <div className="flex flex-col">
      <div className="bg-white px-7 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          <a href={`/landgoed/${landgoed_id}/werkorders`} className="hover:underline">Meldingen &amp; klussen</a>
          {" / "}
          {werkorder.titel}
        </div>
      </div>

      <div className="p-7">
        <div className="card mb-5 p-5">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`tag ${STATUS_TAG[werkorder.status] ?? "tag-gray"}`}>
              {STATUS_LABEL[werkorder.status] ?? werkorder.status}
            </span>
            {werkorder.prioriteit && (
              <span className={`tag ${werkorder.prioriteit === "hoog" ? "tag-red" : "tag-gray"}`}>
                {werkorder.prioriteit}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-[20px] font-bold">{werkorder.titel}</h1>
          {werkorder.omschrijving && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>{werkorder.omschrijving}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            {werkorder.deadline && <span>Deadline: <strong>{werkorder.deadline}</strong></span>}
            {uitvoerderNaam && <span>Uitvoerder: <strong>{uitvoerderNaam}</strong></span>}
            {werkorder.kosten_verwacht != null && <span>Verwachte kosten: <strong>€ {werkorder.kosten_verwacht}</strong></span>}
            {werkorder.kosten_werkelijk != null && <span>Werkelijke kosten: <strong>€ {werkorder.kosten_werkelijk}</strong></span>}
            {werkorder.locatie_omschrijving && (
              <span>Locatie: <strong>{werkorder.locatie_omschrijving}</strong></span>
            )}
            {punt && (
              <a
                href={`https://www.google.com/maps?q=${punt.lat},${punt.lon}`}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                📍 Toon op kaart
              </a>
            )}

          </div>

          {fotosVoor.length > 0 && (
            <div className="mt-4">
              <span className="label-up">Foto&apos;s bij de melding</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {fotosVoor.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" title="Openen op ware grootte">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Foto ${i + 1} bij de melding`}
                      className="h-28 w-28 rounded-[8px] object-cover"
                      style={{ border: "1px solid var(--border)" }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
          {fotosNa.length > 0 && (
            <div className="mt-4">
              <span className="label-up">Foto&apos;s na afronding</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {fotosNa.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" title="Openen op ware grootte">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Foto ${i + 1} na afronding`}
                      className="h-28 w-28 rounded-[8px] object-cover"
                      style={{ border: "1px solid var(--border)" }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Eén knop per moment: accepteren, en daarna afronden. */}
          {werkorder.status === "gemeld" && (
            <form action={werkorderStatusWijzigen} className="mt-4">
              <input type="hidden" name="landgoed_id" value={landgoed_id} />
              <input type="hidden" name="id" value={werkorderId} />
              <input type="hidden" name="status" value="geaccepteerd" />
              <button type="submit" className="btn btn-primary btn-sm">Accepteren</button>
            </form>
          )}

          {werkorder.status === "geaccepteerd" && (
            <form action={werkorderAfronden} className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="landgoed_id" value={landgoed_id} />
              <input type="hidden" name="id" value={werkorderId} />
              <div>
                <label className="label-up mb-1 block">Werkelijke kosten (optioneel)</label>
                <input className="input" type="number" step="0.01" name="kosten_werkelijk" />
              </div>
              <div>
                <label className="label-up mb-1 block">Foto&apos;s achteraf (optioneel)</label>
                <input className="input" type="file" name="fotos_na" accept="image/*" multiple />
              </div>
              <button type="submit" className="btn btn-primary btn-sm">Afronden</button>
            </form>
          )}

          {werkorder.status === "afgerond" && (
            <form action={werkorderAfronden} className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="landgoed_id" value={landgoed_id} />
              <input type="hidden" name="id" value={werkorderId} />
              <input type="hidden" name="heropenen" value="ja" />
              <button type="submit" className="btn btn-ghost btn-sm">Heropenen</button>
            </form>
          )}
        </div>

        {/* Object uit de stamgegevens — hier ontstaat de onderhoudshistorie */}
        <div className="card mb-5 p-5">
          <span className="label-up">Object</span>
          <form action={werkorderObjectKoppelen} className="mt-2 flex flex-wrap items-end gap-3">
            <input type="hidden" name="landgoed_id" value={landgoed_id} />
            <input type="hidden" name="id" value={werkorderId} />
            <select className="input" name="stamobject_id" defaultValue={werkorder.stamobject_id ?? ""}>
              <option value="">— geen —</option>
              {objecten.map((o) => (
                <option key={o.id} value={o.id}>{o.naam}</option>
              ))}
            </select>
            <button type="submit" className="btn btn-ghost btn-sm">Opslaan</button>
            {gekoppeldObject && (
              <a href={`/landgoed/${landgoed_id}/object/${gekoppeldObject.id}`} className="btn btn-ghost btn-sm">
                Naar objectdossier
              </a>
            )}
          </form>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-2)" }}>
            Koppelen zorgt dat deze klus meetelt in de onderhoudshistorie van het object.
          </p>
        </div>

        {/* Kosten + drempelbedrag-akkoord */}
        <div className="card mb-5 p-5">
          <span className="label-up">Verwachte kosten</span>
          <form action={werkorderKostenBijwerken} className="mt-2 flex flex-wrap items-end gap-3">
            <input type="hidden" name="landgoed_id" value={landgoed_id} />
            <input type="hidden" name="id" value={werkorderId} />
            <div>
              <input
                className="input"
                type="number"
                step="0.01"
                name="kosten_verwacht"
                defaultValue={werkorder.kosten_verwacht ?? ""}
                placeholder="0,00"
              />
            </div>
            <button type="submit" className="btn btn-ghost btn-sm">Opslaan</button>
            <span className="text-[12px]" style={{ color: "var(--text-2)" }}>
              Boven € {drempelbedrag} is akkoord van de eigenaar nodig.
            </span>
          </form>

          {wachtOpAkkoord && (
            <div className="mt-3 rounded-[8px] p-3" style={{ background: "var(--bg)" }}>
              <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                Deze klus wacht op akkoord: de verwachte kosten (€ {werkorder.kosten_verwacht})
                liggen boven het drempelbedrag van € {drempelbedrag}.
              </div>
              {isEigenaar ? (
                <form action={werkorderAkkoordGeven} className="mt-2">
                  <input type="hidden" name="landgoed_id" value={landgoed_id} />
                  <input type="hidden" name="id" value={werkorderId} />
                  <button type="submit" className="btn btn-primary btn-sm">Akkoord geven</button>
                </form>
              ) : (
                <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
                  Alleen de eigenaar kan dit accorderen.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Toewijzen — het "Aanpassen"-spoor vanuit de triage komt hier uit */}
        <div className="card mb-5 p-5">
          <span className="label-up">Uitvoerder</span>
          {toonVoorstel && (
            <div className="mt-2 rounded-[8px] p-3 text-[12.5px]" style={{ background: "var(--bg)" }}>
              <div style={{ color: "var(--text-2)" }}>
                → AI-voorstel ({voorstel!.urgentie}):{" "}
                {voorgesteldeNaam ? <strong>{voorgesteldeNaam}</strong> : <strong>geen uitvoerder voorgesteld</strong>}
                {" — "}
                {voorstel!.toelichting}
              </div>
              {voorgesteldeNaam && (
                <form action={accordeerWerkorderVoorstel} className="mt-2">
                  <input type="hidden" name="landgoed_id" value={landgoed_id} />
                  <input type="hidden" name="id" value={werkorderId} />
                  <button type="submit" className="btn btn-primary btn-sm">
                    Akkoord — {voorgesteldeNaam}
                  </button>
                </form>
              )}
            </div>
          )}
          <form action={werkorderToewijzen} className="mt-2 flex flex-wrap items-end gap-3">
            <input type="hidden" name="landgoed_id" value={landgoed_id} />
            <input type="hidden" name="id" value={werkorderId} />
            <div>
              <select className="input" name="toegewezen_aan" defaultValue="">
                <option value="">— niemand —</option>
                {ledenOpties.length > 0 && (
                  <optgroup label="Gebruikers">
                    {ledenOpties.map((l) => (
                      <option key={l.waarde} value={l.waarde}>{l.naam}</option>
                    ))}
                  </optgroup>
                )}
                {uitvoerderOpties.length > 0 && (
                  <optgroup label="Uitvoerders">
                    {uitvoerderOpties.map((u) => (
                      <option key={u.waarde} value={u.waarde}>{u.naam}</option>
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
            <button type="submit" className="btn btn-primary btn-sm">
              {uitvoerderNaam ? "Wijzigen" : "Toewijzen"}
            </button>
            {uitvoerderNaam && (
              <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                Nu: <strong>{uitvoerderNaam}</strong>
              </span>
            )}
          </form>
          {alleRelaties.length === 0 && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--text-2)" }}>
              Nog geen contacten op dit landgoed. Voeg er een toe bij Contacten.
            </p>
          )}
          {alleRelaties.length > 0 && uitvoerderOpties.length === 0 && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--text-2)" }}>
              Tip: geef een contact de rol &quot;Onderhoud&quot; of &quot;Beheerder / tuinman&quot;,
              dan staat het als vaste uitvoerder bovenaan.
            </p>
          )}
        </div>

        {/* Magic link voor de externe uitvoerder */}
        <div className="card mb-5 p-5">
          <span className="label-up">Link voor de uitvoerder</span>
          {klusLink ? (
            <>
              <div className="mt-1 break-all font-mono text-[12px]">/klus/{klusLink.token}</div>
              <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
                Hiermee kan een externe uitvoerder zonder account de status bijwerken en een nieuw
                punt melden. Geldig tot {new Date(klusLink.verloopt_op).toLocaleDateString("nl-NL")}.
              </p>
            </>
          ) : (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-2)" }}>
              Nog geen link aangemaakt.
            </p>
          )}
          <form action={maakKlusLink} className="mt-3">
            <input type="hidden" name="landgoed_id" value={landgoed_id} />
            <input type="hidden" name="id" value={werkorderId} />
            <button type="submit" className="btn btn-ghost btn-sm">
              {klusLink ? "Nieuwe link maken" : "Link maken"}
            </button>
          </form>
        </div>

        {/* Tijdlijn / notities */}
        <h2 className="mb-3 text-[15px] font-semibold">Tijdlijn</h2>

        <div className="mb-4 flex flex-col gap-3">
          {(notities ?? []).length === 0 && (
            <div className="text-[13px]" style={{ color: "var(--text-2)" }}>Nog geen notities.</div>
          )}
          {(notities ?? []).map((n: {
            id: string;
            tekst: string;
            aangemaakt_op: string;
            profiel: unknown;
          }) => {
            const auteur = (n.profiel as unknown) as { naam: string | null; email: string | null } | null;
            return (
              <div key={n.id} className="card p-4">
                <div className="mb-1 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                  <strong>{auteur?.naam ?? auteur?.email ?? "Onbekend"}</strong>
                  {" · "}
                  {new Date(n.aangemaakt_op).toLocaleString("nl-NL", {
                    day: "numeric", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
                <p className="text-[13px] whitespace-pre-wrap">{n.tekst}</p>
              </div>
            );
          })}
        </div>

        <form action={voegNotitieToe} className="card p-4">
          <input type="hidden" name="landgoed_id" value={landgoed_id} />
          <input type="hidden" name="object_type" value="werkorder" />
          <input type="hidden" name="object_id" value={werkorderId} />
          <label className="label-up mb-1 block">Nieuwe notitie</label>
          <textarea className="input mb-3 w-full" name="tekst" rows={3} placeholder="Voeg een notitie toe…" required />
          <button type="submit" className="btn btn-primary btn-sm">Toevoegen</button>
        </form>
      </div>
    </div>
  );
}
