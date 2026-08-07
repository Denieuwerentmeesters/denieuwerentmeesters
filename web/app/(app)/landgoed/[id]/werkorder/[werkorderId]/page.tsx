import { createClient } from "@/lib/supabase/server";
import { voegNotitieToe } from "../../actions";
import { werkorderStatusWijzigen, werkorderAfronden, maakKlusLink } from "../../actions";

const STATUS_LABEL: Record<string, string> = {
  gemeld: "Gemeld",
  beoordelen: "Beoordelen",
  toegewezen: "Toegewezen",
  in_uitvoering: "In uitvoering",
  wacht_op: "Wacht op…",
  klaar: "Klaar",
  geannuleerd: "Geannuleerd",
};

const STATUS_TAG: Record<string, string> = {
  gemeld: "tag-blue",
  beoordelen: "tag-amber",
  toegewezen: "tag-blue",
  in_uitvoering: "tag-amber",
  wacht_op: "tag-red",
  klaar: "tag-green",
  geannuleerd: "tag-gray",
};

// Volgende-stap-knoppen per status — houdt het statusmodel bewaakt vanuit de UI
// (de server action bewaakt het nogmaals, dit is alleen het gemak).
const VOLGENDE_STAPPEN: Record<string, { status: string; label: string }[]> = {
  gemeld: [{ status: "beoordelen", label: "In beoordeling nemen" }],
  beoordelen: [{ status: "toegewezen", label: "Toewijzen" }],
  toegewezen: [{ status: "in_uitvoering", label: "Start uitvoering" }, { status: "wacht_op", label: "Wacht op…" }],
  in_uitvoering: [{ status: "wacht_op", label: "Wacht op…" }],
  wacht_op: [{ status: "toegewezen", label: "Verder (akkoord/materiaal binnen)" }],
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
    .select("id, titel, omschrijving, prioriteit, status, deadline, wacht_reden, toegewezen_aan, toegewezen_aan_naam, kosten_verwacht, kosten_werkelijk, fotos_voor, fotos_na, profiel!werkorder_toegewezen_aan_fkey(naam, email)")
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

  if (!werkorder) {
    return <div className="p-7">Melding/klus niet gevonden.</div>;
  }

  const persoon = (werkorder.profiel as unknown) as { naam: string | null; email: string | null } | null;
  const uitvoerderNaam = persoon?.naam ?? persoon?.email ?? werkorder.toegewezen_aan_naam;
  const stappen = VOLGENDE_STAPPEN[werkorder.status] ?? [];
  const kanAfronden = werkorder.status === "in_uitvoering" || werkorder.status === "toegewezen";

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
            {werkorder.status === "wacht_op" && werkorder.wacht_reden && (
              <span>Reden: <strong>{werkorder.wacht_reden}</strong></span>
            )}
          </div>

          {werkorder.fotos_voor?.length > 0 && (
            <div className="mt-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
              {werkorder.fotos_voor.length} foto{werkorder.fotos_voor.length !== 1 ? "'s" : ""} bij de melding.
            </div>
          )}
          {werkorder.fotos_na?.length > 0 && (
            <div className="mt-1 text-[12.5px]" style={{ color: "var(--text-2)" }}>
              {werkorder.fotos_na.length} foto{werkorder.fotos_na.length !== 1 ? "'s" : ""} bij de afronding.
            </div>
          )}

          {/* Statusknoppen */}
          {stappen.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {stappen.map((s) => (
                <form key={s.status} action={werkorderStatusWijzigen}>
                  <input type="hidden" name="landgoed_id" value={landgoed_id} />
                  <input type="hidden" name="id" value={werkorderId} />
                  <input type="hidden" name="status" value={s.status} />
                  {s.status === "wacht_op" ? (
                    <div className="flex items-center gap-2">
                      <input className="input" name="wacht_reden" placeholder="Reden (materiaal, offerte, …)" />
                      <button type="submit" className="btn btn-ghost btn-sm">{s.label}</button>
                    </div>
                  ) : (
                    <button type="submit" className="btn btn-primary btn-sm">{s.label}</button>
                  )}
                </form>
              ))}
              <form action={werkorderStatusWijzigen}>
                <input type="hidden" name="landgoed_id" value={landgoed_id} />
                <input type="hidden" name="id" value={werkorderId} />
                <input type="hidden" name="status" value="geannuleerd" />
                <button type="submit" className="btn btn-ghost btn-sm btn-danger">Annuleren</button>
              </form>
            </div>
          )}

          {/* Afronden (controlemoment) */}
          {kanAfronden && (
            <form action={werkorderAfronden} className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="landgoed_id" value={landgoed_id} />
              <input type="hidden" name="id" value={werkorderId} />
              <div>
                <label className="label-up mb-1 block">Werkelijke kosten</label>
                <input className="input" type="number" step="0.01" name="kosten_werkelijk" />
              </div>
              <div>
                <label className="label-up mb-1 block">Foto&apos;s na afronding</label>
                <input className="input" type="file" name="fotos_na" accept="image/*" multiple />
              </div>
              <button type="submit" name="goedgekeurd" value="ja" className="btn btn-primary btn-sm">
                Afronden
              </button>
            </form>
          )}
          {werkorder.status === "klaar" && (
            <form action={werkorderAfronden} className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="landgoed_id" value={landgoed_id} />
              <input type="hidden" name="id" value={werkorderId} />
              <input type="hidden" name="goedgekeurd" value="nee" />
              <button type="submit" className="btn btn-ghost btn-sm">Terugsturen (nog niet akkoord)</button>
            </form>
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
