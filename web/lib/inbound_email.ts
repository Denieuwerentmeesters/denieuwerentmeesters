import { createServiceClient } from "@/lib/supabase/service";
import { extraheerUitInboundEmail, InboundVoorstel } from "@/lib/ai";

export type { InboundVoorstel };

export type InboundEmailRow = {
  id: string;
  landgoed_id: string;
  van_adres: string;
  van_naam: string | null;
  onderwerp: string;
  body_text: string;
  body_html: string | null;
  ontvangen_op: string;
  message_id: string;
  doorgestuurd_door: string | null;
  ruwe_headers: Record<string, unknown>;
  verwerkt_status: "ontvangen" | "geanalyseerd" | "fout";
  aangemaakt_op: string;
};

export type InboundBijlageInput = {
  bestandsnaam: string;
  mime_type: string;
  grootte_bytes: number;
  data: string; // base64
};

export type InboundPayload = {
  to: string;
  from: { address: string; name?: string };
  subject: string;
  date: string;
  messageId: string;
  bodyText: string;
  bodyHtml?: string;
  headers: Record<string, unknown>;
  attachments?: InboundBijlageInput[];
  forwardedBy?: string;
};

export async function verwerkInboundEmail(
  payload: InboundPayload,
): Promise<{ ok: boolean; reden?: string }> {
  const sb = createServiceClient();

  // 1. Resolve local_part → landgoed_id
  const localPart = payload.to.split("@")[0].toLowerCase();
  const { data: inbox } = await sb
    .from("landgoed_inbox")
    .select("landgoed_id")
    .eq("local_part", localPart)
    .eq("actief", true)
    .maybeSingle();

  if (!inbox) {
    return { ok: false, reden: `Onbekend adres: ${localPart}` };
  }
  const landgoed_id = inbox.landgoed_id;

  // 2. Dedup op message_id
  const { data: bestaand } = await sb
    .from("inbound_email")
    .select("id")
    .eq("message_id", payload.messageId)
    .maybeSingle();

  if (bestaand) {
    return { ok: true, reden: "al verwerkt (dedup)" };
  }

  // 3. Sla ruwe mail op
  const { data: email, error: emailErr } = await sb
    .from("inbound_email")
    .insert({
      landgoed_id,
      van_adres: payload.from.address,
      van_naam: payload.from.name ?? null,
      onderwerp: payload.subject,
      body_text: payload.bodyText,
      body_html: payload.bodyHtml ?? null,
      ontvangen_op: payload.date,
      message_id: payload.messageId,
      doorgestuurd_door: payload.forwardedBy ?? null,
      ruwe_headers: payload.headers,
      verwerkt_status: "ontvangen",
    })
    .select("id")
    .single();

  if (emailErr || !email) {
    return { ok: false, reden: `mail opslaan mislukt: ${emailErr?.message}` };
  }
  const email_id = email.id;

  // 4. Bijlagen uploaden naar Storage + opslaan in inbound_bijlage
  for (const bijlage of payload.attachments ?? []) {
    const pad = `${landgoed_id}/${email_id}/${bijlage.bestandsnaam}`;
    const bytes = Buffer.from(bijlage.data, "base64");
    await sb.storage.from("inbound-bijlagen").upload(pad, bytes, {
      contentType: bijlage.mime_type,
      upsert: false,
    });
    await sb.from("inbound_bijlage").insert({
      inbound_email_id: email_id,
      bestandsnaam: bijlage.bestandsnaam,
      mime_type: bijlage.mime_type,
      grootte_bytes: bijlage.grootte_bytes,
      opslag_pad: pad,
    });
  }

  // 5. AI-extractie → voorstellen
  let verwerkt_status: "geanalyseerd" | "fout" = "geanalyseerd";
  try {
    const resultaat = await extraheerUitInboundEmail(payload.bodyText);
    const voorstellen = resultaat?.voorstellen ?? [];

    for (const v of voorstellen) {
      await sb.from("inbound_extractie").insert({
        inbound_email_id: email_id,
        landgoed_id,
        type: v.type,
        titel: v.titel,
        samenvatting: v.samenvatting,
        voorgestelde_velden: v.voorgestelde_velden,
        bron_citaat: v.bron_citaat,
        zekerheid: v.zekerheid,
        status: "concept",
      });
    }
  } catch {
    verwerkt_status = "fout";
  }

  // 6. Status updaten
  await sb
    .from("inbound_email")
    .update({ verwerkt_status })
    .eq("id", email_id);

  return { ok: true };
}
