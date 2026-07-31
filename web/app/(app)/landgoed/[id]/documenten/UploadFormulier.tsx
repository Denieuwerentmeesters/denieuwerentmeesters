import BestandVeld from "@/components/BestandVeld";
import SubmitKnop from "@/components/SubmitKnop";
import { ToevoegenToggle } from "@/components/ToevoegenToggle";
import { uploadDocument } from "./acties";
import { CATEGORIEEN, NOG_IN_TE_DELEN } from "./categorieen";

// Het uploadformulier staat achter een toggle (conventie: nooit een open formulier
// direct op de pagina). De keuzelijst toont ALTIJD alle categorieën — ook de
// categorieën die op het overzicht verborgen zijn, want anders kun je een verborgen
// categorie nooit als eerste vullen. Kiest iemand er een, dan verschijnt dat blok
// bij de volgende render vanzelf.
//
// De lijst komt uit categorieen.ts, net als het overzicht en de classificatieprompt:
// overzicht en keuzelijst mogen nooit uit elkaar lopen.

export function UploadFormulier({
  landgoedId,
  vasteCategorie,
}: {
  landgoedId: string;
  /** Voorgeselecteerd op een categoriepagina; leeg = de AI mag voorstellen. */
  vasteCategorie?: string;
}) {
  return (
    <ToevoegenToggle label="document toevoegen">
      <form action={uploadDocument} className="flex flex-col gap-3">
        <input type="hidden" name="landgoed_id" value={landgoedId} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label-up mb-1 block">Titel (optioneel)</label>
            <input
              className="input w-full"
              name="titel"
              placeholder="Bestandsnaam wordt gebruikt indien leeg"
            />
          </div>
          <div>
            <label className="label-up mb-1 block">Categorie</label>
            <select className="input w-full" name="categorie" defaultValue={vasteCategorie ?? ""}>
              <option value="">Laat de AI voorstellen</option>
              {CATEGORIEEN.filter((c) => c.sleutel !== NOG_IN_TE_DELEN).map((c) => (
                <option key={c.sleutel} value={c.sleutel}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-up mb-1 block">Soort</label>
            <select className="input w-full" name="soort" defaultValue="archiefstuk">
              <option value="archiefstuk">Archiefstuk</option>
              <option value="bijlage">Bijlage (foto, meterstand)</option>
            </select>
          </div>
          <div>
            <label className="label-up mb-1 block">Vertrouwelijkheid</label>
            <select className="input w-full" name="vertrouwelijkheid" defaultValue="normaal">
              <option value="normaal">Normaal</option>
              <option value="vertrouwelijk">Vertrouwelijk</option>
              <option value="gevoelig">Gevoelig</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label-up mb-1 block">Bestand</label>
          <BestandVeld maxMb={5} />
        </div>

        <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
          Laat je de categorie leeg, dan doet de AI een voorstel op basis van de inhoud
          (alleen PDF). Dat voorstel komt bovenaan het overzicht te staan tot je het
          bevestigt — het document is intussen gewoon te openen.
        </p>

        <div>
          <SubmitKnop className="btn btn-primary" pendingTekst="Uploaden…">
            Uploaden
          </SubmitKnop>
        </div>
      </form>
    </ToevoegenToggle>
  );
}
