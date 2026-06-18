"use client";

// Bestand-invoer met client-side maximumcontrole. Blokkeert verzenden met een
// nette melding i.p.v. een serverfout als het bestand te groot is.
export default function BestandVeld({
  name = "bestand",
  maxMb = 5,
  required = true,
}: {
  name?: string;
  maxMb?: number;
  required?: boolean;
}) {
  return (
    <div>
      <input
        className="input"
        type="file"
        name={name}
        required={required}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && f.size > maxMb * 1024 * 1024) {
            e.target.setCustomValidity(
              `Bestand is te groot. Maximaal ${maxMb} MB per bestand.`,
            );
            e.target.reportValidity();
          } else {
            e.target.setCustomValidity("");
          }
        }}
      />
      <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
        Maximaal {maxMb} MB per bestand.
      </div>
    </div>
  );
}
