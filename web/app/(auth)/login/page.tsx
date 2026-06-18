"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Modus = "inloggen" | "registreren";

export default function LoginPage() {
  const router = useRouter();
  const [modus, setModus] = useState<Modus>("inloggen");
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    setMelding(null);
    const supabase = createClient();

    if (modus === "inloggen") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: wachtwoord,
      });
      if (error) {
        setFout("Inloggen mislukt. Controleer e-mail en wachtwoord.");
        setBezig(false);
        return;
      }
      router.push("/landgoederen");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: wachtwoord,
        options: { data: { naam } },
      });
      if (error) {
        setFout(error.message);
        setBezig(false);
        return;
      }
      // Geen sessie => e-mailbevestiging staat aan.
      if (!data.session) {
        setMelding(
          "Account aangemaakt. Bevestig je e-mailadres via de link in je mailbox en log daarna in.",
        );
        setModus("inloggen");
        setBezig(false);
        return;
      }
      router.push("/landgoederen");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-[400px] p-8">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[9px]"
            style={{ background: "var(--primary)" }}
          >
            <span className="text-sm font-bold text-white">R</span>
          </div>
          <div>
            <div className="text-[15px] font-bold leading-tight">
              Landgoedplatform
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-2)" }}>
              De Nieuwe Rentmeesters
            </div>
          </div>
        </div>

        <h1 className="mb-1 text-lg font-bold">
          {modus === "inloggen" ? "Inloggen" : "Account aanmaken"}
        </h1>
        <p className="mb-5 text-[13px]" style={{ color: "var(--text-2)" }}>
          {modus === "inloggen"
            ? "Log in om je landgoederen te beheren."
            : "Maak een account om te beginnen."}
        </p>

        <form onSubmit={verstuur} className="flex flex-col gap-3">
          {modus === "registreren" && (
            <div>
              <label className="label-up mb-1 block">Naam</label>
              <input
                className="input"
                type="text"
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="label-up mb-1 block">E-mail</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label-up mb-1 block">Wachtwoord</label>
            <input
              className="input"
              type="password"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
              required
              minLength={6}
              autoComplete={
                modus === "inloggen" ? "current-password" : "new-password"
              }
            />
          </div>

          {fout && (
            <div
              className="rounded-[8px] px-3 py-2 text-[12.5px]"
              style={{ background: "var(--red-light)", color: "var(--red)" }}
            >
              {fout}
            </div>
          )}
          {melding && (
            <div
              className="rounded-[8px] px-3 py-2 text-[12.5px]"
              style={{
                background: "var(--primary-light)",
                color: "var(--primary)",
              }}
            >
              {melding}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary mt-1 w-full"
            disabled={bezig}
          >
            {bezig
              ? "Bezig…"
              : modus === "inloggen"
                ? "Inloggen"
                : "Account aanmaken"}
          </button>
        </form>

        <div
          className="mt-5 text-center text-[12.5px]"
          style={{ color: "var(--text-2)" }}
        >
          {modus === "inloggen" ? (
            <>
              Nog geen account?{" "}
              <button
                className="font-semibold"
                style={{ color: "var(--primary)" }}
                onClick={() => {
                  setModus("registreren");
                  setFout(null);
                  setMelding(null);
                }}
              >
                Registreren
              </button>
            </>
          ) : (
            <>
              Al een account?{" "}
              <button
                className="font-semibold"
                style={{ color: "var(--primary)" }}
                onClick={() => {
                  setModus("inloggen");
                  setFout(null);
                  setMelding(null);
                }}
              >
                Inloggen
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
