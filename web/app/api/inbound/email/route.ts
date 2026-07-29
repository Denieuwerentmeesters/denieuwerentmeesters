import { NextRequest, NextResponse } from "next/server";
import { verwerkInboundEmail, InboundPayload } from "@/lib/inbound_email";
import { serviceBeschikbaar } from "@/lib/supabase/service";
import { geautoriseerdMetSecret } from "@/lib/route-auth";

// Auth: gedeeld geheim in header (zet INBOUND_SHARED_SECRET in Vercel env).
// Fail-closed: ontbreekt het geheim in productie, dan weigeren.
function geautoriseerd(req: NextRequest): boolean {
  const verwacht = process.env.INBOUND_SHARED_SECRET;
  return geautoriseerdMetSecret({
    secretGezet: Boolean(verwacht),
    headerKlopt: req.headers.get("x-inbound-secret") === verwacht,
    isProductie: process.env.NODE_ENV === "production",
  });
}

export async function POST(req: NextRequest) {
  if (!geautoriseerd(req)) {
    return NextResponse.json({ error: "Ongeautoriseerd" }, { status: 401 });
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
