#!/usr/bin/env bash
# Migratie-runner (issue #20): past nog niet toegepaste migraties uit
# web/supabase/migrations toe op de database in $DATABASE_URL.
#
# - Bijhouden gebeurt in public.migratie_log (eigen tabel; we blijven af van
#   supabase_migrations, dat nog de oude, afwijkende geschiedenis bevat).
# - Eenmalige baseline: is de log leeg, dan worden de versies uit
#   web/supabase/baseline_toegepast.txt gemarkeerd als reeds toegepast —
#   die staan al op live uit het handmatige tijdperk en mogen NOOIT opnieuw
#   draaien (de vroege migraties zijn niet idempotent).
# - Elke nieuwe migratie draait in één transactie, samen met zijn logregel:
#   faalt de migratie, dan wordt er ook niets geregistreerd (en stopt de run).
#
# Draait in CI (.github/workflows/migraties.yml); lokaal testbaar met
# MIGRATIEMAP/BASELINE overrides. Fail-closed: geen DATABASE_URL = stoppen.
set -euo pipefail

MIGRATIEMAP="${MIGRATIEMAP:-web/supabase/migrations}"
BASELINE="${BASELINE:-web/supabase/baseline_toegepast.txt}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FOUT: DATABASE_URL ontbreekt. Zet het repo-secret SUPABASE_DB_URL" >&2
  echo "(GitHub → Settings → Secrets and variables → Actions)." >&2
  exit 1
fi

psql_q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA -c "$1"; }

# 1. Logtabel (idempotent).
psql_q "create table if not exists public.migratie_log (
  versie        text primary key,
  naam          text not null,
  bron          text not null default 'ci',
  toegepast_op  timestamptz not null default now()
);" >/dev/null

# 2. Eenmalige baseline bij lege log.
AANTAL=$(psql_q "select count(*) from public.migratie_log;")
if [ "$AANTAL" = "0" ] && [ -f "$BASELINE" ]; then
  echo "Log is leeg — baseline laden uit $BASELINE"
  while IFS= read -r naam; do
    [ -z "$naam" ] && continue
    case "$naam" in \#*) continue ;; esac
    versie="${naam%%_*}"
    psql_q "insert into public.migratie_log (versie, naam, bron)
            values ('$versie', '$naam', 'baseline')
            on conflict (versie) do nothing;" >/dev/null
    echo "  baseline: $naam"
  done < "$BASELINE"
fi

# 3. Nieuwe migraties toepassen, op versievolgorde, elk in één transactie.
TOEGEPAST=0
for f in "$MIGRATIEMAP"/*.sql; do
  naam=$(basename "$f")
  versie="${naam%%_*}"
  BESTAAT=$(psql_q "select count(*) from public.migratie_log where versie = '$versie';")
  [ "$BESTAAT" != "0" ] && continue
  echo "Toepassen: $naam"
  {
    echo "begin;"
    cat "$f"
    echo ";"
    echo "insert into public.migratie_log (versie, naam) values ('$versie', '$naam');"
    echo "commit;"
  } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
  TOEGEPAST=$((TOEGEPAST + 1))
done

echo "Klaar: $TOEGEPAST migratie(s) toegepast."
