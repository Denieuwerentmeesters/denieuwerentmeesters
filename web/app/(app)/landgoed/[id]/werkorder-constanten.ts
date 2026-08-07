// Gedeelde werkorder-constanten. Bewust een eigen bestand: actions.ts is een
// "use server"-module en die mag uitsluitend async functies exporteren — een
// losse const daar breekt de build (tsc ziet dat niet, next build wel).

// Vaste reden bij een klus die boven het drempelbedrag uitkomt. Als herkenbare
// string zodat de akkoord-knop alleen dáár verschijnt, en niet bij een gewone
// "wacht op materiaal".
export const WACHT_OP_AKKOORD = "akkoord vereist";
