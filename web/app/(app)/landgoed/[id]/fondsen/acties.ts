"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { moet } from "@/lib/db";
import { laadProfiel } from "@/app/(app)/landgoed/[id]/subsidies/matching";
import { laadCatalogus } from "@/lib/fondsen/zoek";
import { zoekMetOpslag } from "@/lib/fondsen/opslag";
import {
  AANVRAGERS,
  BEDRAGBANDEN,
  leidDoelAf,
  PLANFASEN,
  PUBLIEK_OPTIES,
  type Antwoorden,
} from "@/lib/fondsen/vraag";

// Losse Ja/Nee-vraag op de fondsenradar, direct opgeslagen — geen onderdeel
// van de GET-zoekopdracht (die staat in de URL, dit is een landgoedeigenschap
// die de ANBI-poort voedt, zie lib/fondsen/poort.ts::toetsAnbi).
export async function zetAnbiStatus(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id") ?? "");
  const is_anbi = fd.get("is_anbi") === "ja";
  if (!landgoed_id) return;
  const supabase = await createClient();
  await moet(
    supabase.from("landgoed").update({ is_anbi }).eq("id", landgoed_id),
    "ANBI-status opslaan",
  );
  revalidatePath(`/landgoed/${landgoed_id}/fondsen`);
  revalidatePath(`/landgoed/${landgoed_id}/profiel`);
}

// De zoekopdracht als server action i.p.v. method="get": zo kan de knop een
// laadoverlay tonen (useFormStatus vereist een <form action={...}>) terwijl
// de trage stap — laag 3, twee AI-aanroepen — hier al draait. We schrijven het
// resultaat weg via zoekMetOpslag en sturen dan door naar dezelfde
// GET-route-met-parameters: die is nog altijd deelbaar/te verversen, en de
// bestemmingspagina treft de uitkomst als cache-hit (vraag_hash) aan, dus
// zonder nog een keer op het model te wachten.
export async function zoekFondsen(fd: FormData) {
  const landgoed_id = String(fd.get("landgoed_id") ?? "");
  if (!landgoed_id) return;

  const tekst = (naam: string) => String(fd.get(naam) ?? "").trim();
  const planTekst = tekst("plan");
  const antwoorden: Antwoorden = {
    plan: planTekst,
    motivatie: tekst("motivatie"),
    // Zelfde afleiding als de GET-render (page.tsx): geen los keuzeveld, om
    // dubbelop met de plantekst te voorkomen.
    doel: leidDoelAf(planTekst),
    fase: (PLANFASEN as readonly string[]).includes(tekst("fase"))
      ? (tekst("fase") as Antwoorden["fase"])
      : null,
    bedragband: (BEDRAGBANDEN as readonly string[]).includes(tekst("band"))
      ? (tekst("band") as Antwoorden["bedragband"])
      : null,
    aanvrager: (AANVRAGERS as readonly string[]).includes(tekst("aanvrager"))
      ? (tekst("aanvrager") as Antwoorden["aanvrager"])
      : null,
    publiek: (PUBLIEK_OPTIES as readonly string[]).includes(tekst("publiek"))
      ? (tekst("publiek") as Antwoorden["publiek"])
      : null,
  };

  const params = new URLSearchParams();
  if (antwoorden.plan) params.set("plan", antwoorden.plan);
  if (antwoorden.motivatie) params.set("motivatie", antwoorden.motivatie);
  if (antwoorden.fase) params.set("fase", antwoorden.fase);
  if (antwoorden.bedragband) params.set("band", antwoorden.bedragband);
  if (antwoorden.aanvrager) params.set("aanvrager", antwoorden.aanvrager);
  if (antwoorden.publiek) params.set("publiek", antwoorden.publiek);

  const erIsGevraagd =
    antwoorden.plan.length > 0 ||
    antwoorden.motivatie.length > 0 ||
    antwoorden.doel !== null ||
    antwoorden.fase !== null ||
    antwoorden.bedragband !== null;

  if (erIsGevraagd) {
    try {
      const supabase = await createClient();
      const [profiel, catalogus] = await Promise.all([
        laadProfiel(supabase, landgoed_id),
        laadCatalogus(supabase),
      ]);
      await zoekMetOpslag(supabase, landgoed_id, profiel, antwoorden, catalogus);
    } catch {
      // Faalt de zoekopdracht hier, dan voert de bestemmingspagina 'm gewoon
      // nog een keer uit en toont zijn eigen foutafhandeling (zoekfout) —
      // geen kapotte knop, alleen een gemiste versnelling.
    }
  }

  const qs = params.toString();
  redirect(`/landgoed/${landgoed_id}/fondsen${qs ? `?${qs}` : ""}`);
}
