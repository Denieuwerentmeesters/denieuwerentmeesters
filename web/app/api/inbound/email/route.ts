import { NextRequest, NextResponse } from "next/server";
import { verwerkInboundEmail, InboundPayload } from "@/lib/inbound_email";
import { serviceBeschikbaar } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  // Auth: gedeeld geheim in header (zet INBOUND_SHARED_SECRET in Vercel env)
  const secret = process.env.INBOUND_SHARED_SECRET;
  if (secret) {
    const header = req.headers.get("x-inbound-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Ongeautoriseerd" }, { status: 401 });
    }
  }

  if (!serviceBeschikbaar()) {
    return NextResponse.json(
      { error: "Service-role key ontbreekt" },
      { status: 503 },
    );
  }

  let payload: InboundPayload;
  try {
    payload = (await req.json()) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  if (!payload.to || !payload.messageId) {
    return NextResponse.json(
      { error: "Verplichte velden ontbreken: to, messageId" },
      { status: 400 },
    );
  }

  const resultaat = await verwerkInboundEmail(payload);
  return NextResponse.json(resultaat, { status: resultaat.ok ? 200 : 422 });
}
