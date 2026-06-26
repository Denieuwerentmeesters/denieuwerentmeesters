"use client";

import { useState } from "react";
import { bevestigInboundVoorstel, verWerpInboundVoorstel } from "../actions";

type Lid = { id: string; naam: string | null; email: string | null };

type InboundMailRef = {
  id: string;
  van_adres: string;
  van_naam: string | null;
  onderwerp: string;
  ontvangen_op: string;
  body_text: string;
};

type InboundVoorstelRij = {
  id: string;
  type: string;
  titel: string;
  samenvatting: string;
  voorgestelde_velden: Record<string, unknown>;
  bron_citaat: string;
  zekerheid: string;
  inbound_email: InboundMailRef | null;
};

type MailGroep = {
  mail: InboundMailRef;
  voorstellen: InboundVoorstelRij[];
};

const TYPE_LABELS: Record<string, string> = {
  taak: "Taak",
  agendapunt: "Agendapunt",
  documentintake: "Document",
  informatie: "Informatie",
  contact: "Contact",
};

const TYPE_COLORS: Record<string, string> = {
  taak: "tag-red",
  agendapunt: "tag-blue",
  documentintake: "tag-purple",
  informatie: "tag-gray",
  contact: "tag-green",
};

function VeldInput({
  label, name, defaultValue, type = "text", required,
}: {
  label: string; name: string; defaultValue?: string | null; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="label-up mb-1 block">{label}</label>
      <input className="input w-full" name={name} type={type} defaultValue={defaultValue ?? ""} required={required} />
    </div>
  );
}

function PersoonDropdown({ name, leden, defaultValue }: { name: string; leden: Lid[]; defaultValue?: string | null }) {
  return (
    <div>
      <label className="label-up mb-1 block">Toegewezen aan</label>
      <select className="input w-full" name={name} defaultValue={defaultValue ?? ""}>
        <option value="">— niemand —</option>
        {leden.map((l) => (
          <option key={l.id} value={l.id}>{l.naam ?? l.email ?? l.id}</option>
        ))}
      </select>
    </div>
  );
}

function VoorstelFormulier({
  voorstel, landgoed_id, leden, onAnnuleer,
}: {
  voorstel: InboundVoorstelRij; landgoed_id: string; leden: Lid[]; onAnnuleer: () => void;
}) {
  const v = voorstel.voorgestelde_velden;
  const [type, setType] = useState(voorstel.type);

  return (
    <form action={bevestigInboundVoorstel} className="mt-3 rounded-[8px] p-3" style={{ background: "var(--bg)" }}>
      <input type="hidden" name="landgoed_id" value={landgoed_id} />
      <input type="hidden" name="voorstel_id" value={voorstel.id} />

      <div className="mb-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {/* Type-selector */}
        <div>
          <label className="label-up mb-1 block">Type</label>
          <select className="input w-full" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="taak">Taak</option>
            <option value="agendapunt">Agendapunt</option>
            <option value="contact">Contact</option>
            <option value="documentintake">Document</option>
            <option value="informatie">Informatie</option>
          </select>
        </div>

        <VeldInput label="Titel" name="titel" defaultValue={voorstel.titel} required />

        {type === "taak" && (
          <>
            <VeldInput label="Omschrijving" name="omschrijving" defaultValue={v.omschrijving as string} />
            <VeldInput label="Deadline" name="deadline" defaultValue={v.deadline as string} type="date" />
            <div>
              <label className="label-up mb-1 block">Prioriteit</label>
              <select className="input w-full" name="prioriteit" defaultValue={(v.prioriteit as string) ?? ""}>
                <option value="">—</option>
                <option value="hoog">Hoog</option>
                <option value="midden">Midden</option>
                <option value="laag">Laag</option>
              </select>
            </div>
            <PersoonDropdown name="toegewezen_aan" leden={leden} defaultValue={v.toegewezen_aan as string} />
          </>
        )}

        {type === "agendapunt" && (
          <>
            <VeldInput label="Datum" name="datum" defaultValue={v.datum as string} type="date" required />
            <VeldInput label="Tijd" name="tijd" defaultValue={v.tijd as string} type="time" />
            <VeldInput label="Locatie" name="locatie" defaultValue={(v.plaats ?? v.locatie) as string} />
            <PersoonDropdown name="toegewezen_aan" leden={leden} defaultValue={v.toegewezen_aan as string} />
          </>
        )}

        {type === "contact" && (
          <>
            <VeldInput label="Naam" name="contact_naam" defaultValue={(v.naam as string) ?? voorstel.titel} required />
            <VeldInput label="Organisatie" name="contact_organisatie" defaultValue={v.organisatie as string} />
            <VeldInput label="E-mail" name="contact_email" defaultValue={v.email as string} type="email" />
            <VeldInput label="Telefoon" name="contact_telefoon" defaultValue={v.telefoon as string} />
            <VeldInput label="Omschrijving / verantwoordelijkheden" name="contact_omschrijving" defaultValue={v.omschrijving as string} />
          </>
        )}

        {type === "documentintake" && (
          <>
            <VeldInput label="Kernvraag" name="kernvraag" defaultValue={v.kernvraag as string} />
            <VeldInput label="Samenvatting" name="samenvatting" defaultValue={voorstel.samenvatting} />
          </>
        )}

        {type === "informatie" && (
          <VeldInput label="Samenvatting" name="samenvatting" defaultValue={voorstel.samenvatting} />
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm">Bevestigen</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onAnnuleer}>Annuleren</button>
      </div>
    </form>
  );
}

function VoorstelKaart({
  voorstel, landgoed_id, leden,
}: {
  voorstel: InboundVoorstelRij; landgoed_id: string; leden: Lid[];
}) {
  const [bewerken, setBewerken] = useState(false);
  const laagZekerheid = voorstel.zekerheid === "laag";

  return (
    <div
      className="rounded-[8px] p-3"
      style={{
        border: "1px solid var(--border)",
        borderLeft: laagZekerheid ? "3px solid #f59e0b" : "1px solid var(--border)",
      }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`tag ${TYPE_COLORS[voorstel.type] ?? "tag-gray"}`}>
          {TYPE_LABELS[voorstel.type] ?? voorstel.type}
        </span>
        {laagZekerheid && <span className="tag tag-yellow text-[11px]">Controleer</span>}
        <span className="text-[13px] font-semibold">{voorstel.titel}</span>
      </div>

      {voorstel.samenvatting && (
        <p className="mb-2 text-[12.5px]" style={{ color: "var(--text-2)" }}>{voorstel.samenvatting}</p>
      )}

      {voorstel.bron_citaat && (
        <blockquote
          className="mb-2 rounded-[4px] p-2 text-[12px] italic"
          style={{ background: "var(--bg-2, #f9f9f9)", borderLeft: "2px solid var(--border)", color: "var(--text-2)" }}
        >
          &ldquo;{voorstel.bron_citaat}&rdquo;
        </blockquote>
      )}

      {bewerken ? (
        <VoorstelFormulier voorstel={voorstel} landgoed_id={landgoed_id} leden={leden} onAnnuleer={() => setBewerken(false)} />
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setBewerken(true)}>
            Bewerken & bevestigen
          </button>
          <form action={bevestigInboundVoorstel} style={{ display: "contents" }}>
            <input type="hidden" name="landgoed_id" value={landgoed_id} />
            <input type="hidden" name="voorstel_id" value={voorstel.id} />
            <input type="hidden" name="type" value={voorstel.type} />
            <input type="hidden" name="titel" value={voorstel.titel} />
            {voorstel.type === "agendapunt" && (
              <input type="hidden" name="datum" value={(voorstel.voorgestelde_velden.datum as string) ?? ""} />
            )}
            <button type="submit" className="btn btn-ghost btn-sm">Direct bevestigen</button>
          </form>
          <form action={verWerpInboundVoorstel} style={{ display: "contents" }}>
            <input type="hidden" name="landgoed_id" value={landgoed_id} />
            <input type="hidden" name="voorstel_id" value={voorstel.id} />
            <button type="submit" className="btn btn-ghost btn-sm">Verwerpen</button>
          </form>
        </div>
      )}
    </div>
  );
}

function MailBlok({
  groep, landgoed_id, leden,
}: {
  groep: MailGroep; landgoed_id: string; leden: Lid[];
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const { mail, voorstellen } = groep;

  return (
    <div className="card overflow-hidden">
      {/* Mail-header */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold">{mail.onderwerp}</div>
            <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-2)" }}>
              {mail.van_naam ? `${mail.van_naam} <${mail.van_adres}>` : mail.van_adres}
              {" · "}
              {new Date(mail.ontvangen_op).toLocaleDateString("nl-NL", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0 text-[11px]"
            onClick={() => setEmailOpen((o) => !o)}
          >
            {emailOpen ? "▲ Verberg" : "▼ Volledige mail"}
          </button>
        </div>

        {emailOpen && (
          <pre
            className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-[6px] p-3 text-[12px]"
            style={{ background: "var(--bg)", color: "var(--text-2)" }}
          >
            {mail.body_text}
          </pre>
        )}
      </div>

      {/* Voorstellen */}
      <div className="flex flex-col gap-3 p-4">
        {voorstellen.map((v) => (
          <VoorstelKaart key={v.id} voorstel={v} landgoed_id={landgoed_id} leden={leden} />
        ))}
      </div>
    </div>
  );
}

export default function InboxKaarten({
  voorstellen, landgoed_id, leden,
}: {
  voorstellen: InboundVoorstelRij[]; landgoed_id: string; leden: Lid[];
}) {
  // Groepeer per e-mail
  const groepen = new Map<string, MailGroep>();
  for (const v of voorstellen) {
    if (!v.inbound_email) continue;
    const key = v.inbound_email.id;
    if (!groepen.has(key)) {
      groepen.set(key, { mail: v.inbound_email, voorstellen: [] });
    }
    groepen.get(key)!.voorstellen.push(v);
  }

  const lijst = Array.from(groepen.values());

  if (lijst.length === 0) {
    return (
      <div className="card p-6 text-[13px]" style={{ color: "var(--text-2)" }}>
        Geen openstaande voorstellen. Stuur een e-mail door naar het landgoed-adres om te beginnen.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {lijst.map((groep) => (
        <MailBlok key={groep.mail.id} groep={groep} landgoed_id={landgoed_id} leden={leden} />
      ))}
    </div>
  );
}
