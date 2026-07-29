import { NextRequest, NextResponse } from "next/server";
import { intakeMail } from "@/lib/extractie_mail";
import { geautoriseerdMetSecret } from "@/lib/route-auth";

// POST /api/extractie/mail
// Body: { landgoed_id, mail_tekst, bron_ref?, vrije_instructie? }
// Beveiligd met EXTRACTIE_SECRET (zelfde patroon als subsidie-import).
// Fail-closed: ontbreekt het geheim in productie, dan weigeren.
function geautoriseerd(req: NextRequest): boolean {
  const verwacht = process.env.EXTRACTIE_SECRET;
  return geautoriseerdMetSecret({
    secretGezet: Boolean(verwacht),
    headerKlopt: req.headers.get("authorization") === `Bearer ${verwacht}`,
    isProductie: process.env.NODE_ENV === "production",
  });
}

export async function POST(req: NextRequest) {
  if (!geautoriseerd(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
