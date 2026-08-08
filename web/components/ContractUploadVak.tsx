"use client";

import { useRef, useState } from "react";
import SubmitKnop from "@/components/SubmitKnop";
import { bepaalBestandsSoort } from "@/lib/contracten/bestanden";

// Uploadvak voor de AI-invoer van contracten (wens Steven): een duidelijke
// dropzone waar je bestanden in kunt slepen óf kiezen, met de leesknop pas
// zichtbaar zodra er echt iets klaarstaat. Naast pdf kan ook Word (docx)
// en een scan of foto (jpg, png, webp, heic). Meerdere bestanden mag — de
// AI leest ze op de server één voor één.
const MAX_MB = 10;
const MAX_AANTAL = 5;

export default function ContractUploadVak({
  landgoedId,
  action,
  compact = false,
}: {
  landgoedId: string;
  action: (fd: FormData) => Promise<void>;
  // compact: smalle strook i.p.v. groot vak — voor het register, waar de
  // contractenlijst de hoofdrol heeft (wens Steven). Slepen en kiezen
  // blijven allebei gewoon werken.
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [bestanden, setBestanden] = useState<File[]>([]);
  const [sleep, setSleep] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [eenContract, setEenContract] = useState(false);

  // Eén bron van waarheid: de echte file-input. Zo verstuurt het formulier
  // gewoon de bestanden, ook de gesleepte.
  function zetBestanden(lijst: File[]) {
    const dt = new DataTransfer();
    for (const f of lijst) dt.items.add(f);
    if (inputRef.current) inputRef.current.files = dt.files;
    setBestanden(lijst);
  }

  function voegToe(nieuw: FileList | File[] | null) {
    if (!nieuw) return;
    const kandidaten = Array.from(nieuw);
    const leesbaar = (f: File) => bepaalBestandsSoort(f.type, f.name) !== null;
    const verkeerdType = kandidaten.filter((f) => !leesbaar(f));
    const teGroot = kandidaten.filter(
      (f) => leesbaar(f) && f.size > MAX_MB * 1024 * 1024,
    );
    const goed = kandidaten.filter(
      (f) => leesbaar(f) && f.size <= MAX_MB * 1024 * 1024,
    );
    const samen = [...bestanden, ...goed];
    const problemen: string[] = [];
    if (verkeerdType.length)
      problemen.push(
        `${verkeerdType.map((f) => f.name).join(", ")}: alleen pdf, Word (docx) of een scan/foto (jpg, png, webp, heic) kan gelezen worden`,
      );
    if (teGroot.length)
      problemen.push(`${teGroot.map((f) => f.name).join(", ")}: groter dan ${MAX_MB} MB`);
    if (samen.length > MAX_AANTAL)
      problemen.push(`maximaal ${MAX_AANTAL} bestanden per keer`);
    setMelding(problemen.length ? problemen.join(" · ") : null);
    zetBestanden(samen.slice(0, MAX_AANTAL));
  }

  return (
    <form action={action} className={compact ? "card mb-3 p-3" : "card mb-4 p-4"}>
      <input type="hidden" name="landgoed_id" value={landgoedId} />
      <input
        ref={inputRef}
        type="file"
        name="bestand"
        accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => {
          // De input vervángt zijn eigen selectie; wij stapelen bij.
          voegToe(e.target.files);
        }}
      />

      {!compact && <div className="label-up mb-2">Nieuw contract uit document (AI)</div>}

      {/* De dropzone: klikken of slepen. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setSleep(true);
        }}
        onDragLeave={() => setSleep(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSleep(false);
          voegToe(e.dataTransfer.files);
        }}
        className={
          compact
            ? "flex cursor-pointer flex-wrap items-center gap-3 rounded-md border-2 border-dashed px-4 py-2.5"
            : "flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed px-6 py-8 text-center"
        }
        style={{
          borderColor: sleep ? "var(--primary)" : "var(--border)",
          background: sleep ? "var(--primary-light)" : undefined,
        }}
      >
        {compact ? (
          <>
            <span className="text-[13px] font-semibold">
              Nieuw contract? Sleep het hierin
            </span>
            <span className="text-[12px]" style={{ color: "var(--text-2)" }}>
              of
            </span>
            <span className="btn btn-primary btn-sm">Kies bestanden</span>
            <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
              pdf, Word of scan/foto · de AI zet het klaar als concept-dossier
            </span>
          </>
        ) : (
          <>
            <div className="text-[14px] font-semibold">
              Sleep hier één of meer contracten in
            </div>
            <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
              of
            </div>
            <span className="btn btn-primary btn-sm">Kies bestanden</span>
            <div className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
              Pdf, Word (docx) of een scan/foto (jpg, png, heic) — maximaal{" "}
              {MAX_AANTAL} bestanden van {MAX_MB} MB per keer.
            </div>
          </>
        )}
      </div>

      {melding && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--red)" }}>
          {melding}
        </p>
      )}

      {/* Pas als er iets klaarstaat: de lijst + de leesknop. */}
      {bestanden.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {bestanden.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 text-[13px]"
            >
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
                {(f.size / 1024 / 1024).toLocaleString("nl-NL", {
                  maximumFractionDigits: 1,
                })}{" "}
                MB
              </span>
              <button
                type="button"
                className="text-[11.5px] hover:underline"
                style={{ color: "var(--red)" }}
                onClick={() => zetBestanden(bestanden.filter((_, j) => j !== i))}
              >
                weghalen
              </button>
            </div>
          ))}
          {/* Eén contract dat over meerdere bestanden verspreid is
              (hoofdovereenkomst + bijlagen): dan leest de AI ze in samenhang
              en komt er één dossier uit i.p.v. één per bestand. */}
          {bestanden.length > 1 && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                name="een_contract"
                value="ja"
                checked={eenContract}
                onChange={(e) => setEenContract(e.target.checked)}
              />
              Deze bestanden horen bij één contract (hoofdovereenkomst met
              bijlagen) — lees ze in samenhang
            </label>
          )}
          <div className="flex items-center gap-3">
            <SubmitKnop className="btn btn-primary" pendingTekst="Lezen… dit kan even duren">
              {bestanden.length === 1
                ? "Lees & stel voor"
                : eenContract
                  ? `Lees & stel voor (1 contract uit ${bestanden.length} bestanden)`
                  : `Lees & stel voor (${bestanden.length} documenten)`}
            </SubmitKnop>
            <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
              {bestanden.length > 1 && eenContract
                ? "De AI leest de bestanden als één geheel; er komt één concept-dossier klaar te staan — niets wordt vastgelegd zonder jouw akkoord."
                : "De AI leest ze één voor één; alles komt als concept-dossier klaar te staan — niets wordt vastgelegd zonder jouw akkoord."}
            </span>
          </div>
        </div>
      )}
    </form>
  );
}
