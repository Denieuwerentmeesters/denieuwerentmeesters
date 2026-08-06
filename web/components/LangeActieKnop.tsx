"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useState } from "react";

// Knop voor acties die minuten kunnen duren — zoals een ophaalronde van de
// omgevingsradar over twaalf maanden, die over honderden publicaties
// geocodeert. Een spinnertje in de knop is dan niet genoeg: het scherm ziet
// er verder onveranderd uit, dus het lijkt alsof er niets gebeurt en de
// gebruiker klikt weg of nog een keer.
//
// Daarom een schermvullende laag met het kasteeltje, die pas verdwijnt als
// de server-action klaar is en de pagina zich heeft ververst.

// Standaardstappen (omgevingsradar-ophaalronde). Andere aanroepers geven hun
// eigen `stappen` mee via de prop hieronder — de eerste regel komt sowieso
// van `bezigTekst`, dus die staat niet nog een keer in deze lijst.
const STAPPEN = [
  "We halen alle relevante informatie op",
  "Publicaties doorzoeken bij gemeente, provincie en waterschap",
  "Locaties opzoeken en op de kaart leggen",
  "Afstand bepalen tot uw percelen",
  "Bijna klaar — de laatste berichten worden beoordeeld",
];

function Overlay({ eersteRegel, stappen }: { eersteRegel: string; stappen: string[] }) {
  const [stap, setStap] = useState(0);

  // De teksten wisselen zodat zichtbaar blijft dat er nog iets gebeurt. Ze
  // beschrijven de werkelijke stappen van de keten, in volgorde; de laatste
  // blijft staan zolang het duurt.
  useEffect(() => {
    const t = setInterval(() => {
      setStap((s) => Math.min(s + 1, stappen.length - 1));
    }, 12000);
    return () => clearInterval(t);
  }, [stappen.length]);

  const regels = [eersteRegel, ...stappen.slice(1)];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(2px)" }}
    >
      <div className="text-[44px] leading-none animate-spin" style={{ animationDuration: "2.4s" }}>
        🏰
      </div>
      <p className="mt-5 text-[15px] font-semibold" style={{ color: "var(--primary)" }}>
        {regels[stap]}
      </p>
      <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-3)" }}>
        Dit kan een paar minuten duren. U kunt dit venster open laten staan.
      </p>
    </div>
  );
}

export default function LangeActieKnop({
  children,
  className = "btn btn-primary btn-sm",
  bezigTekst = STAPPEN[0],
  stappen = STAPPEN,
}: {
  children: React.ReactNode;
  className?: string;
  bezigTekst?: string;
  // Eigen stappenlijst voor deze actie; standaard de omgevingsradar-tekst.
  stappen?: string[];
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" className={className} disabled={pending}>
        {children}
      </button>
      {pending && <Overlay eersteRegel={bezigTekst} stappen={stappen} />}
    </>
  );
}
