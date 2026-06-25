import { NextRequest, NextResponse } from "next/server";
import { intakeMail } from "@/lib/extractie_mail";

// POST /api/extractie/mail
// Body: { landgoed_id, mail_tekst, bron_ref?, vrije_instructie? }
// Beveiligd met EXTRACTIE_SECRET (zelfde patroon als subsidie-import).
export async function POST(req: NextRequest) {
  const secret = process.env.EXTRACTIE_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: {
    landgoed_id?: string;
    mail_tekst?: string;
    bron_ref?: string;
    vrije_instructie?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldig JSON-body" }, { status: 400 });
  }

  const { landgoed_id, mail_tekst, bron_ref, vrije_instructie } = body;
  if (!landgoed_id || !mail_tekst) {
    return NextResponse.json(
      { error: "landgoed_id en mail_tekst zijn verplicht" },
      { status: 400 },
    );
  }

  const run = await intakeMail({
    landgoed_id,
    mailTekst: mail_tekst,
    bron_ref,
    vrije_instructie,
  });

  return NextResponse.json({ ok: true, run_id: run?.id ?? null });
}
