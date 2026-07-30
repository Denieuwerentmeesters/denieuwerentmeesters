import Link from "next/link";
import StamgegevensBeheer from "./StamgegevensBeheer";

// Losse stamgegevenspagina. Het volledige beheer zit in StamgegevensBeheer,
// gedeeld met de profielpagina (die staat in het menu).
export default async function StamgegevensPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          Stamgegevens
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold">Stamgegevens</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              De basisobjecten van het landgoed. Laat de AI ze uit je documenten
              en administratie halen; jij controleert en vult aan.
            </p>
          </div>
          <Link href={`/landgoed/${id}/onboarding`} className="btn btn-ghost btn-sm">
            Onboarding-wizard
          </Link>
        </header>

        <StamgegevensBeheer landgoedId={id} />
      </div>
    </div>
  );
}
