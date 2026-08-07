import { createClient } from "@/lib/supabase/server";
import { KlusPaneel } from "./KlusPaneel";

// Publieke klus-pagina voor een externe uitvoerder — geen account nodig.
// Staat buiten de (app)-routegroep en in PUBLIEKE_PADEN (middleware), zodat er
// niet naar /login geredirect wordt. klus_ophalen (migratie 0066) valideert het
// token en geeft alleen de velden terug die de uitvoerder nodig heeft.
export default async function KlusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("klus_ophalen", { p_token: token });
  const klus = (data ?? [])[0] as
    | {
        titel: string;
        omschrijving: string | null;
        status: string;
        deadline: string | null;
        prioriteit: string | null;
        fotos_voor: string[] | null;
        locatie_omschrijving: string | null;
        lat: number | null;
        lon: number | null;
      }
    | undefined;

  if (!klus) {
    return (
      <div className="mx-auto max-w-[640px] p-7">
        <h1 className="text-[20px] font-bold">Deze link werkt niet meer</h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
          De link is verlopen of onjuist. Vraag de beheerder om een nieuwe.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] p-7">
      <header className="mb-5">
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>Opdracht</div>
        <h1 className="mt-1 text-[22px] font-bold">{klus.titel}</h1>
        {klus.omschrijving && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>{klus.omschrijving}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-[12.5px]" style={{ color: "var(--text-2)" }}>
          {klus.deadline && <span>Graag vóór: <strong>{klus.deadline}</strong></span>}
          {klus.prioriteit && <span>Prioriteit: <strong>{klus.prioriteit}</strong></span>}
          {klus.locatie_omschrijving && (
            <span>Locatie: <strong>{klus.locatie_omschrijving}</strong></span>
          )}
          {klus.lat != null && klus.lon != null && (
            <a
              href={`https://www.google.com/maps?q=${klus.lat},${klus.lon}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              📍 Route hierheen
            </a>
          )}
          {klus.fotos_voor && klus.fotos_voor.length > 0 && (
            <span>{klus.fotos_voor.length} foto{klus.fotos_voor.length !== 1 ? "'s" : ""} bij de melding</span>
          )}
        </div>
      </header>

      <KlusPaneel token={token} status={klus.status} />
    </div>
  );
}
