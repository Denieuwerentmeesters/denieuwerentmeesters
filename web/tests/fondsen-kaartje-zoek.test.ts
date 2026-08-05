// Tests voor het KAARTJE (de goedkope rankingstap) en voor het FULL-TEXT ZOEKEN.
//
// Wat hier stuk mag gaan is wat je later niet meer als fout herkent:
//   * een kaartje zonder uitsluiting — dan eindigt een fonds dat restauratie
//     uitsluit bovenaan bij een restauratievraag, en het kaartje leest prima;
//   * een splitsing die het kaartje uit de eerste regels van het profiel haalt —
//     dan mist het per definitie de uitsluiting (die staat pas bij kopje drie);
//   * een zoekquery met een andere woordenboekconfiguratie dan de index — dan
//     vindt hij niets en merkt niemand dat, want leeg is een geldig antwoord.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KAARTJE_MARKERING,
  PROFIEL_MARKERING,
  MATCHPROFIEL_SYSTEEM,
  bouwMatchprofielPrompt,
  keurKaartje,
  splitsAntwoord,
  type MatchprofielBron,
} from "@/lib/fondsen/matchprofiel";
import {
  ZOEKKOLOM,
  ZOEK_CONFIG,
  bouwZoekterm,
  zoekMatchprofielen,
} from "@/lib/fondsen/matchprofiel-zoek";
import { bouwGebruikersBericht } from "@/lib/ai";

const KAARTJE =
  "Het fonds wil natuur en cultuurlandschap op Nederlandse landgoederen behouden. " +
  "Gefinancierd worden herstel van houtwallen, poelen en hakhout, en het opstellen " +
  "van beheerplannen, inclusief begeleiding door een ecoloog en de aanleg van " +
  "landschapselementen zoals knotwilgen, hagen en solitaire bomen. " +
  "Niet: restauratie van gebouwde monumenten en regulier " +
  "onderhoud zijn uitgesloten. Aanvragen kan door landgoedeigenaren zelf, mits ANBI " +
  "of natuurbeheerder, in heel Nederland, voor bedragen tussen 1.000 en 15.000 euro " +
  "per project.";

function antwoord(kaartje = KAARTJE, profiel = "Wat dit fonds wil bereiken:\nBehoud."): string {
  return `${KAARTJE_MARKERING}\n${kaartje}\n\n${PROFIEL_MARKERING}\n${profiel}`;
}

describe("splitsAntwoord", () => {
  it("haalt kaartje en profiel uit elkaar", () => {
    const r = splitsAntwoord(antwoord());
    expect(r.kaartje).toBe(KAARTJE);
    expect(r.profiel).toBe("Wat dit fonds wil bereiken:\nBehoud.");
  });

  it("geeft LIEVER GEEN kaartje dan de eerste regels van het profiel", () => {
    // Zonder markeringen zou een 'slimme' terugval de eerste 80 woorden pakken.
    // Die bevatten nooit de uitsluiting — die staat pas bij het derde kopje.
    const r = splitsAntwoord("Wat dit fonds wil bereiken:\nBehoud van landgoederen.");
    expect(r.kaartje).toBeNull();
    expect(r.profiel).toContain("Behoud van landgoederen.");
  });

  it("overleeft een ontbrekende kaartje-markering (prefill al geconsumeerd)", () => {
    const r = splitsAntwoord(`${KAARTJE}\n\n${PROFIEL_MARKERING}\nProfieltekst.`);
    expect(r.kaartje).toBe(KAARTJE);
    expect(r.profiel).toBe("Profieltekst.");
  });

  it("laat een leeg kaartje null zijn in plaats van een lege string", () => {
    expect(splitsAntwoord(`${KAARTJE_MARKERING}\n\n${PROFIEL_MARKERING}\nP.`).kaartje).toBeNull();
  });
});

describe("keurKaartje — de uitsluiting is de bestaansreden", () => {
  it("keurt een volledig kaartje goed", () => {
    expect(keurKaartje(KAARTJE)).toEqual([]);
  });

  it("wijst een kaartje ZONDER uitsluiting af", () => {
    const zonder = KAARTJE.replace(
      "Niet: restauratie van gebouwde monumenten en regulier onderhoud zijn uitgesloten.",
      "Het fonds werkt samen met terreinbeherende organisaties en provincies overal.",
    );
    expect(keurKaartje(zonder)).toContain(
      "kaartje noemt geen uitsluiting (zin met 'Niet:' ontbreekt)",
    );
  });

  it("wijst een ontbrekend kaartje af", () => {
    expect(keurKaartje(null)).toEqual(["geen kaartje in het antwoord"]);
  });

  it("wijst een kaartje af dat te kort of te lang is", () => {
    expect(keurKaartje("Niet: onderhoud.").join()).toContain("te kort");
    expect(keurKaartje(`${KAARTJE} ${"woord ".repeat(60)}`).join()).toContain("te lang");
  });

  it("accepteert de vaste formulering als er niets is uitgesloten", () => {
    const geen = KAARTJE.replace(
      "Niet: restauratie van gebouwde monumenten en regulier onderhoud zijn uitgesloten.",
      "Niet: geen uitsluitingen gepubliceerd.",
    );
    expect(keurKaartje(geen)).toEqual([]);
  });
});

describe("de prompt vraagt om het kaartje", () => {
  const bron: MatchprofielBron = {
    regeling_id: "11111111-1111-1111-1111-111111111111",
    naam: "Testfonds",
    organisatie: null,
    samenvatting: "Behoud van landgoederen.",
    benaderbaarheid: "open",
    benaderwijze_notitie: null,
    aanvrager_type: "landgoedeigenaar",
    geo_niveau: "landelijk",
    geo_waarden: ["Nederland"],
    bedrag_min: 1000,
    bedrag_max: 15000,
    bedrag_indicatie: null,
    cofinanciering_vereist: null,
    kostensoort: null,
    landgoed_route: "zelf",
    landgoed_route_reden: null,
    landgoed_partnertype: null,
    uitsluitingen: ["Wij financieren geen restauratie."],
    beleidsteksten: [],
  };

  it("noemt beide markeringen en de verplichte uitsluiting", () => {
    const opbouw = bouwMatchprofielPrompt(bron);
    expect(opbouw.prompt).toContain(KAARTJE_MARKERING);
    expect(opbouw.prompt).toContain(PROFIEL_MARKERING);
    expect(MATCHPROFIEL_SYSTEEM).toContain("MEEST ONDERSCHEIDENDE");
    expect(MATCHPROFIEL_SYSTEEM).toContain('begint met "Niet:"');
  });

  it("geeft het schoonmaakrapport mee zodat de winst per fonds te loggen is", () => {
    const opbouw = bouwMatchprofielPrompt({
      ...bron,
      beleidsteksten: [
        {
          bron_sleutel: "site",
          bron_url: null,
          tekst: "Home\nContact\nWij financieren geen restauratie.",
          tekst_hash: "a".repeat(64),
          opgehaald_op: null,
        },
      ],
    });
    expect(opbouw.schoonmaak.verwijderd).toBeGreaterThan(0);
    expect(opbouw.prompt).toContain("Wij financieren geen restauratie.");
    expect(opbouw.prompt).not.toContain("\nHome\n");
  });
});

describe("prompt caching — de haak voor fase 3", () => {
  it("zet het stabiele blok VOOR de vraag en markeert het", () => {
    const inhoud = bouwGebruikersBericht("Wat past bij mijn parkbos?", "KAARTJES\n...");
    expect(Array.isArray(inhoud)).toBe(true);
    const blokken = inhoud as { text: string; cache_control?: unknown }[];
    // Volgorde is het hele punt: alles tot en met de markering moet gelijk blijven.
    expect(blokken[0].text).toContain("KAARTJES");
    expect(blokken[0].cache_control).toEqual({ type: "ephemeral" });
    expect(blokken[1].text).toContain("parkbos");
    expect(blokken[1].cache_control).toBeUndefined();
  });

  it("laat een aanroep zonder stabiel blok ongemoeid (gewone string)", () => {
    expect(bouwGebruikersBericht("alleen een vraag")).toBe("alleen een vraag");
  });
});

describe("bouwZoekterm", () => {
  it("laat gewone mensentaal staan", () => {
    expect(bouwZoekterm("herstel van een molen")).toBe("herstel van een molen");
  });

  it("houdt een frase tussen aanhalingstekens heel", () => {
    expect(bouwZoekterm('"stinzenplanten" poel')).toBe('"stinzenplanten" poel');
  });

  it("gooit een openstaand aanhalingsteken weg (anders vindt hij niets)", () => {
    expect(bouwZoekterm('"molen poel')).toBe("molen poel");
  });

  it("haalt tekens weg die als operator gelezen worden", () => {
    expect(bouwZoekterm("molen & poel | (hakhout)")).toBe("molen poel hakhout");
  });

  it("houdt een streepje binnen een woord, maar niet als los teken", () => {
    expect(bouwZoekterm("hoog-holt - molen")).toBe("hoog-holt molen");
  });

  it("geeft null bij een lege of betekenisloze vraag", () => {
    expect(bouwZoekterm("")).toBeNull();
    expect(bouwZoekterm("   ")).toBeNull();
    expect(bouwZoekterm("()")).toBeNull();
  });

  it("begrenst de lengte zodat een geplakt beleidsplan geen query wordt", () => {
    expect(bouwZoekterm("a ".repeat(500))!.length).toBeLessThanOrEqual(200);
  });
});

describe("zoekMatchprofielen", () => {
  function nepDb(rijen: unknown[] = []) {
    const aanroepen: Record<string, unknown[]> = {};
    const q: Record<string, (...a: unknown[]) => unknown> = {};
    for (const naam of ["select", "textSearch", "in", "eq", "limit"]) {
      q[naam] = (...args: unknown[]) => {
        aanroepen[naam] = args;
        return q;
      };
    }
    // De laatste stap wordt awaited; een then maakt het thenable.
    (q as unknown as { then: unknown }).then = (
      res: (v: { data: unknown[]; error: null }) => unknown,
    ) => res({ data: rijen, error: null });
    const db = { from: (t: string) => ((aanroepen.from = [t]), q) };
    return { db: db as never, aanroepen };
  }

  it("zoekt met het Nederlandse woordenboek op de gegenereerde kolom", async () => {
    const { db, aanroepen } = nepDb();
    await zoekMatchprofielen(db, "molen");
    expect(aanroepen.from).toEqual(["regeling_matchprofiel"]);
    // Zelfde config als de index in 0053, anders vindt hij niets.
    expect(aanroepen.textSearch).toEqual([
      ZOEKKOLOM,
      "molen",
      { type: "websearch", config: ZOEK_CONFIG },
    ]);
  });

  it("beperkt tot de fondsen die door de poort kwamen", async () => {
    const { db, aanroepen } = nepDb();
    await zoekMatchprofielen(db, "poel", { regelingIds: ["a", "b"], limiet: 25 });
    expect(aanroepen.in).toEqual(["regeling_id", ["a", "b"]]);
    expect(aanroepen.limit).toEqual([25]);
  });

  it("geeft bij een lege vraag NIETS terug in plaats van de hele catalogus", async () => {
    const { db, aanroepen } = nepDb([{ regeling_id: "x" }]);
    expect(await zoekMatchprofielen(db, "   ")).toEqual([]);
    expect(aanroepen.from).toBeUndefined();
  });

  it("geeft de treffers terug", async () => {
    const rij = { regeling_id: "x", kaartje: KAARTJE, profiel: "..." };
    const { db } = nepDb([rij]);
    expect(await zoekMatchprofielen(db, "molen")).toEqual([rij]);
  });
});

describe("migratie 0053", () => {
  const sql = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "supabase",
      "migrations",
      "0053_fonds_matchprofiel.sql",
    ),
    "utf8",
  );

  it("heeft het kaartje als kolom", () => {
    expect(sql).toMatch(/kaartje text/);
    expect(sql).toMatch(/kaartje_woorden integer/);
  });

  it("heeft een gegenereerde tsvector met het Nederlandse woordenboek", () => {
    expect(sql).toMatch(/zoektekst tsvector generated always as/);
    expect(sql).toMatch(/to_tsvector\('dutch'/);
    // Kaartje zwaarder dan profiel: staat een woord in het kaartje, dan is het
    // kenmerkend voor het fonds.
    expect(sql).toMatch(/setweight\(to_tsvector\('dutch', coalesce\(kaartje, ''\)\), 'A'\)/);
    expect(sql).toMatch(/setweight\(to_tsvector\('dutch', coalesce\(profiel, ''\)\), 'B'\)/);
    expect(sql).toMatch(/stored/);
  });

  it("heeft een GIN-index op de zoekkolom (anders is het alleen opslag)", () => {
    expect(sql).toMatch(/using gin \(zoektekst\)/);
  });

  it("blijft idempotent (nieuwe kolommen ook op een bestaande tabel)", () => {
    expect(sql).toMatch(/add column if not exists kaartje text/);
    expect(sql).toMatch(/add column if not exists zoektekst tsvector/);
  });
});
