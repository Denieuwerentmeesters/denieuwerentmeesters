// Contactnamen vergelijkbaar maken, zodat "Mts. Dreessen" en
// "Maatschap Dreessen" als dezelfde partij herkend worden (aanleiding:
// dubbele AI-contacten uit twee documenten met elk hun eigen spelling).
// Puur en apart, zodat de tests hem direct kunnen raken.

// Gangbare afkortingen in namen van maatschappen, firma's en stichtingen.
const AFKORTINGEN: Record<string, string> = {
  mts: "maatschap",
  mtsch: "maatschap",
  mij: "maatschappij",
  fa: "firma",
  gebr: "gebroeders",
  gebrs: "gebroeders",
  st: "stichting",
  zn: "zonen",
  dhr: "",
  mevr: "",
  mw: "",
};

export function normaliseerContactNaam(naam: string): string {
  const tokens = naam
    .toLowerCase()
    // leestekens en verbindingstekens worden spaties ("Lynden-Ter Hooge" ~ "Lynden Ter Hooge")
    .replace(/[.,''`&/\-+()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const genormaliseerd: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    // losse letters samenvoegen: "b v" -> "bv", "v o f" -> "vof"
    if (tokens[i].length === 1) {
      let samen = tokens[i];
      while (i + 1 < tokens.length && tokens[i + 1].length === 1) {
        samen += tokens[++i];
      }
      genormaliseerd.push(samen);
      continue;
    }
    const vervanging = AFKORTINGEN[tokens[i]];
    if (vervanging === "") continue;
    genormaliseerd.push(vervanging ?? tokens[i]);
  }
  return genormaliseerd.join(" ");
}
