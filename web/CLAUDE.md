@AGENTS.md

## Debuggen van build- en deploy-fouten

**Regel:** bij een onbekende build- of runtime-fout éérst de volledige log/stack
binnenhalen en de oorzaak vaststellen, dán één gerichte fix. Niet gokken, niet de
gebruiker ronde na ronde dingen laten proberen. Denken → plan → één uitvoering.

**Hoe de echte fout binnenhalen:**
- Build-logs: Vercel MCP `get_deployment_build_logs` (op deployment-ID, niet hostname).
- Runtime-logs (500's e.d.): Vercel MCP `get_runtime_logs`.
- Is de fout afgekapt (bv. "npm error Invalid Version:" zonder stack), forceer de
  debug-log zichtbaar via een tijdelijke Install Command:
  `npm install || (echo "=== NPM DEBUG LOG ==="; cat /vercel/.npm/_logs/*-debug-0.log; exit 1)`
- Reproduceer lokaal gericht (bv. `npm install --dry-run --os=linux --cpu=x64`) i.p.v. blind pushen.

**Bekende valkuilen (deze repo):**
- `unrs-resolver` (transitief via `eslint-config-next` → `eslint-import-resolver-typescript`)
  liet Vercels npm crashen in de arborist dedupe-stap (`TypeError: Invalid Version`,
  `new SemVer("")`). Niet de Root Directory / Node-versie / install-command. Opgelost door
  `eslint` + `eslint-config-next` uit devDependencies te halen; install via `npm install`
  in `vercel.json`. Next 16 kent geen `eslint`-key in `next.config.ts`.
- Na een **verse Vercel-import** komen environment variables NIET mee → runtime 500
  (`createServerClient` met ontbrekende `NEXT_PUBLIC_SUPABASE_*`). Eerst env-vars zetten,
  dan redeployen.
