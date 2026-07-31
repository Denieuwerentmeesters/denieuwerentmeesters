"use client";

// Eén verwijderknop voor het hele dashboard, met een bevestiging ervoor.
//
// Probleem dat dit oplost: verwijderen gebeurde overal met één klik, zonder vangnet.
// Een document, agendapunt of object was met een misklik weg — en er is geen
// prullenbak, dus dat is definitief.
//
// Twee vormen, omdat de knoppen in de app in twee smaken bestaan:
//   - binnen een <form action={serverAction}>: laat de submit doorgaan of blokkeer 'm;
//   - met een eigen handler (bv. ObjectBewerken): geef `onBevestig` mee.
//
// Bewust `window.confirm` en geen eigen dialoogcomponent: het is één regel, het werkt
// met toetsenbord en schermlezer, en het blokkeert de submit echt. Een eigen modal kan
// later; dan verandert alleen dit bestand en niet de twaalf plekken die 'm gebruiken.

export function VerwijderKnop({
  vraag,
  children = "Verwijderen",
  className = "btn btn-ghost btn-sm btn-danger",
  title,
  onBevestig,
}: {
  /** Wat er precies weggaat, bv. "dit document". Wordt de vraag in de melding. */
  vraag: string;
  children?: React.ReactNode;
  className?: string;
  title?: string;
  /** Alleen meegeven als de knop géén form-submit is. */
  onBevestig?: () => void | Promise<void>;
}) {
  const bevestigd = () => window.confirm(`Weet je zeker dat je ${vraag} wilt verwijderen?`);

  if (onBevestig) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        onClick={() => {
          if (bevestigd()) void onBevestig();
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="submit"
      className={className}
      title={title}
      onClick={(e) => {
        if (!bevestigd()) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
