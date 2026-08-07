import { createClient } from "@/lib/supabase/server";
import { MeldFormulier } from "./MeldFormulier";

// Publieke meldpagina — geen account nodig. Staat bewust buiten de (app)-
// routegroep en in PUBLIEKE_PADEN (lib/supabase/middleware.ts), zodat de
// middleware niet naar /login redirect.
export default async function MeldPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: landgoedNaam } = await supabase.rpc("landgoed_naam_voor_meldtoken", {
    p_token: token,
  });

  if (!landgoedNaam) {
    return (
      <div className="mx-auto max-w-[640px] p-7">
        <h1 className="text-[20px] font-bold">Deze meldlink werkt niet</h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
          Controleer of u de volledige link heeft gebruikt, of vraag de beheerder om een nieuwe.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] p-7">
      <header className="mb-5">
        <h1 className="text-[22px] font-bold">Iets melden</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          Voor {landgoedNaam}. Eén zin is genoeg — de beheerder pakt het van daaruit op.
        </p>
      </header>
      <MeldFormulier token={token} landgoedNaam={landgoedNaam} />
    </div>
  );
}
