// Uitgaande mail via Resend, zonder SDK-dependency: de REST API is één POST.
// Dit project heeft eerder een Vercel-build zien breken op een transitieve
// dependency (zie web/CLAUDE.md), dus voor iets van deze omvang geen pakket.
//
// Env-gated zoals lib/ai.ts: zonder RESEND_API_KEY wordt er niets verstuurd en
// gaat de app gewoon door. Een statuswijziging mag nooit stuklopen omdat de
// mailprovider niet bereikbaar is — de mail is een bijkomstigheid, het
// vastleggen in het dossier is de hoofdzaak.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function mailBeschikbaar(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_AFZENDER);
}

export type MailResultaat = { verstuurd: boolean; reden?: string };

export async function verstuurMail(opts: {
  aan: string;
  onderwerp: string;
  tekst: string;
}): Promise<MailResultaat> {
  if (!opts.aan || !opts.aan.includes("@")) {
    return { verstuurd: false, reden: "geen geldig e-mailadres" };
  }
  if (!mailBeschikbaar()) {
    console.info("[mail] overgeslagen (RESEND_API_KEY/MAIL_AFZENDER ontbreekt):", opts.onderwerp);
    return { verstuurd: false, reden: "mail niet geconfigureerd" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_AFZENDER,
        to: [opts.aan],
        subject: opts.onderwerp,
        text: opts.tekst,
      }),
      // Externe bron: altijd een timeout, anders hangt de server action.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[mail] Resend gaf een fout:", res.status, body.slice(0, 200));
      return { verstuurd: false, reden: `Resend ${res.status}` };
    }
    return { verstuurd: true };
  } catch (e) {
    console.error("[mail] versturen mislukt:", e instanceof Error ? e.message : String(e));
    return { verstuurd: false, reden: "netwerkfout" };
  }
}

// De drie momenten waarop de melder iets hoort (Werkorders_Plan_v1_0.md hfst 6).
// Rustig gedoseerd: ontvangst, inplanning, afronding. Geen stroom.
export function bevestigingAanMelder(titel: string, landgoedNaam: string) {
  return {
    onderwerp: `Uw melding is ontvangen: ${titel}`,
    tekst:
      `Beste,\n\nUw melding "${titel}" is ontvangen door ${landgoedNaam}. ` +
      `De beheerder bekijkt hem en pakt het op. U hoort het zodra er iets ` +
      `gepland staat.\n\nMet vriendelijke groet,\n${landgoedNaam}`,
  };
}

export function inplanningAanMelder(titel: string, landgoedNaam: string, deadline: string | null) {
  return {
    onderwerp: `Er is iemand op uw melding gezet: ${titel}`,
    tekst:
      `Beste,\n\nUw melding "${titel}" is toegewezen aan een uitvoerder.` +
      (deadline ? ` Het staat gepland vóór ${deadline}.` : "") +
      `\n\nMet vriendelijke groet,\n${landgoedNaam}`,
  };
}

export function afrondingAanMelder(titel: string, landgoedNaam: string) {
  return {
    onderwerp: `Afgerond: ${titel}`,
    tekst:
      `Beste,\n\nUw melding "${titel}" is afgerond. Ziet u toch nog iets, ` +
      `laat het dan weten via dezelfde meldlink.\n\nMet vriendelijke groet,\n${landgoedNaam}`,
  };
}
