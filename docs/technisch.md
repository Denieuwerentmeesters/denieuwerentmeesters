# Landgoedplatform — Technisch document

**De Nieuwe Rentmeesters** · Architectuur, tech stack en datamodel · versie 1.5 · juni 2026

Dit is het technische document voor de bouw van het platform. Het bevat de architectuur, de tech stack, het volledige datamodel met SQL, de beveiliging (Row Level Security), de mappenstructuur, de risico-inschatting en de Claude Code-prompts per module. Het algemene plan (doelgroep, modules in gewone taal, positionering) staat in een apart document (versie 1.1).

> **Wat is nieuw in versie 1.1** (na de validatiegesprekken met Frederik van Boetzelaer en Uko en de aangescherpte keuzes):
> - **Licht financieel inzicht** is een **basismodule** geworden (read-only koppeling met bank en/of boekhouding — Moneybird, e-Boekhouden). De diepe financiële laag (rendement per perceel/activiteit) blijft pro.
> - **Omgevingsradar** toegevoegd als **basismodule**: relevante berichten (bijeenkomsten, beleids-/regelwijzigingen) uit nieuwsbrieven/mail en RSS, streng AI-gefilterd op relevantie, omgezet naar een agendapunt of taak. Bewust géén stroom van alle lokale vergunningen.
> - **Incidenten melden** en **Vergaderingen** verplaatst van *uitbreiding* naar **basis** (Fase 1).
> - **Contracten**: reguliere **huur** en **indexatie** even serieus als pacht (alerts).
> - **Projecten**-module toegevoegd (ontwikkelprojecten met fase, besluiten, documenten).
> - **Contractvoorbereiding-keten** (gesprek → conceptcontract → reviewverzoek → versiebeheer) uitgewerkt in de AI-laag.
> - **Subsidieradar** verbreed met **CO2/carbon- en groenblauwe verdienkansen**.

> **Wat is nieuw in versie 1.2** (na het sparren over tenant-onboarding):
> - **Deel V toegevoegd:** de onboarding-, beheer- en configuratielaag per landgoed. Een centraal **admin-controlepaneel** over alle landgoederen (onboarding-status, koppelingsstatus, activiteit), een **gedeelde onboarding-wizard** (eigenaar óf wij), een uniforme **koppelingenlaag** (`koppeling`) met geheimen in **Supabase Vault** en strikt **read-only** als principe, een **provisioning-functie** (`landgoed_aanmaken`) die een landgoed atomair geboren laat worden, en **"namens de eigenaar werken"** als zichtbaar, herleidbaar mechanisme (`handeling_log`).

> **Wat is nieuw in versie 1.3** (na het sparren over modules, visievorming en het verdienmodel):
> - **Documentmodule (visievorming)** toegevoegd in Deel III: een aparte werkplaats waarin de AI een concept-visie/-plan **synthetiseert** uit vier bronnen (vergaderingen, eerdere documenten, nationale wetgeving, lokale verordeningen). Hergebruikt `document` + `document_versie`; voegt `document_bron` toe voor herleidbaarheid. Bewust **zonder** vector-zoekmachine (zie het aparte kennisbank-document voor de afweging).
> - **Expert-spoor** toegevoegd als verdienmechanisme: `expert` (ons netwerk-register) + `expert_verzoek` (van landgoed naar ons). Generaliseert het `review_verzoek`; de bemiddeling/koppeling ligt bij admin (bewuste RLS-asymmetrie). Zichtbaar als werkvoorraad in het admin-controlepaneel.
> - **Verduidelijking:** de niveaus basis/uitbreiding/pro zijn **zichtbaarheidsniveaus, geen prijscategorieën**. De documentmodule staat op uitbreiding.

> **Wat is nieuw in versie 1.4** (na het sparren over de intake van de Documentmodule):
> - **Intake-laag toegevoegd** aan de Documentmodule (Deel III): **documentmakers als data** (`documentmaker`, `documentmaker_vraag`, `document_intake_antwoord`) in plaats van geprogrammeerde sjablonen — een nieuwe maker is één record. Drie vastgelegde keuzes: **alles vooraf invullen** dan pas genereren, **liever een gat dan een aanname** (ontbrekende input wordt zichtbaar gemarkeerd, nooit verzonnen), en **zelfservice in gewone taal**. De intake is "de vijfde bron" naast de vier bestaande. **Vier startmakers** (beheervisie, overheidsonderbouwing, projectplan, subsidie-onderbouwing); vraagsets in een apart werkdocument.

> **Wat is nieuw in versie 1.5** (na het overleg De Zeemeeuw — Reinoud, Steven, Hugo, 16 juni 2026):
> - **Tech stack — compute losgekoppeld van data.** Het overleg koos voor een echte backend (Steven: "Railway werkt prettiger"), géén Supabase voor alles. **Aanbevolen, toekomstvaste architectuur (te bevestigen met team):** **Supabase** blijft de **datalaag** (PostgreSQL + Auth + Storage + RLS + Vault), **Railway** wordt de **backend/workers** (e-mailingestie, bankpolling, factuurscan, AI-orkestratie, cron/queues), **Vercel** blijft de **frontend**. Reden: de multi-tenant-isolatie via RLS op `auth.uid()` is het riskantste om zelf te bouwen — dat houden we op Supabase; het compute-zware toekomstwerk hoort op een always-on backend. **Gevolg voor dit document:** alle bestaande SQL, RLS en datamodel blijven geldig (Supabase = Postgres); alleen de zwaardere achtergrondverwerking verhuist van Vercel/Edge-functions naar een Railway-service. Pure Neon+Auth.js bleef een optie maar is afgevallen wegens zelf-bouwen van de security-backbone. Zie Deel I §1 en §10.
> - **Financiële module aangescherpt — transactiebasis i.p.v. kasbasis.** Kerninzicht uit het overleg (Hugo): landgoederen boeken vaak op kasbasis, maar voor echt inzicht moet je op **transactiebasis** boeken — met name **voorzieningen voor groot onderhoud** (bv. schilderwerk ≈ €12.000 eens per 7 jaar → jaarlijks opbouwen, anders in jaar 7 een verrassing). De voorziening wordt gevoed door de MJOP. Zie *Licht financieel inzicht* en *Meerjarenbeheerplan*.
> - **Boekhoudkoppeling — twee paden expliciet.** Pad 1 (korte termijn): read-only API-koppeling met het bestaande pakket van de klant (Moneybird, **Exact**, e-Boekhouden) — klant hoeft niet te wisselen (salesvoorwaarde). Pad 2 (later): een vast extern administratiekantoor/digitale agent dat de boekhouding doet via API (factuur scannen → goedkeuren in onze omgeving → betaling via bank → administratie bijgewerkt; "Bartot-model"). We bouwen zelf **geen** boekhoudsysteem.
> - **Financieel dashboard — gespecificeerd.** Gewenst: openstaande facturen, achterstallige huren, **cashflowprognose ~1,5 jaar** (verreweg het belangrijkst), gebudgetteerd vs. werkelijk groot onderhoud, enkele kernratio's, halfjaarlijks een geüpdatete balans, maandelijks een W&V. Voor een landgoed is **cashflow leidend; de balans minder relevant**.
> - **Eerste echte bouw: Ter Hooge als testomgeving.** E-mail koppelen + uitlezen, bankkoppeling, gegevens importeren — een werkende tool voor het eigen landgoed én de eerste tastbare mock-up (te tonen aan Chris ~3 weken, daarna Frederik/Uko). Ijkpunt eind augustus.
> - **Naam = werktitel.** Definitieve merknaam (en bijbehorende login/database-instances) geparkeerd tot de propositie scherp staat.

## Inhoud

- **Deel I — Fundament.** Architectuur, tech stack, rollen, datamodel, beveiliging, mappenstructuur, stappenplan, database-scripts, Claude Code-prompt.
- **Deel II — Ontwerpuitgangspunt: modulair en gelaagd.** Het niveau-mechanisme (basis/uitbreiding/pro).
- **Deel III — Technische uitwerking per module.** Contacten & communicatie, licht financieel inzicht, omgevingsradar, contracten (pacht/huur), projecten, beheerplan, vergaderingen, contractvoorbereiding-keten, documentmodule (visievorming), expert-spoor, extra modules, kaart (PDOK).
- **Deel IV — Technische risico's en fasering.**
- **Deel V — Onboarding, beheer & koppelingen per landgoed.** Configuratielaag, koppelingen met Vault, provisioning, gedeelde onboarding-wizard, admin-controlepaneel, namens-werken met audit.

---

# Deel I — Fundament

## 1. Wat we bouwen en waarom zo

We bouwen één applicatie waarin meerdere landgoederen leven. Elk landgoed heeft eigen gebruikers, eigen documenten, eigen modules die aan of uit staan. Een rentmeester kan toegang hebben tot meerdere landgoederen; een eigenaar tot één. Een admin (jij) beheert alles.

Dat heet een multi-tenant applicatie: één systeem, veel "huurders" (landgoederen), strikt van elkaar gescheiden. De scheiding is geen detail maar de kern — het mag nooit voorkomen dat de eigenaar van landgoed A de contracten van landgoed B ziet.

### De bouwstenen

> **Architectuurkeuze (overleg De Zeemeeuw, juni 2026 — aanbevolen, te bevestigen met team).** We koppelen **compute** los van **data**. De datalaag (database, login, opslag, isolatie) is security-kritisch en houden we op een beproefd, managed platform; de compute-zware achtergrondverwerking (e-mail, bank, scannen, AI) hoort op een echte, always-on backend. Vandaar drie lagen i.p.v. één alles-in-één-dienst.

**Vercel** host de frontend (de schermen die de gebruiker ziet) en de lichte server-routes van Next.js. Je hebt de Vercel-connector al.

**Supabase** is de **datalaag**: PostgreSQL (de database), authenticatie (login, wachtwoorden, sessies), bestandsopslag (de documenten), Row Level Security (de multi-tenant-isolatie) en Vault (geheimen). Eén dienst voor alles wat met data en toegang te maken heeft. We houden dit op Supabase omdat de isolatie tussen landgoederen via RLS op `auth.uid()` het riskantste is om zelf te bouwen — één fout = een ander landgoed z'n data.

**Railway** is de **backend voor het zware werk**: een always-on service (en workers/cron/queues) voor e-mailingestie, bankpolling, factuurscan, AI-orkestratie, subsidie-matching en periodieke signalering. Dit is waar het product naartoe groeit, en waar een echte backend prettiger en toekomstvaster is dan serverless functions. In de eerste Fasen (0–1) is dit nog licht — de eerste klusjes kunnen ook in een Next.js-route op Vercel — maar Railway is het aangewezen huis zodra de achtergrondverwerking serieus wordt.

**Next.js** is het framework waarin de frontend en de lichte server-routes geschreven zijn. Het draait op Vercel en praat met Supabase. Dit is de standaardcombinatie voor dit soort applicaties, goed gedocumenteerd, en Claude Code kent het door en door.

> **Over Neon en "niet Supabase".** Het overleg noemde Railway (backend), Neon (database) en Vercel — uitdrukkelijk niet Supabase. We honoreren de kern daarvan (Railway als echte backend) maar houden de **database op Supabase**, omdat Supabase Postgres + Auth + Storage + RLS als één geheel levert; los naar Neon gaan betekent auth, opslag en RLS-koppeling zelf bouwen. Supabase ís Postgres en is self-hostbaar/open-source: mocht de auth-lock-in ooit knellen, dan is migratie naar Neon een dump+restore. Deze afweging staat open in §10.

### Waarom niet GitHub Pages

De bestaande dashboards staan op GitHub Pages. Dat is prima voor statische demo's, maar het kan geen veilige login en geen database aan — alles wat op GitHub Pages staat is per definitie openbaar leesbaar. Zodra je inloggen, rechten en privé-documenten wilt, móét je naar een echte applicatie. De demo's gaan niet verloren: ze worden de blauwdruk voor hoe een landgoedpagina eruitziet.

## 2. De rollen

Vier rollen, oplopend in rechten. De rol staat per gebruiker per landgoed vast (in de tabel `lidmaatschap`), dus dezelfde persoon kan eigenaar zijn van het ene landgoed en rentmeester van het andere.

| Rol | Wie | Mag |
|---|---|---|
| `admin` | Jij / De Nieuwe Rentmeesters | Alles. Landgoederen aanmaken, gebruikers koppelen, nationale documenten beheren, alle data zien |
| `eigenaar` | Landgoedeigenaar | Eigen landgoed volledig beheren, modules aan/uit zetten, gebruikers uitnodigen, documenten uploaden |
| `rentmeester` | Beheerder/rentmeester | Eigen landgoed(eren) beheren en documenten uploaden, maar geen gebruikers beheren |
| `kijker` | Bestuurslid, familie, accountant | Alleen lezen |

> **De kijker-rol is in het algemene plan v1.1 een verkoopargument geworden** (transparantie richting mede-eigenaren/bestuur — denk aan Frederiks broer als mede-aandeelhouder). Technisch verandert er niets: de rol bestaat al en geeft alleen-lezen toegang. Wel is het de moeite waard om voor de kijker een **compacte, leesgerichte dashboard-weergave** te maken (cijfers, projectstatus, taakverdeling) in plaats van het volledige beheerscherm. Zie Deel III, *Licht financieel inzicht* en *Projecten*.

## 3. Het datamodel

Alles draait om de tabel `landgoed`. Elke andere tabel die landgoed-specifiek is, draagt een `landgoed_id` zodat de data altijd aan het juiste dossier hangt. Dat is het mechanisme dat je vroeg: zo blijft alles geordend tussen landgoederen.

### Kerntabellen

- `landgoed` — het dossier zelf. Naam, gemeente(n), provincie, oppervlakte, NSW-status, eigendomsvorm. Eén rij per landgoed.
- `profiel` (gekoppeld aan Supabase auth) — de gebruiker. Naam, e-mail. Supabase beheert de wachtwoorden en login zelf; deze tabel houdt de extra gegevens bij.
- `lidmaatschap` — de koppeling tussen gebruiker en landgoed, mét rol. Dit is de toegangscontrole. Eén rij per (gebruiker × landgoed)-combinatie.
- `module_instelling` — per landgoed per module een aan/uit-vlag mét niveau (basis/uitbreiding/pro).
- `document` — alle documenten. Veld `scope` onderscheidt nationaal van landgoed. Bestand in Supabase Storage; tabel houdt verwijzing en metadata bij. (In v1.1 uitgebreid met versiebeheer t.b.v. de contractvoorbereiding-keten.)
- `perceel` — kadastrale percelen per landgoed. Gekoppeld aan kaartdata (PDOK).
- `contract` — erfpacht, pacht, **huur**, beheerovereenkomsten. Per landgoed. (In v1.1 uitgebreid met indexatie en servicekosten.)
- `object` — gebouwen en bouwwerken (kasteel, oranjerie, boerderij). Per landgoed.
- `relatie` — pachters, huurders, overheden, adviseurs, dienstverleners. Per landgoed.
- `subsidie` — subsidie- en verdienkansen (incl. carbon/groenblauw). Nationaal of landgoed-specifiek gematcht.
- `taak` en `agenda_item` — acties en afspraken per landgoed.
- **Nieuw in v1.1:** `financiele_bron` + `transactie` (licht financieel inzicht), `omgevingsbron` + `omgevingsbericht` (omgevingsradar), `project` + `project_besluit` (projecten). Plus uitbreidingen op bestaande tabellen. Zie Deel III.

### Hoe het samenhangt

```
profiel ──< lidmaatschap >── landgoed
                               │
                               ├──< document (scope: nationaal | landgoed)
                               ├──< perceel
                               ├──< object
                               ├──< contract
                               ├──< relatie
                               ├──< subsidie
                               ├──< taak
                               ├──< agenda_item
                               ├──< financiele_bron ──< transactie
                               ├──< omgevingsbron ──< omgevingsbericht
                               ├──< project ──< project_besluit
                               └──< module_instelling
```

Lees `──<` als "heeft meerdere". Eén landgoed heeft meerdere documenten; één gebruiker heeft meerdere lidmaatschappen.

## 4. De beveiliging — Row Level Security

Dit is het belangrijkste deel en het deel dat je niet mag overslaan of uitstellen.

Standaard zou elke ingelogde gebruiker via de database-API bij élke rij van élke tabel kunnen. Row Level Security (RLS) is een set regels in de database zelf die per rij bepaalt of de huidige gebruiker hem mag zien of wijzigen. De regel is steeds: *je mag een rij alleen zien als je via `lidmaatschap` aan het bijbehorende landgoed gekoppeld bent* (of als je admin bent, of als de rij scope `nationaal` heeft).

Cruciaal: dit zit in de database, niet in de frontend-code. Zelfs als iemand de app omzeilt en rechtstreeks de API aanroept, komt hij niet bij data van een ander landgoed. Dat is de enige veilige manier om multi-tenant te bouwen.

De volledige SQL hiervoor staat in sectie 7. Het patroon is overal hetzelfde:

```sql
-- Voorbeeld: je mag een document zien als...
create policy "document zichtbaar voor leden"
on document for select
using (
  scope = 'nationaal'            -- iedereen mag nationale docs
  or is_lid_van(landgoed_id)     -- of je bent lid van dit landgoed
  or is_admin()                  -- of je bent admin
);
```

> **De nieuwe v1.1-tabellen krijgen exact hetzelfde RLS-patroon.** Alle landgoed-specifieke tabellen volgen "leden lezen, eigenaar/rentmeester/admin beheren". Voor financiële data geldt een extra overweging: kijkers (bestuur/familie) mógen meelezen — dat is juist de bedoeling van de transparantie — maar niet bewerken.

## 5. De mappenstructuur van de repository

Eén repository, netjes ingedeeld. Next.js bepaalt de hoofdstructuur; wij vullen die in.

```
landgoedplatform/
├── app/
│   ├── (auth)/
│   │   ├── login/                login-scherm
│   │   └── uitnodiging/          uitnodiging accepteren
│   ├── (app)/
│   │   ├── landgoederen/         overzicht: kies een landgoed
│   │   ├── landgoed/[id]/        één landgoed-dashboard
│   │   │   ├── overzicht/
│   │   │   ├── documenten/
│   │   │   ├── financieel/       NIEUW: licht financieel inzicht
│   │   │   ├── omgevingsradar/   NIEUW: relevante omgevingsberichten
│   │   │   ├── kaart/
│   │   │   ├── subsidieradar/
│   │   │   ├── contracten/
│   │   │   ├── projecten/        NIEUW: ontwikkelprojecten
│   │   │   ├── vergaderingen/
│   │   │   ├── incidenten/
│   │   │   ├── onderhoud/        MJOP
│   │   │   └── instellingen/     modules aan/uit
│   │   └── admin/                alleen voor admin
│   │       ├── landgoederen/     landgoederen aanmaken
│   │       ├── gebruikers/       gebruikers koppelen
│   │       └── documenten/       nationale documenten
│   └── layout.tsx
├── components/                   herbruikbare schermonderdelen
│   ├── ui/                       knoppen, kaarten, tags
│   ├── dashboard/                KPI-blokken, lijstrijen
│   └── kaart/                    Leaflet-kaartcomponent
├── lib/
│   ├── supabase/                 verbinding met de database
│   │   ├── client.ts             browserkant
│   │   ├── server.ts             serverkant
│   │   └── middleware.ts         sessiebeheer
│   ├── auth.ts                   rol- en rechtencontrole
│   ├── pdok.ts                   percelen/gebouwen ophalen
│   ├── financieel.ts             NIEUW: bank/Moneybird import + categorisering
│   └── omgeving.ts               NIEUW: mail/RSS-ingestie + relevantiefilter
├── supabase/
│   ├── migrations/               de SQL-scripts (sectie 7)
│   └── seed.sql                  startdata (Ter Hooge, Gunterstein)
├── styles/
│   └── theme.ts                  kleuren: #1B3A28, Plus Jakarta Sans
├── .env.local                    geheime sleutels (niet in git!)
└── package.json
```

Het ontwerp (dark forest green #1B3A28, Plus Jakarta Sans, de kaart-stijl) komt rechtstreeks uit de bestaande dashboards. We hergebruiken die look.

## 6. Stappenplan Fase 0

Concreet, in volgorde. Je hebt na deze fase een werkende, lege applicatie met login waar je op kunt inloggen en (als admin) een landgoed kunt aanmaken.

**Stap 1 — Accounts.** Maak een gratis Supabase-project aan op supabase.com. Maak een nieuwe lege GitHub-repository aan. Beide kosten niets om te beginnen.

**Stap 2 — Supabase-sleutels.** In je Supabase-project, onder Settings → API, vind je de project-URL en de twee sleutels (publishable/anon voor de browser, secret/service voor de server). Die heb je zo nodig in `.env.local`.

**Stap 3 — Database opzetten.** Plak de SQL uit sectie 7 in de Supabase SQL-editor en voer hem uit. Dit maakt alle tabellen, de hulpfuncties en alle RLS-regels aan.

**Stap 4 — De app bouwen.** Open Claude Code in een lege map en geef het de prompt uit sectie 8. Claude Code zet het Next.js-project op, verbindt het met Supabase, en bouwt login + landgoed-overzicht + admin-paneel.

**Stap 5 — Koppelen aan Vercel.** Push de repository naar GitHub, koppel hem in Vercel, zet de Supabase-sleutels als environment variables. Vercel deployt automatisch.

**Stap 6 — Jezelf admin maken.** Maak via het login-scherm een account aan, en zet je rol in de database op admin (één SQL-regel, staat in sectie 7).

Resultaat: je logt in, ziet (nog leeg) overzicht, maakt als admin Ter Hooge aan, koppelt jezelf eraan. Klaar voor Fase 1.

## 7. De database-scripts (SQL)

Voer dit in volgorde uit in de Supabase SQL-editor. Het is opgesplitst in blokken zodat je per blok kunt controleren of het lukt.

### 7.1 Hulpfuncties

```sql
-- Geeft true als de ingelogde gebruiker admin is
create or replace function is_admin()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from lidmaatschap
    where gebruiker_id = auth.uid()
      and rol = 'admin'
  );
$$;

-- Geeft true als de ingelogde gebruiker lid is van een bepaald landgoed
create or replace function is_lid_van(doel_landgoed uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from lidmaatschap
    where gebruiker_id = auth.uid()
      and landgoed_id = doel_landgoed
  );
$$;

-- Geeft de rol van de gebruiker op een bepaald landgoed
create or replace function rol_op(doel_landgoed uuid)
returns text
language sql security definer stable
as $$
  select rol from lidmaatschap
  where gebruiker_id = auth.uid()
    and landgoed_id = doel_landgoed
  limit 1;
$$;
```

### 7.2 Tabellen

```sql
-- GEBRUIKERSPROFIEL (1-op-1 met Supabase auth.users)
create table profiel (
  id uuid primary key references auth.users(id) on delete cascade,
  naam text,
  email text,
  aangemaakt_op timestamptz default now()
);

-- LANDGOED
create table landgoed (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  gemeente text,
  provincie text,
  hectare numeric,
  nsw_status text,
  eigendomsvorm text,
  beschrijving text,
  aangemaakt_op timestamptz default now()
);

-- LIDMAATSCHAP (koppeling gebruiker <-> landgoed met rol)
create table lidmaatschap (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  gebruiker_id uuid not null references profiel(id) on delete cascade,
  rol text not null check (rol in ('admin','eigenaar','rentmeester','kijker')),
  aangemaakt_op timestamptz default now(),
  unique (landgoed_id, gebruiker_id)
);

-- MODULE-INSTELLINGEN (aan/uit per landgoed)
create table module_instelling (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  module text not null,
  actief boolean not null default true,
  unique (landgoed_id, module)
);
-- niveau-kolom wordt in Deel II toegevoegd

-- DOCUMENTTYPE
create table document_type (
  id uuid primary key default gen_random_uuid(),
  naam text not null
);

-- DOCUMENT (scope: nationaal of landgoed)
create table document (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid references landgoed(id) on delete cascade,
  scope text not null default 'landgoed' check (scope in ('nationaal','landgoed')),
  titel text not null,
  bestand_pad text,
  type_id uuid references document_type(id),
  samenvatting text,
  geupload_door uuid references profiel(id),
  aangemaakt_op timestamptz default now()
);

-- PERCEEL
create table perceel (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  kadastrale_gemeente text,
  sectie text,
  nummer text,
  oppervlakte numeric,
  gebruik text
);

-- OBJECT (gebouwen)
create table object (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  naam text not null,
  type text,
  bouwjaar int,
  monument_status text,
  beschrijving text
);

-- RELATIE (pachters, huurders, overheden, adviseurs, dienstverleners)
create table relatie (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  naam text not null,
  type text,
  contact text
);

-- CONTRACT (erfpacht, pacht, huur, beheer)  -- v1.1: indexatie + servicekosten
create table contract (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  type text,                      -- 'pacht','erfpacht','huur','beheer'
  partij text,
  bedrag numeric,
  ingangsdatum date,
  einddatum date,
  status text,
  indexatie_type text,            -- v1.1: bv. 'CBS-CPI','vast %','geen'
  indexatie_percentage numeric,   -- v1.1: indien vast
  laatste_indexatie date,         -- v1.1
  volgende_indexatie date,        -- v1.1: voedt de signalering
  servicekosten numeric,          -- v1.1: bij huur
  notitie text
);

-- SUBSIDIE  -- v1.1: categorie incl. carbon/groenblauw
create table subsidie (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid references landgoed(id) on delete cascade,
  scope text not null default 'landgoed' check (scope in ('nationaal','landgoed')),
  naam text not null,
  organisatie text,
  categorie text default 'subsidie'  -- v1.1: 'subsidie','carbon','groenblauw','regeling'
    check (categorie in ('subsidie','carbon','groenblauw','regeling')),
  bedrag_indicatie text,
  status text,
  match_score int,
  redenering text,
  deadline date
);

-- TAAK
create table taak (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  omschrijving text,
  prioriteit text,
  status text default 'open',
  deadline date,
  toegewezen_aan uuid references profiel(id)
);

-- AGENDA
create table agenda_item (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  datum date not null,
  tijd text,
  locatie text,
  categorie text
);
```

> De módule-specifieke tabellen (financieel, omgevingsradar, projecten, contacten/communicatie-uitbreiding, beheerplan, vergaderingen, kaart, extra modules) staan telkens bij hun eigen module in Deel III, inclusief RLS. Voer die scripts uit zodra je aan de betreffende fase begint.

### 7.3 Row Level Security aanzetten

```sql
-- RLS aanzetten op alle tabellen
alter table profiel            enable row level security;
alter table landgoed           enable row level security;
alter table lidmaatschap       enable row level security;
alter table module_instelling  enable row level security;
alter table document           enable row level security;
alter table document_type      enable row level security;
alter table perceel            enable row level security;
alter table object             enable row level security;
alter table relatie            enable row level security;
alter table contract           enable row level security;
alter table subsidie           enable row level security;
alter table taak               enable row level security;
alter table agenda_item        enable row level security;
```

### 7.4 De regels (policies)

```sql
-- PROFIEL: je ziet je eigen profiel; admin ziet alles
create policy "eigen profiel zien" on profiel for select
  using (id = auth.uid() or is_admin());
create policy "eigen profiel wijzigen" on profiel for update
  using (id = auth.uid());
create policy "eigen profiel aanmaken" on profiel for insert
  with check (id = auth.uid());

-- LANDGOED: je ziet landgoederen waar je lid van bent; admin ziet alles
create policy "landgoed zien" on landgoed for select
  using (is_lid_van(id) or is_admin());
create policy "landgoed beheren" on landgoed for all
  using (is_admin()) with check (is_admin());

-- LIDMAATSCHAP
create policy "lidmaatschap zien" on lidmaatschap for select
  using (gebruiker_id = auth.uid() or is_lid_van(landgoed_id) or is_admin());
create policy "lidmaatschap beheren" on lidmaatschap for all
  using (is_admin() or rol_op(landgoed_id) = 'eigenaar')
  with check (is_admin() or rol_op(landgoed_id) = 'eigenaar');

-- MODULE-INSTELLING: leden zien; eigenaar/admin wijzigen
create policy "modules zien" on module_instelling for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "modules beheren" on module_instelling for all
  using (is_admin() or rol_op(landgoed_id) = 'eigenaar')
  with check (is_admin() or rol_op(landgoed_id) = 'eigenaar');

-- DOCUMENT: nationaal voor iedereen, landgoed voor leden
create policy "document zien" on document for select
  using (scope = 'nationaal' or is_lid_van(landgoed_id) or is_admin());
create policy "document uploaden" on document for insert
  with check (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (is_lid_van(landgoed_id) or is_admin()))
  );
create policy "document beheren" on document for update
  using (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
  );
create policy "document verwijderen" on document for delete
  using (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
  );

-- DOCUMENTTYPE: iedereen leest, admin beheert
create policy "documenttype zien" on document_type for select using (true);
create policy "documenttype beheren" on document_type for all
  using (is_admin()) with check (is_admin());

-- PERCEEL, OBJECT, RELATIE, CONTRACT, TAAK, AGENDA_ITEM: zelfde patroon
-- (leden lezen; eigenaar/rentmeester/admin beheren). Voorbeeld perceel:
create policy "perceel zien" on perceel for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "perceel beheren" on perceel for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "object zien" on object for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "object beheren" on object for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "relatie zien" on relatie for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "relatie beheren" on relatie for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "contract zien" on contract for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "contract beheren" on contract for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "subsidie zien" on subsidie for select
  using (scope = 'nationaal' or is_lid_van(landgoed_id) or is_admin());
create policy "subsidie beheren" on subsidie for all
  using (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
  )
  with check (
    (scope = 'nationaal' and is_admin())
    or (scope = 'landgoed' and (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
  );

create policy "taak zien" on taak for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "taak beheren" on taak for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "agenda zien" on agenda_item for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "agenda beheren" on agenda_item for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### 7.5 Automatisch profiel aanmaken bij registratie

```sql
create or replace function handle_nieuwe_gebruiker()
returns trigger
language plpgsql security definer
as $$
begin
  insert into profiel (id, email, naam)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'naam', new.email));
  return new;
end;
$$;

create trigger op_nieuwe_gebruiker
  after insert on auth.users
  for each row execute function handle_nieuwe_gebruiker();
```

### 7.6 Jezelf admin maken (na registratie)

```sql
-- 1. maak een systeem-landgoed (eenmalig)
insert into landgoed (naam, beschrijving)
values ('Systeem', 'Technisch landgoed voor admin-rechten')
returning id;
-- kopieer de id die hieruit komt

-- 2. koppel jezelf als admin (vul je eigen e-mail en de id hierboven in)
insert into lidmaatschap (landgoed_id, gebruiker_id, rol)
select
  'PLAK-HIER-DE-LANDGOED-ID',
  id,
  'admin'
from profiel
where email = 'jouw@email.nl';
```

## 8. Claude Code-prompt (Fase 0)

Open Claude Code in een lege map en plak onderstaande prompt. Het bouwt de basis-app. (De database heb je in stap 3 al opgezet.)

> Bouw een multi-tenant webapplicatie voor landgoedbeheer met Next.js (App Router, TypeScript) en Supabase.
>
> **Context:** Het is een platform waarin meerdere landgoederen leven. Gebruikers loggen in en zien alleen de landgoederen waar ze lid van zijn. Rollen: admin, eigenaar, rentmeester, kijker — vastgelegd in de tabel `lidmaatschap` (kolommen: landgoed_id, gebruiker_id, rol). De database, tabellen en Row Level Security bestaan al in Supabase; je hoeft die niet aan te maken. Verbind er alleen mee.
>
> **Ontwerp:** Donker bosgroen #1B3A28 als primaire kleur, #2A5C3F als accent, lichte achtergrond #F1F3F6. Lettertype Plus Jakarta Sans (via Google Fonts). Strakke kaarten met zachte schaduw, afgeronde hoeken (14px), SVG-iconen. Nederlandse interface.
>
> **Bouw in deze fase alleen:**
> 1. **Supabase-verbinding** — browser-client, server-client en middleware voor sessiebeheer. Sleutels uit environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).
> 2. **Login-scherm** (`/login`) — e-mail + wachtwoord via Supabase Auth, plus registratie. Nette foutmeldingen in het Nederlands. Na inloggen door naar `/landgoederen`.
> 3. **Landgoed-overzicht** (`/landgoederen`) — toont alle landgoederen waar de ingelogde gebruiker lid van is (RLS regelt de filtering). Elk landgoed als klikbare kaart met naam, gemeente, oppervlakte. Toon de rol als tag.
> 4. **Landgoed-dashboard skelet** (`/landgoed/[id]/overzicht`) — layout met zijbalk (navigatie naar de actieve modules) en hoofdgebied. De zijbalk toont alleen modules die voor dit landgoed actief zijn (lees `module_instelling`). Placeholder-KPI-blokken.
> 5. **Instellingen-pagina** (`/landgoed/[id]/instellingen`) — alleen voor eigenaar en admin. Toont alle modules met een aan/uit-schakelaar die `module_instelling.actief` wijzigt, gegroepeerd per niveau.
> 6. **Admin-paneel** (`/admin`) — alleen voor admin. Landgoederen aanmaken/bewerken, gebruikers koppelen met een rol, nationale documenten (placeholder).
> 7. **Toegangscontrole** — helper in `lib/auth.ts`. Niet-ingelogd → `/login`. Geen toegang → nette melding.
>
> **Belangrijk:** Vertrouw op Row Level Security; filter niet handmatig op landgoed_id. Gebruik de Supabase server-client waar mogelijk. Houd componenten herbruikbaar (Card, Button, Tag, Sidebar). Nederlandse interface. Responsive: op mobiel een onderbalk in plaats van de zijbalk.
>
> Geef me na het bouwen een korte uitleg van hoe ik het lokaal start en naar Vercel deploy.

## 9. Wat hierna komt (vooruitblik)

Na Fase 0 staat het fundament. De volgende fasen vullen het — zie Deel IV voor de volledige, in v1.1 bijgewerkte fasering.

## 10. Beslissingen die nog open staan

- **Stack-bevestiging (v1.5):** de aanbevolen architectuur — Supabase (data/auth/storage/RLS) + Railway (backend/workers) + Vercel (frontend) — moet nog met Steven en Hugo bevestigd worden. Steven leunde naar Railway+Neon; deze opzet geeft Railway de backend maar houdt de database op Supabase. Te beslissen vóór de eerste echte bouw.
- **Wanneer Railway erbij:** in Fase 0–1 kan de lichte verwerking nog in Next.js-routes op Vercel; de Railway-worker is nodig zodra e-mailingestie, bankpolling en factuurscan structureel draaien (Fase 2+). Exacte knip nog te bepalen.
- **Kosten:** Supabase en Vercel hebben ruime gratis tiers; Railway rekent per gebruik (een kleine worker is enkele euro's/maand). Voor een handvol landgoederen blijf je laag — enkele tientjes per maand bij serieus gebruik.
- **Domeinnaam + naam:** Vercel geeft een gratis adres (bv. landgoedplatform.vercel.app). Voorlopig een **werktitel** voor app/login/database-instances; definitieve merknaam geparkeerd tot de propositie scherp staat. Later een eigen domein.
- **AI-laag:** document-samenvatting, subsidie-matching, omgevings-relevantiefilter, notulen en transactie-categorisering draaien via de Claude API. Kosten per gebruik, laag bij dit volume.
- **Bankkoppeling (v1.1):** de keuze tussen *bestandsimport* (CSV/MT940/camt.053 — direct te bouwen, geen vergunning) en een *PSD2-aggregator* voor live feed (bv. GoCardless Bank Account Data / Enable Banking) blijft open. Aanbeveling: begin met import + Moneybird/Exact-API, voeg een aggregator later toe. Zie Deel III.
- **Boekhoud Pad 2 (later):** een vast extern administratiekantoor/digitale agent dat de boekhouding voert via API-koppeling (Bartot-model). Nog te verkennen; geen consequenties voor Fase 0–1.
- **Verdienmodel/prijs:** bewust nog niet vastgelegd (zie algemeen plan); heeft geen technische consequenties voor Fase 0–1.

---

# Deel II — Ontwerpuitgangspunt: modulair en gelaagd

Het platform is bewust eenvoudig in de basis en uitbreidbaar op verzoek. Voor de techniek betekent dit dat modules per landgoed aan of uit staan, met drie niveaus: **basis** (staat meteen aan), **uitbreiding** (aan te zetten wanneer nodig) en **pro** (voor grotere landgoederen). De volledige onderbouwing van dit principe staat in het algemene plan; hieronder alleen het technische mechanisme.

## Het niveau-mechanisme

De `module_instelling`-tabel krijgt naast `actief` een tweede eigenschap: een `niveau` (`basis`, `uitbreiding`, `pro`). Bij het aanmaken van een landgoed worden alleen de basis-modules op actief gezet; de rest staat klaar maar uit. De instellingen-pagina groepeert de modules per niveau, zodat de gebruiker rust ziet: "dit heb je, dit kun je erbij krijgen."

```sql
alter table module_instelling add column niveau text default 'uitbreiding'
  check (niveau in ('basis','uitbreiding','pro'));
```

Een nieuw landgoed krijgt automatisch de basis-set actief. **De basis-set is in v1.1 uitgebreid** met omgevingsradar, licht financieel inzicht, incidenten en vergaderingen:

```sql
-- pseudostap bij het aanmaken van een landgoed: zet de basis aan
insert into module_instelling (landgoed_id, module, niveau, actief) values
  (:id, 'dashboard',         'basis', true),
  (:id, 'documenten',        'basis', true),
  (:id, 'taken',             'basis', true),
  (:id, 'contacten',         'basis', true),
  (:id, 'communicatie',      'basis', true),
  (:id, 'contracten',        'basis', true),
  (:id, 'subsidieradar',     'basis', true),
  (:id, 'omgevingsradar',    'basis', true),   -- v1.1 (nieuw, basis)
  (:id, 'financieel_inzicht','basis', true),   -- v1.1 (nieuw, basis)
  (:id, 'incidenten',        'basis', true),   -- v1.1 (van uitbreiding -> basis)
  (:id, 'vergaderingen',     'basis', true),   -- v1.1 (van uitbreiding -> basis)
  -- uitbreidingen klaarzetten, maar uit:
  (:id, 'percelen_gebouwen', 'uitbreiding', false),
  (:id, 'kaart',             'uitbreiding', false),
  (:id, 'onderhoud',         'uitbreiding', false),
  (:id, 'beheerplan',        'uitbreiding', false),
  (:id, 'natuur_bos',        'uitbreiding', false),
  (:id, 'projecten',         'uitbreiding', false), -- v1.1 (nieuw)
  (:id, 'documentmodule',    'uitbreiding', false), -- v1.3 (visievorming)
  -- pro klaarzetten, maar uit:
  (:id, 'werkorders',        'pro', false),
  (:id, 'wagenpark',         'pro', false),
  (:id, 'financien_diepte',  'pro', false),   -- v1.1: rendement per perceel/activiteit (pro)
  (:id, 'multi_landgoed',    'pro', false);
```

> **Let op het onderscheid** tussen `financieel_inzicht` (basis — licht, read-only kosten/cashflow uit bank/boekhouding) en `financien_diepte` (pro — rendement per perceel en per activiteit). Het eerste is een laagdrempelig instapargument voor kleine eigenaren; het tweede is zware analyse voor grotere landgoederen.

---

# Deel III — Technische uitwerking per module

## Contacten en communicatie

### 1. Wat de gebruiker doet

**Contacten beheren.** Per landgoed is er één contactenlijst. Daarin staan niet alleen pachters, huurders, overheden en adviseurs, maar ook dienstverleners: de loodgieter, de tuinman, de schoonmaak. Elk contact heeft een type (zodat je kunt filteren), contactgegevens en een notitieveld.

**Een taak koppelen aan iemand.** Bij het aanmaken of bewerken van een taak kies je aan wie hij wordt toegewezen: een **intern lid** (iemand met een login) of een **extern contact** (iemand uit de contactenlijst zonder login).

- **Intern lid** → ziet de taak op zijn eigen dashboard en krijgt een e-mailmelding.
- **Extern contact** → de app stelt een nette mail op, die kant-en-klaar opent in jouw eigen mailprogramma; jij leest na en verstuurt.

Zo blijf jij in de regie over wat er naar buiten gaat, en hoeven externe dienstverleners niet in te loggen.

### 2. De twee paden

**Intern: app + e-mailmelding.** Zodra een taak aan een lid wordt toegewezen, stuurt het systeem een korte e-mail met een link naar de taak. De webapp werkt al op de telefoon, dus een aparte mobiele app is niet nodig. De melding gaat via een eenvoudige transactionele maildienst.

**Extern: AI stelt op, jij verstuurt.** Voor een extern contact maakt de Claude API een mail op basis van de taak. De tekst verschijnt in de app met twee knoppen: *Open in mijn mail* (een `mailto:`-link met ontvanger, onderwerp en tekst ingevuld) en *Kopieer mail*. Er komt geen koppeling met Vimex aan te pas; de mail komt echt van jou. De app onthoudt dat de mail is opgesteld.

### 3. Datamodel — uitbreidingen

```sql
-- Bestaande tabel 'relatie' uitbreiden
alter table relatie add column email text;
alter table relatie add column telefoon text;
alter table relatie add column notitie text;
-- 'type' bestaat al; gebruik waarden als:
-- 'pachter','huurder','overheid','adviseur','loodgieter','tuinman','schoonmaak','aannemer','overig'

-- Bestaande tabel 'taak' uitbreiden (intern lid OF extern contact)
alter table taak add column toegewezen_contact_id uuid references relatie(id) on delete set null;
alter table taak add column mail_opgesteld_op timestamptz;

-- NOTIFICATIE (interne e-mailmeldingen)
create table notificatie (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  ontvanger_id uuid not null references profiel(id) on delete cascade,
  taak_id uuid references taak(id) on delete cascade,
  tekst text not null,
  gelezen boolean default false,
  verstuurd boolean default false,
  aangemaakt_op timestamptz default now()
);
```

### 4. Row Level Security

```sql
alter table notificatie enable row level security;
create policy "eigen notificaties zien" on notificatie for select
  using (ontvanger_id = auth.uid() or is_admin());
create policy "eigen notificaties bijwerken" on notificatie for update
  using (ontvanger_id = auth.uid());
create policy "notificatie aanmaken" on notificatie for insert
  with check (is_lid_van(landgoed_id) or is_admin());
```

### 5. Plek in de fasering

De contactenmodule hangt alleen van het fundament af en kan vroeg (Fase 1). De interne e-mailmelding deelt techniek met de notulen-export. De externe-mailknop is een sterke vroege "wow"-functie voor een eerste klant.

---

## Licht financieel inzicht (basis) — NIEUW in v1.1

### 1. Wat de gebruiker doet

Zowel Frederik (Moneybird) als Uko (bankkoppeling) wilden vooral één ding: zónder een vol boekhoudsysteem tóch grip op de cijfers. De gebruiker houdt zijn eigen administratie; wij maken het inzichtelijk. Read-only — er wordt nooit een betaling gedaan of een boeking gewijzigd vanuit de app.

**Waarom dit een kerntopic is (overleg De Zeemeeuw, Hugo).** Veel landgoederen voeren administratie op **kasbasis** (alleen wat betaald is, boekt), terwijl je voor echt inzicht op **transactiebasis** moet kijken — vooral **voorzieningen voor groot onderhoud**. Voorbeeld: schilderwerk dat eens per 7 jaar gebeurt (≈ €12.000) hoort je jaarlijks op te bouwen als voorziening; doe je dat niet, dan krijg je in jaar 7 een verrassing. Dit inzicht is dubbel belangrijk: (a) voor **eigen sturing en realistische verwachtingen** — veel landgoederen blijken bij echt inzicht niet rendabel of verliesgevend, vaak gemaskeerd door beleggingsrendement of incidentele landverkopen; (b) voor het **onderbouwen van subsidie- en provincie-/gemeenteaanvragen** — die partijen willen dat landgoederen blijven bestaan, maar willen cijfermatige onderbouwing zien. De module moet dat gat kunnen aantonen.

**Het gewenste financiële dashboard** (overleg): openstaande facturen, achterstallige huren, een **cashflowprognose van ~1,5 jaar** (verreweg het belangrijkst), **gebudgetteerd vs. werkelijk groot onderhoud** (gevoed door de MJOP-voorzieningen), enkele kernratio's, halfjaarlijks een geüpdatete balans en maandelijks een winst- en verliesrekening. Voor een landgoed is **cashflow leidend en de balans minder relevant** — daar prioriteren we naar.

### 2. De technische route — twee paden, drie ingestiebronnen

Het overleg legde twee strategische paden vast. We bouwen **zelf geen boekhoudsysteem** — dat is te ingewikkeld, en we moeten mensen geen extra werk opdringen (Steven: penningmeester Willem Theo wil daar geen tijd in steken). Bovendien is "klant hoeft niet van systeem te wisselen" een **salesvoorwaarde**.

- **Pad 1 — korte termijn, lage drempel (nu bouwen).** Read-only koppeling met het bestaande boekhoudsysteem van de klant (Moneybird, **Exact**, e-Boekhouden) en/of de bank. Waar nuttig sturen we informatie terug richting hun systeem (MJOP-voorzieningen, cashflow-input uit contracten). Frederik gebruikt bijvoorbeeld Moneybird (≈ €600/jaar).
- **Pad 2 — ideaal, op termijn.** Een vast extern administratiekantoor of digitale agent dat de boekhouding voor onze klanten voert via API-koppeling met onze tool: factuur scannen → goedkeuren in onze omgeving → betaling via de bank → administratie bijgewerkt. Bevestigd model (Bartot/Rentmeesterscoöperatie: een kantoor in Twello doet de administratie voor 5–6 landgoederen). Later uit te werken.

Binnen Pad 1 zijn er drie ingestiebronnen, oplopend in complexiteit:

1. **Bestandsimport (start hier).** De gebruiker uploadt een bankexport (CSV, MT940 of camt.053) of een Moneybird/Exact/e-Boekhouden-export. Direct te bouwen, geen vergunning, geen externe afhankelijkheid. Dit dekt "alleen al de bankgegevens uitlezen" volledig.
2. **Boekhoud-API (read-only).** Moneybird heeft een nette REST-API met OAuth2; Exact (REST/OAuth2) en e-Boekhouden (SOAP/REST) hebben eigen API's. We halen periodiek facturen, grootboekmutaties en saldi op. Read-only scope. Periodiek pollen hoort op de **Railway-worker** (zie Deel I §1).
3. **PSD2-bankaggregator (later, optioneel).** Voor een live bankfeed zonder handmatige export gebruik je een Account Information Service zoals **GoCardless Bank Account Data** (voorheen Nordigen, kent een gratis tier) of **Enable Banking**. Dit voorkomt dat je zelf een AISP-vergunning nodig hebt. Pas inbouwen als de behoefte aan automatisering er is.

Bouw de ingestie **achter één interface** (`lib/financieel.ts`), zodat bron 1, 2 en 3 verwisselbaar zijn — net als de transcriptiedienst bij vergaderingen.

**AI-hulp:** de Claude API categoriseert transacties automatisch (bv. "onderhoud", "verzekering", "pacht-opbrengst") en kan ze koppelen aan een perceel, gebouw of contract. De gebruiker corrigeert; de AI leert van de correcties via opgeslagen categorieregels.

### 3. Datamodel

```sql
-- FINANCIËLE BRON (per landgoed; meerdere mogelijk)
create table financiele_bron (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  type text not null check (type in ('bank_import','moneybird','exact','eboekhouden','bank_aggregator','handmatig')),
  naam text,                         -- bv. "Rabobank zakelijk", "Moneybird Ter Hooge"
  externe_referentie text,           -- bv. Moneybird administratie-id of IBAN
  laatst_gesynct timestamptz,
  actief boolean default true,
  aangemaakt_op timestamptz default now()
);

-- TRANSACTIE (read-only ingelezen mutaties)
create table transactie (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  bron_id uuid references financiele_bron(id) on delete set null,
  datum date not null,
  bedrag numeric not null,           -- + = inkomsten, - = uitgaven
  omschrijving text,
  tegenpartij text,
  categorie text,                    -- door AI voorgesteld, door gebruiker te corrigeren
  richting text generated always as (case when bedrag >= 0 then 'in' else 'uit' end) stored,
  perceel_id uuid references perceel(id) on delete set null,
  object_id uuid references object(id) on delete set null,
  contract_id uuid references contract(id) on delete set null,
  extern_id text,                    -- id bij de bron, om dubbele import te voorkomen
  aangemaakt_op timestamptz default now(),
  unique (bron_id, extern_id)
);
```

### 4. Row Level Security

Standaardpatroon, met één bewuste keuze: **kijkers mogen meelezen** (transparantie naar bestuur/familie), maar niet bewerken.

```sql
alter table financiele_bron enable row level security;
alter table transactie      enable row level security;

create policy "fin bron zien" on financiele_bron for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "fin bron beheren" on financiele_bron for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "transactie zien" on transactie for select
  using (is_lid_van(landgoed_id) or is_admin());   -- incl. kijker
create policy "transactie beheren" on transactie for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### 5. Privacy

Financiële data is gevoelig. Drie punten: (a) read-only — geen betaalmandaat; (b) bij gebruik van een aggregator een verwerkersovereenkomst en expliciete toestemming van de eigenaar; (c) tokens/sleutels van Moneybird/aggregator in environment variables of in een aparte, versleutelde `koppeling_geheim`-tabel, nooit in de frontend.

### 6. Claude Code-prompt (licht financieel inzicht)

> Bouw een module "Licht financieel inzicht" in de bestaande Next.js + Supabase landgoedapplicatie. De database heeft `financiele_bron` en `transactie`. Row Level Security is ingesteld.
>
> 1. **Import** (`/landgoed/[id]/financieel/import`) — upload van een bankexport (CSV, en als rek MT940/camt.053). Parse de mutaties, voorkom dubbele import via `extern_id`, en sla op in `transactie` gekoppeld aan een `financiele_bron` van type `bank_import`. Toon een voorbeeld vóór definitief importeren.
> 2. **Moneybird-koppeling** (read-only, OAuth2) — optioneel; haal facturen en grootboekmutaties op. Bouw de bron verwisselbaar achter één interface in `lib/financieel.ts`.
> 3. **Categorisering** — een server-route die nieuwe transacties naar de Claude API stuurt voor een categorie-voorstel, en transacties kan koppelen aan perceel/object/contract. De gebruiker kan corrigeren; sla correctieregels op zodat soortgelijke transacties voortaan goed gaan.
> 4. **Overzicht** (`/landgoed/[id]/financieel`) — KPI's (kosten dit jaar, inkomsten, saldo), een staaf/lijn-grafiek per maand, en kosten per categorie/perceel/gebouw. Filters op periode en categorie.
> 5. **Kijker-weergave** — voor de rol `kijker` een vereenvoudigd, leesbaar overzicht (cijfers + grafiek, geen bewerken).
>
> **Belangrijk:** read-only, nooit betalingen. Nederlandse interface, ontwerp #1B3A28/#2A5C3F, Plus Jakarta Sans. Vertrouw op RLS. Voeg "financieel_inzicht" als basismodule toe aan `module_instelling`.

### 7. Plek in de fasering

**Fase 1.** Begin met bestandsimport + (optioneel) Moneybird; de bankaggregator is een latere toevoeging. De diepe financiële laag (rendement per perceel/activiteit) blijft **pro / Fase 5**.

---

## Omgevingsradar (basis) — NIEUW in v1.1

### 1. Wat de gebruiker doet — en wat bewust níét

De omgevingsradar is **geen stroom van alle lokale vergunningen en bekendmakingen** — dat is precies de overload die de kracht van het dashboard wegneemt. Het gaat alleen om wat er écht toe doet: **uitnodigingen voor bijeenkomsten over relevante gebiedsprocessen, en beleids- of regelwijzigingen die dit landgoed raken**. Wat actie vraagt (een bijeenkomst met datum, een reactietermijn) wordt automatisch een **agendapunt of taak**. Wat niet relevant is, ziet de gebruiker niet.

### 2. De technische route — bron → relevantiefilter → actie

**Bronnen (bewust de "zachte" bronnen, niet de officiële vergunningenstroom):**

1. **Nieuwsbrief-/mail-ingestie (primair).** Elk landgoed krijgt een uniek inbound-mailadres (bv. `terhooge@inbox.landgoedplatform.nl`). De gebruiker laat relevante gemeente-/provincie-/gebiedsnieuwsbrieven daarheen sturen of forwardt ze. Inkomende mail komt via een inbound-mailservice (bv. Postmark inbound, Cloudflare Email Workers, of een catch-all met webhook) als webhook binnen en wordt opgeslagen.
2. **RSS-feeds (aanvulling).** Per provincie/gemeente configureerbare feeds, periodiek opgehaald via een Supabase scheduled function (cron).
3. **Scrapen: niet doen** — fragiel en juridisch onnodig. De officiële bekendmakingen-API (SRU / "Berichten over uw Buurt") laten we bewust links liggen omdat die juist de ruis opleveren die we willen vermijden; alleen relevant als een specifieke gebruiker expliciet vergunningen in de buurt wil volgen.

**Relevantiefilter (het hart van de module).** Elk binnengekomen bericht gaat langs de Claude API met een **profiel per landgoed**: provincie, gemeente(n), thema's (pacht, natuur, monument, verduurzaming, water, stikstof…) en trefwoorden. De AI geeft een **relevantiescore (0–100) plus een korte motivering**. Een drempel (instelbaar, bv. ≥ 60) bepaalt of het bericht zichtbaar wordt; daaronder wordt het gearchiveerd, niet getoond. Bij twijfel: liever niet tonen dan het dashboard vervuilen.

**Actie.** Is een bericht relevant én actiegericht (bevat het een datum/termijn), dan stelt de module voor er een `agenda_item` (bijeenkomst) of `taak` (reactietermijn) van te maken — met één klik, door de gebruiker bevestigd.

### 3. Datamodel

```sql
-- OMGEVINGSBRON (per landgoed; mail-alias of RSS-feed)
create table omgevingsbron (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  type text not null check (type in ('mail','rss')),
  naam text,                         -- bv. "Provincie Zeeland nieuwsbrief"
  adres text,                        -- inbound-mailalias of RSS-URL
  actief boolean default true,
  aangemaakt_op timestamptz default now()
);

-- RELEVANTIEPROFIEL (per landgoed; voedt de AI-filter)
create table omgeving_profiel (
  landgoed_id uuid primary key references landgoed(id) on delete cascade,
  provincie text,
  gemeenten text[],                  -- één of meer
  themas text[],                     -- bv. {'pacht','natuur','monument','verduurzaming'}
  trefwoorden text[],
  drempel int default 60             -- minimale relevantiescore om te tonen
);

-- OMGEVINGSBERICHT (ingelezen + gescoord)
create table omgevingsbericht (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  bron_id uuid references omgevingsbron(id) on delete set null,
  titel text,
  samenvatting text,                 -- door AI
  originele_tekst text,
  url text,
  bericht_datum date,
  relevantie_score int,              -- 0-100, door AI
  relevant boolean,                  -- score >= drempel
  motivering text,                   -- waarom (on)relevant
  thema text,
  status text default 'nieuw' check (status in ('nieuw','gezien','gearchiveerd','omgezet')),
  agenda_item_id uuid references agenda_item(id) on delete set null,
  taak_id uuid references taak(id) on delete set null,
  aangemaakt_op timestamptz default now()
);
```

### 4. Row Level Security

```sql
alter table omgevingsbron    enable row level security;
alter table omgeving_profiel enable row level security;
alter table omgevingsbericht enable row level security;

create policy "omg bron zien" on omgevingsbron for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "omg bron beheren" on omgevingsbron for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "omg profiel zien" on omgeving_profiel for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "omg profiel beheren" on omgeving_profiel for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "omg bericht zien" on omgevingsbericht for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "omg bericht beheren" on omgevingsbericht for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

> **Inbound-mail beveiliging:** zet op het inbound-adres een geheim, niet-raadbaar deel (bv. `terhooge-9f3a2@inbox…`) zodat niet zomaar iemand berichten kan injecteren, en valideer de afzender waar mogelijk.

### 5. Claude Code-prompt (omgevingsradar)

> Bouw een module "Omgevingsradar" in de bestaande Next.js + Supabase landgoedapplicatie. De database heeft `omgevingsbron`, `omgeving_profiel` en `omgevingsbericht`. RLS is ingesteld.
>
> 1. **Bronnen beheren** (`/landgoed/[id]/omgevingsradar/bronnen`) — voeg mail-aliassen en RSS-feeds toe. Toon per landgoed het unieke inbound-mailadres om nieuwsbrieven naartoe te sturen.
> 2. **Relevantieprofiel** — formulier voor provincie, gemeente(n), thema's, trefwoorden en de drempelwaarde.
> 3. **Ingestie** — (a) een webhook-route die inkomende mail ontvangt en opslaat; (b) een geplande functie die de RSS-feeds ophaalt. Beide schrijven naar `omgevingsbericht`.
> 4. **Relevantiefilter** — voor elk nieuw bericht een server-route die titel + tekst, samen met het relevantieprofiel, naar de Claude API stuurt en een score (0–100), motivering, korte samenvatting en thema teruggeeft. Zet `relevant = score >= drempel`.
> 5. **Overzicht** (`/landgoed/[id]/omgevingsradar`) — toon **alleen relevante** berichten, gesorteerd op datum/score, met samenvatting en bron. Niet-relevante berichten staan weggevouwen onder "minder relevant". Per bericht knoppen: "Maak agendapunt" (bij een datum) en "Maak taak" (bij een reactietermijn), die `agenda_item`/`taak` aanmaken en terugkoppelen.
>
> **Belangrijk:** relevantie boven volledigheid — toon liever te weinig dan te veel. Nederlandse interface, ontwerp #1B3A28/#2A5C3F, Plus Jakarta Sans. Vertrouw op RLS. Voeg "omgevingsradar" als basismodule toe aan `module_instelling`.

### 6. Plek in de fasering

**Fase 1.** De ingestie (mail + RSS) en het overzicht zijn licht. De relevantiefilter is een Claude-API-aanroep en kan in dezelfde fase mee; de finetuning van drempel en profiel is een doorlopend, klein traject.

---

## Contracten — pacht én huur (v1.1 aangescherpt)

De contractmodule bestond al; in v1.1 telt **reguliere huur** even zwaar als pacht. Bij buitenplaatsen met weinig grond zit de omzet immers in de stenen (verhuur van opstallen, bv. aan zorgverleners). De velden `indexatie_type`, `indexatie_percentage`, `laatste_indexatie`, `volgende_indexatie` en `servicekosten` zijn aan `contract` toegevoegd (zie sectie 7.2).

**Signalering.** Een lichte achtergrondcheck (geplande functie) maakt tijdig een `taak`/`agenda_item` aan bij: einddatum nadert, `volgende_indexatie` valt deze maand, of een gekoppelde keuring/verzekering verloopt. Zo is "indexatie uitvoeren" of "huurcontract verlengen" nooit een vergeten klus.

---

## Projecten (uitbreiding) — NIEUW in v1.1

### 1. Het idee

Niet al het werk is onderhoud. Frederik denkt in **ontwikkelprojecten** met een status: een boerderij verbouwen, zorgwonen opzetten, een opstal herbestemmen, verduurzamen. Zo'n project leeft als een dossier met fase, budget, offertes, besluiten en documenten op één plek — en is in één oogopslag te volgen, ook voor mede-eigenaren (kijker-rol).

### 2. Datamodel

```sql
create table project (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  type text,                         -- 'verbouwing','herbestemming','zorgwonen','verduurzaming','overig'
  omschrijving text,
  fase text default 'idee'
    check (fase in ('idee','voorbereiding','vergunning','uitvoering','afgerond','gepauzeerd')),
  budget numeric,
  besteed numeric,
  startdatum date,
  streefdatum date,
  object_id uuid references object(id) on delete set null,
  perceel_id uuid references perceel(id) on delete set null,
  aangemaakt_op timestamptz default now()
);

create table project_besluit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  datum date default current_date,
  tekst text not null
);

-- taken en documenten aan een project koppelen
alter table taak     add column project_id uuid references project(id) on delete set null;
alter table document add column project_id uuid references project(id) on delete set null;
```

### 3. Row Level Security

```sql
alter table project         enable row level security;
alter table project_besluit enable row level security;

create policy "project zien" on project for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "project beheren" on project for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "project besluit zien" on project_besluit for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "project besluit beheren" on project_besluit for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### 4. Plek in de fasering

**Fase 3**, samen met beheerplan en onderhoud (deelt de taken-structuur). Kan ook eerder als losse module, want het hangt alleen van het fundament en de taken-tabel af.

---

## Meerjarenbeheerplan

### 1. Het idee

Een landgoed werkt met plannen over de lange termijn (parkbos dunnen, bruggen restaureren, stinzenplanten uitbreiden). De waarde van het platform is dat zo'n plan blijft leven: het valt uiteen in maatregelen met een jaartal, en zodra een jaar speelt, worden die maatregelen met één druk op de knop taken op het dashboard.

### 2. Hoe het past bij het eenvoud-principe

Het beheerplan is een **uitbreiding**. Een maatregel hoeft niet meteen een taak te worden — het plan mag jarenlang rustig bestaan; pas wanneer je zegt "maak hier taken van voor dit jaar" gebeurt er iets. Geen automatische stroom die het dashboard volstouwt, maar een bewuste stap.

### 3. Koppeling met andere modules

Percelen/natuurelementen (een plan hangt aan grond of bosvak), taken/agenda (maatregelen worden taken/agendapunten), onderhoud/MJOP (voor gebouwen is het MJOP feitelijk hetzelfde mechanisme — rood vs. groen), en subsidies (een maatregel kan subsidiabel zijn, bv. SNL-beheer).

> **MJOP gekoppeld aan een stamdatabase (overleg De Zeemeeuw).** Het MJOP (rood = gebouwen, groen = landschap) hangt aan een **stamdatabase van het landgoed** — paden, bosvakken, natuurtypes, gebouwen — een lichte **GIS-laag** (zie de kaart/PDOK-module). Voor een MVP volstaat een **rudimentaire opzet**: de eigenaar vult zelf de basisgegevens in (eventueel met AI-hulp uit foto's), de staat van onderhoud handmatig; de Claude API en/of externe bouwdatabases geven **indicatieve kosten en termijnen**. Later uit te bouwen met offerte-toetsing en scenarioplanning ("dit jaar bruggen of toch schilderwerk").
>
> **De brug naar financieel: voorzieningen.** Een MJOP-maatregel met kostenraming en termijn levert de **jaarlijkse voorziening** voor de financiële module (transactiebasis i.p.v. kasbasis). Zo voedt het MJOP automatisch de regel "gebudgetteerd vs. werkelijk groot onderhoud" en de cashflowprognose. Dit is de concrete koppeling tussen onderhoud en het financiële dashboard.

### 4. Datamodel

```sql
-- BEHEERPLAN
create table beheerplan (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  type text,                         -- 'groen' (natuur/bos) of 'rood' (gebouwen/MJOP)
  beschrijving text,
  doelen text,
  startjaar int,
  eindjaar int,
  perceel_id uuid references perceel(id) on delete set null,
  object_id uuid references object(id) on delete set null,
  aangemaakt_op timestamptz default now()
);

-- MAATREGEL
create table beheermaatregel (
  id uuid primary key default gen_random_uuid(),
  beheerplan_id uuid not null references beheerplan(id) on delete cascade,
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  omschrijving text not null,
  jaar int,
  geschatte_kosten numeric,
  subsidie_id uuid references subsidie(id) on delete set null,
  status text default 'gepland'
    check (status in ('gepland','omgezet_in_taak','afgerond')),
  taak_id uuid references taak(id) on delete set null,
  notitie text
);

alter table taak add column beheermaatregel_id uuid references beheermaatregel(id) on delete set null;
```

### 5. Row Level Security

```sql
alter table beheerplan      enable row level security;
alter table beheermaatregel enable row level security;

create policy "beheerplan zien" on beheerplan for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "beheerplan beheren" on beheerplan for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "maatregel zien" on beheermaatregel for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "maatregel beheren" on beheermaatregel for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### 6. De AI-laag helpt hier sterk

Plan opstellen uit een visiedocument; maatregelen voorstellen op basis van type perceel en doelen; een leesbare jaarrapportage voor eigenaar/bestuur maken.

### 7. Plek in de fasering

**Fase 3**, samen met onderhoud/MJOP en natuur & bos — die delen exact dezelfde plan-en-maatregel-structuur.

---

## Vergaderingen (basis in v1.1)

### 1. Wat de gebruiker doet

Op het dashboard kiest de gebruiker **Vergadering starten**, geeft een titel en deelnemers op, en drukt op opnemen. Na stoppen wordt de audio opgeslagen en automatisch getranscribeerd (met sprekeronderscheid). De gebruiker koppelt de herkende sprekers aan echte deelnemers; de AI maakt notulen (samenvatting, besluiten, actiepunten). De actiepunten worden taken. Alles blijft binnen het landgoed.

> **v1.1:** vergaderingen is een **basismodule** geworden. Technisch is het de enige basismodule met een externe transcriptie-afhankelijkheid; bouw dit onderdeel als laatste binnen Fase 1 (zie risico-tabel in Deel IV).

### 2. De technische route

- **Opnemen:** MediaRecorder-API van de browser. Op mobiel (iPhone) het audioformaat zorgvuldig kiezen — testen in de bouwfase.
- **Opslaan:** Supabase Storage, aparte map per landgoed.
- **Transcriptie:** externe dienst, verwisselbaar achter één interface. Aanbevolen AssemblyAI (speaker diarization); alternatief en goedkoper Whisper (geen diarization).
- **Notulen:** Claude API uit het transcript (samenvatting, besluiten, actiepunten met verantwoordelijke en deadline).
- **Wegschrijven:** actiepunten als rijen in `taak`, gekoppeld aan de deelnemer.

### 3. Privacy en AVG

Toegang via RLS (alleen leden); verwerkersafspraak met de transcriptiedienst (geen modeltraining op de audio); een duidelijke "opname loopt"-melding bij start. Dit is meteen een verkoopargument richting privacybewuste eigenaren.

### 4. Datamodel

```sql
create table vergadering (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  datum date not null default current_date,
  audio_pad text,
  transcript text,
  notulen text,
  samenvatting text,
  status text default 'opgenomen'
    check (status in ('opgenomen','getranscribeerd','verwerkt')),
  aangemaakt_door uuid references profiel(id),
  aangemaakt_op timestamptz default now()
);

create table vergadering_deelnemer (
  id uuid primary key default gen_random_uuid(),
  vergadering_id uuid not null references vergadering(id) on delete cascade,
  gebruiker_id uuid references profiel(id),
  externe_naam text,
  spreker_label text
);

create table vergadering_besluit (
  id uuid primary key default gen_random_uuid(),
  vergadering_id uuid not null references vergadering(id) on delete cascade,
  tekst text not null
);

alter table taak add column vergadering_id uuid references vergadering(id) on delete set null;
```

### 5. Row Level Security

```sql
alter table vergadering            enable row level security;
alter table vergadering_deelnemer  enable row level security;
alter table vergadering_besluit    enable row level security;

create policy "vergadering zien" on vergadering for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "vergadering beheren" on vergadering for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "deelnemer zien" on vergadering_deelnemer for select
  using (exists (select 1 from vergadering v where v.id = vergadering_id
                 and (is_lid_van(v.landgoed_id) or is_admin())));
create policy "deelnemer beheren" on vergadering_deelnemer for all
  using (exists (select 1 from vergadering v where v.id = vergadering_id
                 and (rol_op(v.landgoed_id) in ('eigenaar','rentmeester') or is_admin())))
  with check (exists (select 1 from vergadering v where v.id = vergadering_id
                 and (rol_op(v.landgoed_id) in ('eigenaar','rentmeester') or is_admin())));

create policy "besluit zien" on vergadering_besluit for select
  using (exists (select 1 from vergadering v where v.id = vergadering_id
                 and (is_lid_van(v.landgoed_id) or is_admin())));
create policy "besluit beheren" on vergadering_besluit for all
  using (exists (select 1 from vergadering v where v.id = vergadering_id
                 and (rol_op(v.landgoed_id) in ('eigenaar','rentmeester') or is_admin())))
  with check (exists (select 1 from vergadering v where v.id = vergadering_id
                 and (rol_op(v.landgoed_id) in ('eigenaar','rentmeester') or is_admin())));
```

**Opslag-beveiliging (Supabase Storage):** een aparte bucket `vergaderingen`, audio alleen toegankelijk voor leden van het landgoed. Pad `{landgoed_id}/{vergadering_id}.webm`, zodat de toegangsregel op het eerste mapdeel controleert.

### 6. Plek in de fasering

**Fase 1** (basismodule), maar als laatste onderdeel van die fase vanwege de externe transcriptie-afhankelijkheid. Deelt opslag- en AI-bouwstenen met de documenten-module.

---

## Contractvoorbereiding-keten (AI) — NIEUW in v1.1

### 1. Het idee

Frederiks pachtverhaal is bijna letterlijk een use case: een gesprek opnemen, afspraken vastleggen, en de volgende dag een conceptcontract met (bijvoorbeeld) natuurinclusieve voorwaarden — daarna een jurist die meekijkt. Dat is de **vergader/transcriptie-module + document-drafting + review in één keten**: *gesprek → conceptcontract → reviewverzoek → versiebeheer*.

### 2. De technische route

1. **Bron:** een vergadering (transcript) of vrije invoer.
2. **Concept genereren:** de Claude API stelt op basis van het transcript/punten een conceptcontract op, opgeslagen als `document` met `status = 'concept'`.
3. **Versiebeheer:** elke nieuwe versie is een rij in `document_versie`, gekoppeld aan het document.
4. **Reviewverzoek:** een `review_verzoek` aan een interne reviewer (rol) of een extern contact (jurist/rentmeester uit `relatie`). Extern gaat via de bestaande mailto-flow; intern via een notificatie.
5. **Afronden:** na akkoord wordt de versie `definitief`.

### 3. Datamodel

```sql
-- DOCUMENT uitbreiden met status t.b.v. de keten
alter table document add column status text default 'definitief'
  check (status in ('concept','in_review','definitief'));

-- VERSIES van een document
create table document_versie (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document(id) on delete cascade,
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  versienummer int not null,
  bestand_pad text,
  inhoud text,                       -- bij door-AI-gegenereerde tekst
  opmerking text,
  aangemaakt_door uuid references profiel(id),
  aangemaakt_op timestamptz default now()
);

-- REVIEWVERZOEK
create table review_verzoek (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document(id) on delete cascade,
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  reviewer_profiel_id uuid references profiel(id),   -- interne reviewer
  reviewer_contact_id uuid references relatie(id),   -- of externe (jurist)
  status text default 'open' check (status in ('open','beoordeeld','akkoord','afgewezen')),
  opmerking text,
  aangevraagd_op timestamptz default now(),
  beantwoord_op timestamptz
);
```

### 4. Row Level Security

```sql
alter table document_versie enable row level security;
alter table review_verzoek  enable row level security;

create policy "doc versie zien" on document_versie for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "doc versie beheren" on document_versie for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "review zien" on review_verzoek for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "review beheren" on review_verzoek for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### 5. Plek in de fasering

**Fase 4** (slimmere AI). Bouwt voort op de documenten-module (Fase 3) en de vergadermodule (Fase 1). De externe-review-stap hergebruikt de mailto-flow uit Contacten & communicatie.

---

## Documentmodule (visievorming) — NIEUW in v1.2

### 1. Het idee

De Documentmodule is een aparte werkplaats waarin de gebruiker samen met de AI een document opstelt: een visie, beheervisie, projectplan of onderbouwing richting overheid. Het verschil met de contractvoorbereiding-keten is de **bron en de aard**: contractvoorbereiding vertrekt vanuit één gesprek en levert een juridisch document; de Documentmodule **synthetiseert uit meerdere bronnen tegelijk** en levert een beleids-/visiedocument. Het is de bovenste trede van de AI-laag: niet samenvatten of matchen, maar iets nieuws opstellen uit alles wat het platform over dit landgoed weet.

De vier bronnen die de AI combineert:

1. **Vergaderingen** — transcripties en notulen (de `vergadering`/`transcript`-tabellen uit de vergadermodule): wat speelt er in het bestuur, welke ideeën en richtingen zijn besproken.
2. **Eerder geüploade documenten** — visiestukken, contracten, beheerplannen (de `document`-tabel met hun AI-samenvattingen).
3. **Nationale wetgeving** — documenten met `scope = 'nationaal'`: wetgeving, regelingen, kaders.
4. **Lokale verordeningen en gebiedsregels** — per landgoed gekoppelde regelgeving (gemeentelijke verordeningen, bestemmings-/omgevingsplan, Natura 2000-aanwijzing), opgeslagen als landgoed-documenten of als omgevingsberichten.

De gebruiker geeft een richting ("we willen het parkbos natuurinclusiever maken, denken aan een voedselbos op het achterste perceel"), de AI stelt een eerste concept op dat die richting verbindt met de vier bronnen, en daarna werk je het samen iteratief uit. Het eindproduct is een doordacht concept voor de bestuursvergadering — en de natuurlijke opmaat naar het expert-spoor (volgende sectie).

### 2. De technische route

1. **Onderwerp & richting:** de gebruiker start een nieuw document, kiest een type (visie, beheervisie, projectplan, onderbouwing) en geeft een vrije richting/prompt.
2. **Context verzamelen (server-side):** een serverroute haalt de relevante bronnen op — recente notulen, de samenvattingen van gekoppelde documenten, de nationale kaders bij dit type, en de lokale regelgeving van dit landgoed. Dit is in v1.2 bewust **eenvoudig**: selecteren op landgoed + type + recentheid, plus de bestaande AI-samenvattingen. Geen vector-zoekmachine (zie kennisbank-document voor de afweging en het latere groeipad).
3. **Concept genereren:** de Claude API stelt een conceptdocument op uit richting + context. Opgeslagen als `document` met `status = 'concept'` en `type = 'visie'` (of het gekozen type).
4. **Iteratief verfijnen:** elke ronde is een nieuwe `document_versie` (hergebruik van de bestaande tabel uit de contractvoorbereiding-keten). De gebruiker stuurt bij ("meer nadruk op financiering via woningbouw"), de AI levert een nieuwe versie.
5. **Afronden of doorzetten:** het concept kan `definitief` worden, of — vaker — leiden tot een **expert-verzoek** (volgende sectie).

### 3. Datamodel

De module hergebruikt `document` en `document_versie` uit de contractvoorbereiding-keten en voegt alleen een lichte tabel toe die vastlegt welke bronnen in een concept zijn meegenomen (transparantie: de gebruiker en de expert kunnen zien waarop het concept is gebaseerd).

```sql
-- DOCUMENT: statuswaarden en typen verbreden voor visievorming
-- (status bestaat al uit de contractketen; type toevoegen)
alter table document add column doc_type text default 'overig'
  check (doc_type in ('overig','contract','visie','beheervisie','projectplan','onderbouwing'));

-- BRONGEBRUIK: welke bronnen voedden een concept (transparantie + reproduceerbaarheid)
create table document_bron (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document(id) on delete cascade,
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  bron_type text not null
    check (bron_type in ('vergadering','document','nationaal','verordening','vrije_invoer')),
  bron_id uuid,                       -- verwijzing naar vergadering/document (indien van toepassing)
  bron_omschrijving text,             -- leesbare bronvermelding voor de gebruiker
  aangemaakt_op timestamptz default now()
);

alter table document_bron enable row level security;
create policy "document_bron zien" on document_bron for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "document_bron beheren" on document_bron for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

> Bewust géén nieuwe opslagmachinerie. Een visiedocument is gewoon een `document` met een ander `doc_type`; de versies lopen via `document_versie`; de herkomst via `document_bron`. Zo blijft de module licht en valt hij volledig binnen het bestaande RLS-patroon.

### 4. De context-opbouw (server-side)

De kern van de module is de serverroute die de context samenstelt. Pseudocode:

```
functie bouwContext(landgoed_id, doc_type, richting):
    notulen   = recente transcripties/notulen van dit landgoed (laatste N)
    documenten= samenvattingen van landgoed-documenten, gefilterd op relevantie voor doc_type
    nationaal = nationale documenten (scope='nationaal') passend bij doc_type
    lokaal    = landgoed-documenten met doc_type 'verordening'/'onderbouwing' + omgevingsberichten
    return samengevoegde, ingekorte context (token-budget bewaken)
```

De samenvattingen (niet de volledige documenten) gaan de prompt in — dat houdt het token-budget laag en is precies waarom de bestaande AI-samenvattingen zo waardevol zijn. Elke meegenomen bron wordt als `document_bron`-rij vastgelegd, zodat het concept een herleidbare bronvermelding krijgt.

### 5. Claude Code-prompt (Documentmodule)

> Bouw een **Documentmodule** voor de landgoedbeheer-app (Next.js + Supabase), als aparte menu-ingang `/landgoed/[id]/documenten/opstellen`. De gebruiker kiest een documenttype (visie, beheervisie, projectplan, onderbouwing) en geeft een vrije richting/prompt.
>
> Bouw een serverroute die context samenstelt uit vier bronnen van dit landgoed: (1) recente notulen/transcripties, (2) samenvattingen van landgoed-documenten, (3) nationale documenten (`scope='nationaal'`) passend bij het type, (4) lokale verordeningen/onderbouwingen en omgevingsberichten. Gebruik de bestaande AI-samenvattingen (niet de volledige bestanden) en bewaak het token-budget. Stuur richting + context naar de Claude API en sla het resultaat op als `document` met `status='concept'` en het gekozen `doc_type`. Leg elke meegenomen bron vast in `document_bron`.
>
> Toon het concept met een bronnenlijst eronder ("dit concept is gebaseerd op: …"). Laat de gebruiker iteratief bijsturen; elke ronde is een nieuwe `document_versie`. Bied twee vervolgacties: **Vastleggen als definitief** en **Expert inschakelen** (zie expert-spoor). Nederlandse interface, bestaande stijl (#1B3A28). Vertrouw op RLS.

### 6. Plek in de fasering

**Fase 4** (verdieping & visievorming), samen met het expert-spoor. Bouwt voort op documenten (Fase 1/3), vergaderingen (Fase 1) en de contractvoorbereiding-keten (Fase 4). Staat op uitbreidingsniveau in `module_instelling` (`documentmodule`, `niveau='uitbreiding'`).

### 7. De intake-laag — documentmakers als data (v1.3)

De kwaliteit van een concept staat of valt met de input van de eigenaar. Te weinig vragen → de AI vult gaten met aannames en het document voelt generiek. Te veel vragen → het botst met het eenvoud-principe en de eigenaar haakt af. De gekozen aanpak lost dit op met **een handvol documentmakers**: per veelvoorkomend documenttype een vaste, zorgvuldig opgestelde set vragen in gewone taal. We beginnen klein (vier makers) en breiden uit naarmate klantvraag groeit. De vragen die we zo per type leren kennen, worden later de bouwstenen voor een dynamischer, AI-gestuurd intake-mechanisme — klein beginnen is hier de weg naar het slimme systeem, geen afslag ervan.

**Drie ontwerpkeuzes (vastgelegd):**

1. **Alles vooraf, dan pas het concept.** De eigenaar krijgt het hele intakeformulier in één keer te zien, vult het in eigen tempo in (kan tussendoor iets opzoeken), en pas daarna genereert de AI het concept. Geen gesprek-achtige flow — eenvoudiger te bouwen en transparanter voor de zelfservice-gebruiker.
2. **Liever een gat dan een aanname.** Bij een overgeslagen of mager antwoord verzint de AI niets. In plaats daarvan markeert hij in het concept zichtbaar wat ontbreekt: *"[Hier ontbreekt informatie over … — vul aan of schakel een expert in]."* Elk gat is tegelijk een eerlijke wegwijzer én een natuurlijke aanleiding voor het expert-spoor.
3. **Zelfservice door de eigenaar.** De vragen moeten in gewone taal kunnen, zonder rentmeester-jargon, beantwoordbaar zonder dat wij ernaast zitten.

**Documentmaker = data, geen code.** Een documentmaker is geen geprogrammeerd scherm maar een rij in een tabel: een type, een set vragen, een documentstructuur en een AI-instructie. Een nieuwe maker toevoegen = een record invullen. Dat is precies de schaalbaarheid die we willen.

```sql
-- DOCUMENTMAKER: een sjabloon voor één documenttype (nationaal beheerd door admin)
create table documentmaker (
  id uuid primary key default gen_random_uuid(),
  sleutel text unique not null,          -- bv. 'beheervisie','overheidsonderbouwing',
                                         --     'projectplan','subsidie_onderbouwing'
  titel text not null,                   -- leesbare naam in de UI
  omschrijving text,                     -- "Wat levert dit document je op?"
  doc_type text not null,                -- koppelt aan document.doc_type
  structuur jsonb not null,              -- lijst van secties/kopjes van het eindproduct
  ai_instructie text not null,           -- systeeminstructie voor de generatie
  actief boolean default true,
  volgorde int default 0,
  aangemaakt_op timestamptz default now()
);

-- VRAGEN bij een documentmaker (gewone taal, met brondekking)
create table documentmaker_vraag (
  id uuid primary key default gen_random_uuid(),
  documentmaker_id uuid not null references documentmaker(id) on delete cascade,
  volgorde int not null,
  vraag text not null,                   -- in gewone taal
  toelichting text,                      -- optionele hint onder de vraag
  antwoordtype text not null default 'tekst'
    check (antwoordtype in ('tekst','lange_tekst','keuze','ja_nee','getal','datum')),
  keuze_opties text[],                   -- bij antwoordtype 'keuze'
  verplicht boolean default false,       -- maar: nooit een aanname als leeg (zie principe 2)
  -- brondekking: welke kennisbank-bron dit antwoord mogelijk al levert
  bron_hint text                         -- bv. 'percelen','contracten','gemeente_config','notulen'
);

-- ANTWOORDEN van een eigenaar voor een concreet document
create table document_intake_antwoord (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document(id) on delete cascade,
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  vraag_id uuid not null references documentmaker_vraag(id),
  antwoord text,                         -- leeg = gat (geen aanname)
  overgeslagen boolean default false,
  aangemaakt_op timestamptz default now()
);
```

**RLS.** `documentmaker` en `documentmaker_vraag` zijn nationaal (door ons als admin beheerd, door iedereen leesbaar — net als nationale documenten). `document_intake_antwoord` is landgoed-gebonden en volgt het standaardpatroon.

```sql
alter table documentmaker            enable row level security;
alter table documentmaker_vraag      enable row level security;
alter table document_intake_antwoord enable row level security;

-- Makers + vragen: iedereen leest, alleen admin beheert
create policy "maker zien" on documentmaker for select using (true);
create policy "maker beheren" on documentmaker for all using (is_admin()) with check (is_admin());
create policy "vraag zien" on documentmaker_vraag for select using (true);
create policy "vraag beheren" on documentmaker_vraag for all using (is_admin()) with check (is_admin());

-- Antwoorden: landgoed-gebonden
create policy "intake zien" on document_intake_antwoord for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "intake beheren" on document_intake_antwoord for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### 8. De aangepaste route met intake

De technische route uit sectie 2 wordt met de intake-laag:

1. **Documentmaker kiezen.** De eigenaar kiest uit de actieve makers (bv. "Beheervisie opstellen"). De UI toont de omschrijving: wat levert dit op?
2. **Brondekking vooraf (server-side).** Voor elke vraag met een `bron_hint` kijkt de server of het antwoord al uit de kennisbank te halen is (percelen, contracten, gemeente uit `landgoed_config`, recente notulen). Is dat zo, dan wordt de vraag vóór-ingevuld of overgeslagen. Zo krimpt het formulier tot wat alleen de eigenaar weet.
3. **Intakeformulier invullen.** De eigenaar krijgt de resterende vragen in één keer (principe 1), beantwoordt in eigen tempo, mag overslaan.
4. **Concept genereren.** Antwoorden + kennisbank-context + de `structuur` en `ai_instructie` van de maker gaan naar de Claude API. Lege/overgeslagen antwoorden worden als expliciet gat in het concept gemarkeerd (principe 2), nooit als aanname ingevuld.
5. **Verfijnen / afronden / expert.** Zoals eerder: `document_versie` per ronde, en de gaten zijn natuurlijke aanknopingspunten voor een `expert_verzoek`.

> **De intake is de vijfde bron.** De Documentmodule putte al uit vier bronnen (vergaderingen, documenten, nationale wetgeving, lokale verordeningen). De intake-antwoorden zijn simpelweg de vijfde — gerichte input die de gaten vult die de andere vier niet dekken. Architectonisch verandert er weinig; er komt één bron bij.

### 9. Claude Code-prompt (intake-laag)

> Breid de Documentmodule uit met een **intake-laag op basis van documentmakers**. De database heeft `documentmaker`, `documentmaker_vraag` en `document_intake_antwoord` (al aangemaakt, met vier startmakers gevuld).
>
> Bouw: (1) een **keuzescherm** met de actieve documentmakers (titel + omschrijving). (2) Een **brondekking-stap** (server-side) die per vraag met een `bron_hint` controleert of het antwoord al uit de kennisbank komt (percelen, contracten, `landgoed_config`, recente notulen) en de vraag dan vóór-invult of overslaat. (3) Een **intakeformulier** dat de resterende vragen in één keer toont (gewone taal, juiste invoertypes), in eigen tempo invulbaar, met overslaan toegestaan; antwoorden in `document_intake_antwoord`. (4) **Conceptgeneratie**: stuur antwoorden + kennisbank-context + de `structuur` en `ai_instructie` van de maker naar de Claude API. **Belangrijk:** vul lege of overgeslagen antwoorden NOOIT met aannames; markeer ze in het concept zichtbaar als ontbrekende informatie met een korte aanwijzing ("vul aan of schakel een expert in").
>
> Toon onder het concept de bronnenlijst én de openstaande gaten als nette lijst, elk met een knop "Expert inschakelen". Nederlandse interface, gewone taal zonder jargon, bestaande stijl. Vertrouw op RLS.

### 10. De vier startmakers

We beginnen met vier documentmakers die samen het hele waardeverhaal dekken — richting, drempel wegnemen, uitvoeren, verdienen — en die elk uit andere delen van de kennisbank putten. De volledige vraagsets in gewone taal staan in een apart werkdocument (*Documentmakers — vragen & structuur*); hieronder de kern.

| Maker | `sleutel` | Wat het oplost | Put vooral uit |
|---|---|---|---|
| **Beheervisie** | `beheervisie` | "Waar willen we over 5–10 jaar staan?" — voedt bestuur, subsidie, opmaat expert. | notulen, eerdere visiestukken, percelen |
| **Onderbouwing richting overheid** | `overheidsonderbouwing` | Plan/vergunning/gebiedsproces richting gemeente of provincie. | lokale verordeningen, omgevingsplan, percelen |
| **Projectplan ontwikkeling** | `projectplan` | Zorgwonen, herbestemming, voedselbos — fasering + financiering. | projecten-module, contracten, objecten |
| **Onderbouwing subsidie/verdienkans** | `subsidie_onderbouwing` | ANLb, carbon, natuurinclusieve diensten verzilveren. | subsidieradar, percelen, beheerplan |

Elke maker krijgt 5–10 vragen in gewone taal, elk met een `bron_hint` zodat de kennisbank zoveel mogelijk vóór-invult. Naarmate er klanten met nieuwe wensen komen, voegen we makers toe — telkens één rij in `documentmaker` plus de bijbehorende vragen.

### 11. Plek in de fasering (intake-laag)

De documentmakers en de intake-laag horen bij **Fase 4**, samen met de Documentmodule zelf. Het is verstandig de vier startmakers vroeg in Fase 4 inhoudelijk uit te werken (de vragen scherpkrijgen op echte landgoed-cases, te beginnen met Ter Hooge) vóór de bredere, dynamische intake ooit wordt overwogen.

---

## Expert-spoor — NIEUW in v1.2

### 1. Het idee

Het expert-spoor is het verdienmechanisme: op het moment dat een concept (uit de Documentmodule, een project of een contract) de expertise van een echte specialist vraagt, schakelt de gebruiker met één handeling een expert uit ons netwerk in. Het generaliseert het `review_verzoek` uit de contractvoorbereiding-keten: waar dat verzoek een *interne of externe reviewer* aanspreekt, richt het expert-verzoek zich op **ons** (De Nieuwe Rentmeesters), die het beoordelen en doorzetten naar de juiste expert.

Belangrijk: de expert zit **niet** als gebruiker in het landgoed. Het verzoek komt bij ons (admin) binnen; wij koppelen er een expert aan en regelen het contact. Zo houden we de regie over kwaliteit en vertrouwensband, en hoeft een externe expert niet in de afgeschermde landgoed-omgeving.

### 2. De technische route

1. **Aanleiding:** vanuit een document (concept-visie), project of contract klikt de gebruiker "Expert inschakelen", kiest een expertisegebied (rentmeesterschap, juridisch, ecologie, fiscaal, bouwkundig) en geeft een korte toelichting.
2. **Verzoek vastleggen:** een `expert_verzoek`-rij met verwijzing naar het bron-object (document/project/contract) en het gekozen gebied. Status `nieuw`.
3. **Bij ons in beeld:** het verzoek verschijnt in het **admin-controlepaneel** (Deel V) als actiepunt — wij zien wie, welk landgoed, welk gebied, en het bijbehorende concept.
4. **Matchen & doorzetten:** wij koppelen een expert (uit een `expert`-register) en zetten het contact op. De expert krijgt — buiten het platform, of via een beperkte gedeelde weergave — het concept als startpunt.
5. **Afronden:** status naar `gekoppeld` → `afgerond`. Het logboek (`handeling_log`, Deel V) houdt bij dat wij namens het landgoed hebben bemiddeld.

### 3. Datamodel

```sql
-- EXPERT-REGISTER (ons eigen netwerk; nationaal, niet landgoed-gebonden)
create table expert (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  gebied text not null,               -- 'rentmeester','juridisch','ecologie','fiscaal','bouwkundig'
  organisatie text,
  contact text,
  actief boolean default true,
  notitie text,
  aangemaakt_op timestamptz default now()
);

-- EXPERT-VERZOEK (van een landgoed naar ons)
create table expert_verzoek (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  aanvrager_id uuid references profiel(id),
  gebied text not null,
  toelichting text,
  -- bron-object (één ervan ingevuld)
  document_id uuid references document(id) on delete set null,
  project_id uuid references project(id) on delete set null,
  contract_id uuid references contract(id) on delete set null,
  status text not null default 'nieuw'
    check (status in ('nieuw','in_behandeling','gekoppeld','afgerond','geannuleerd')),
  gekoppelde_expert_id uuid references expert(id),
  aangemaakt_op timestamptz default now(),
  bijgewerkt_op timestamptz default now()
);
```

### 4. Row Level Security

Het expert-register is nationaal en alleen door ons (admin) te beheren; leden mogen het niet zien (het is onze bedrijfsvoering). Het expert-verzoek hoort bij het landgoed: leden zien hun eigen verzoeken, wij zien alles.

```sql
alter table expert         enable row level security;
alter table expert_verzoek enable row level security;

-- Expert-register: alleen admin
create policy "expert beheren" on expert for all
  using (is_admin()) with check (is_admin());

-- Expert-verzoek: leden van het landgoed zien/maken hun verzoeken; admin ziet alles
create policy "expert_verzoek zien" on expert_verzoek for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "expert_verzoek aanmaken" on expert_verzoek for insert
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
-- Status/koppeling bijwerken: alleen admin (wij regelen de matching)
create policy "expert_verzoek bijwerken" on expert_verzoek for update
  using (is_admin()) with check (is_admin());
```

> Let op de bewuste asymmetrie: de gebruiker mag een verzoek **aanmaken** maar niet de koppeling/status wijzigen — dat doen wij. Zo blijft de bemiddeling bij ons, wat past bij het verdienmodel en de kwaliteitsborging.

### 5. Plek in het admin-controlepaneel

Het admin-controlepaneel (Deel V, sectie 7) krijgt er een rubriek bij: **openstaande expert-verzoeken** over alle landgoederen, met gebied, bron-concept en aanvraagdatum. Dit is letterlijk waar het verdienmodel zichtbaar wordt — de werkvoorraad aan inschakelingen. Een verzoek koppelen aan een expert en de status bijwerken gebeurt hier.

### 6. Claude Code-prompt (expert-spoor)

> Breid de landgoedbeheer-app uit met een **expert-spoor**. De database heeft `expert` (ons netwerk-register, alleen admin) en `expert_verzoek` (van landgoed naar ons) al.
>
> Bouw: (1) een knop **"Expert inschakelen"** op document-, project- en contractdetailschermen, die een `expert_verzoek` aanmaakt met het gekozen expertisegebied, een toelichting en een verwijzing naar het bron-object. Toon de gebruiker een nette bevestiging ("we nemen contact op"). (2) In het **admin-controlepaneel** een rubriek **expert-verzoeken** over alle landgoederen: lijst met gebied, landgoed, bron-concept, datum en status; een detailscherm om een expert uit het register te koppelen en de status bij te werken. Schrijf de bemiddeling weg in `handeling_log` met `namens=true`.
>
> De gebruiker kan een verzoek aanmaken maar niet de status/koppeling wijzigen (RLS regelt dit; toon die acties alleen aan admin). Nederlandse interface, bestaande stijl. Vertrouw op RLS.

### 7. Plek in de fasering

**Fase 4**, direct na/naast de Documentmodule — samen vormen ze de "van concept naar expert"-keten. Het register (`expert`) en de admin-rubriek kunnen al eerder klaarstaan; de inschakel-knoppen verschijnen zodra documenten/projecten/contracten bestaan.

---

## Extra modules (incidenten, natuur & bos, werkorders, wagenpark, financiële diepte)

Hieronder alleen wat nog niet elders zat. De rest (dashboard, taken, kaart, documenten, pacht/huur, AI-assistent, rapportages, mobiele toegang) is al gedekt.

### Incidenten melden (basis in v1.1 — ook waardevol voor klein)

Je loopt over je land, ziet iets (omgevallen boom, kapot hek, wateroverlast), en maakt op je telefoon een melding met foto en locatie. De melding kan een taak worden. Bewust simpel: foto + locatie + korte tekst. Wie het uitgebreider wil, zet er een werkorder van (pro).

```sql
create table incident (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  titel text not null,
  omschrijving text,
  foto_pad text,
  locatie jsonb,                     -- punt op de kaart (GeoJSON)
  status text default 'gemeld' check (status in ('gemeld','opgepakt','afgehandeld')),
  taak_id uuid references taak(id) on delete set null,
  gemeld_door uuid references profiel(id),
  aangemaakt_op timestamptz default now()
);

alter table incident enable row level security;
create policy "incident zien" on incident for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "incident melden" on incident for insert
  with check (is_lid_van(landgoed_id) or is_admin());
create policy "incident beheren" on incident for update
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

> **v1.1:** incidenten is een basismodule (Fase 1). De foto's gaan naar Supabase Storage; de melding is een lichte web-flow die ook op de telefoon werkt — geen aparte app nodig.

### Natuur & bosbeheer (uitbreiding — MJOP-Groen)

De groene tegenhanger van het gebouwenonderhoud. Registreert bosvakken/natuurelementen, beheer per vak, en koppelt aan percelen en subsidies (SNL, ANLb).

```sql
create table natuur_element (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  perceel_id uuid references perceel(id) on delete set null,
  naam text not null,
  type text,                         -- parkbos, productiebos, houtwal, water...
  boomsoorten text,
  leeftijdsklasse text,
  beheermaatregel text,
  planning text,
  seizoensbeperking text,
  herplantplicht text,
  beschermingsstatus text,           -- Natura 2000, NNN
  notitie text
);

create table biodiversiteit_waarneming (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  natuur_element_id uuid references natuur_element(id) on delete set null,
  soort text not null,
  datum date default current_date,
  aantal text,
  notitie text
);

alter table natuur_element            enable row level security;
alter table biodiversiteit_waarneming enable row level security;

create policy "natuur zien" on natuur_element for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "natuur beheren" on natuur_element for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());

create policy "waarneming zien" on biodiversiteit_waarneming for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "waarneming beheren" on biodiversiteit_waarneming for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### Werkorders met urenregistratie (pro)

Voor landgoederen met personeel (profiel C/D). De operationele laag onder taken: uitvoerder, uren, foto's voor/na, status-workflow (gepland → in uitvoering → gereed → gecontroleerd).

```sql
create table werkorder (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  taak_id uuid references taak(id) on delete set null,
  titel text not null,
  uitvoerder uuid references profiel(id),
  contact_id uuid references relatie(id),
  status text default 'gepland'
    check (status in ('gepland','in_uitvoering','gereed','gecontroleerd')),
  uren numeric,
  materiaal text,
  foto_voor_pad text,
  foto_na_pad text,
  kosten numeric,
  aangemaakt_op timestamptz default now()
);

alter table werkorder enable row level security;
create policy "werkorder zien" on werkorder for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "werkorder beheren" on werkorder for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### Wagenpark en machines (pro)

Voor eigen materieel (tractoren, bosbouwmachines): onderhoud, keuringen, brandstof, storingen.

```sql
create table machine (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  naam text not null,
  type text,
  bouwjaar int,
  laatste_keuring date,
  volgende_keuring date,
  status text,
  notitie text
);

alter table machine enable row level security;
create policy "machine zien" on machine for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "machine beheren" on machine for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

### Financiële diepte: rendement per perceel/activiteit (pro)

De **diepe** financiële laag (te onderscheiden van het lichte financiële inzicht in de basis): rendement per perceel en per activiteit — wat kost het bos, wat levert de jacht op, wat brengt de pacht binnen. Dit hangt aan de bestaande contracten (opbrengsten), werkorders (kosten) en de in v1.1 toegevoegde `transactie`-tabel, dus het ontstaat grotendeels vanzelf zodra die gevuld zijn. Hoort thuis in **Fase 5 (pro)**.

### Wat bewust NIET als aparte module komt

- **Mobiele app als apart product** — niet nodig; de webapp werkt op de telefoon (incidenten, taken).
- **Weersverwachting-widget** — hooguit een klein dashboard-blokje later, geen module.
- **Aparte rapportage-module** — rapportages ontstaan uit bestaande data ("exporteer als PDF" bij een overzicht).
- **Volledige vergunningenstroom in de omgevingsradar** — bewust weggelaten om overload te voorkomen (zie Omgevingsradar).

Deze terughoudendheid is geen tekort — het is precies wat het systeem bruikbaar houdt.

---

## Kaart (PDOK): percelen en gebouwen

### 1. Waarom het tot nu toe niet lukte (en hoe het wél werkt)

**Valkuil 1 — het coördinatenstelsel.** PDOK levert standaard in het Nederlandse Rijksdriehoekstelsel (RD, EPSG:28992). Leaflet verwacht WGS84 (EPSG:4326). Niet omzetten → percelen landen in de oceaan of verschijnen niet. **Oplossing:** vraag de data expliciet op in EPSG:4326/CRS84 bij de OGC API.

**Valkuil 2 — de oude WFS-syntax.** Lange, cryptische filter-URL's, foutgevoelig. **Oplossing:** gebruik de nieuwe **OGC API Features**.

**De werkende route — OGC API Features.** Geen authenticatie, gratis, dagelijks bijgewerkt. Opvragen via een bounding box; antwoord als GeoJSON (direct in Leaflet met `L.geoJSON()`); max 1000 objecten per bevraging, met paginering. Landingspagina: `https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/`, percelen-collectie `.../collections/Perceel/items`. Voor gebouwen idem via de BAG.

**Oppervlakte-nuance:** de kadastrale kaart geeft een indicatie van de ligging; neem de PDOK-oppervlakte over als indicatie, met een apart veld om de officiële oppervlakte te overschrijven.

### 2. Datamodel — uitbreidingen

```sql
-- Perceel uitbreiden
alter table perceel add column geometrie jsonb;               -- GeoJSON van de grens
alter table perceel add column oppervlakte_pdok numeric;
alter table perceel add column oppervlakte_officieel numeric;
alter table perceel add column grondgebruik text;
alter table perceel add column beschermingsstatus text;
alter table perceel add column beheerpakket text;
alter table perceel add column erfdienstbaarheden text;
alter table perceel add column notitie text;
alter table perceel add column contract_id uuid references contract(id) on delete set null;

-- Object (gebouw) uitbreiden
alter table object add column geometrie jsonb;
alter table object add column bag_id text;
alter table object add column oppervlakte numeric;
alter table object add column functie text;                   -- bewoond, verhuurd, erfpacht...
alter table object add column conditie_nen2767 int;           -- 1 (uitstekend) - 6 (zeer slecht)
alter table object add column taxatiewaarde numeric;
alter table object add column verzekering text;
alter table object add column energielabel text;
alter table object add column notitie text;
alter table object add column contract_id uuid references contract(id) on delete set null;

-- Koppeling perceel <-> subsidie (meerdere subsidies per perceel)
create table perceel_subsidie (
  id uuid primary key default gen_random_uuid(),
  perceel_id uuid not null references perceel(id) on delete cascade,
  subsidie_id uuid not null references subsidie(id) on delete cascade,
  bedrag numeric,
  ingangsdatum date,
  einddatum date
);

alter table perceel_subsidie enable row level security;
create policy "perceel_subsidie zien" on perceel_subsidie for select
  using (exists (select 1 from perceel p where p.id = perceel_id
                 and (is_lid_van(p.landgoed_id) or is_admin())));
create policy "perceel_subsidie beheren" on perceel_subsidie for all
  using (exists (select 1 from perceel p where p.id = perceel_id
                 and (rol_op(p.landgoed_id) in ('eigenaar','rentmeester') or is_admin())))
  with check (exists (select 1 from perceel p where p.id = perceel_id
                 and (rol_op(p.landgoed_id) in ('eigenaar','rentmeester') or is_admin())));
```

### 3. Claude Code-prompt (kaartmodule) — kern

> Bouw een kaartmodule met Leaflet. Haal percelen op via de **OGC API Features** van de PDOK Kadastrale Kaart binnen de bounding box van de kaart, **in WGS84/CRS84** (cruciaal — anders landen percelen verkeerd). Teken met `L.geoJSON()`, debounce bij verschuiven/zoomen. Laat de gebruiker percelen aanklikken om ze aan het landgoed te koppelen (sla kadastraal nummer, geometrie, oppervlakte op). Gebouwen via de BAG-laag. Detailpanelen voor perceel (grondgebruik, beschermingsstatus, beheerpakket, pachtcontract, subsidies) en gebouw (functie, NEN 2767, monumentstatus, contract, verzekering, energielabel, MJOP-link). Bouw de PDOK-aanroepen in `lib/pdok.ts`. Nederlandse interface; vertrouw op RLS.

### 4. Testen — de cruciale controle

Koppel een perceel van Ter Hooge en controleer dat de getekende grens exact over het echte perceel op de luchtfoto ligt. Ligt het ernaast/in zee → coördinatentransformatie fout (valkuil 1).

### 5. Plek in de fasering

Percelen/gebouwen als **lijst** komen vroeg (Fase 2); de **kaartweergave via PDOK** wordt een afgebakende fase waarin het coördinaten- en PDOK-werk geïsoleerd wordt aangepakt (hoog technisch risico). Zo loopt de rest geen vertraging op.

---

# Deel IV — Technische risico's en fasering

## Inschatting van technische risico's

| Onderdeel | Risico | Toelichting |
|---|---|---|
| Kaart / PDOK | **Hoog** | Coördinatenstelsel (RD vs. WGS84) en veel bewegende delen. Geïsoleerd in Fase 2. |
| Transcriptie vergaderingen | **Middel** | Opnemen werkt; audio naar de transcriptiedienst en sprekers koppelen heeft losse eindjes, vooral op mobiel. Hoewel vergaderingen nu een basismodule is, bouw je dit deel als laatste binnen Fase 1. |
| Bankkoppeling / financieel inzicht (v1.1) | **Middel** | Bestandsimport (CSV/MT940) is laag risico en de aanbevolen start. Een live PSD2-aggregator (en de Moneybird/e-Boekhouden-API's) voegt OAuth, tokens en een verwerkersafspraak toe — middel, en daarom optioneel/later. |
| Omgevingsradar (v1.1) | **Laag–Middel** | Mail-ingestie (webhook) en RSS zijn standaardwerk; de kwaliteit zit in de AI-relevantiefilter en het profiel per landgoed — finetuning, geen blokkade. |
| Communicatie intern/extern | **Laag** | mailto (extern) en e-mailmelding (intern) zijn standaardwerk. Geschikt om vroeg te doen. |
| Fundament (database, login, RLS) | **Laag** | Bekend terrein, goed gedocumenteerd. |
| Beheerplan, contracten, projecten, documenten, incidenten | **Laag** | Standaard datawerk op het fundament. |

**Conclusie:** begin met fundament en de lichte, waardevolle basismodules (laag risico, hoge waarde), houd de transcriptie als laatste binnen Fase 1, en isoleer het kaartwerk in een eigen fase.

## De fasen technisch (v1.1)

| Fase | Technische inhoud |
|---|---|
| **0 — Fundament** | Supabase-project, database + RLS, Next.js op Vercel, Supabase-clients (browser/server/middleware), login, landgoed-overzicht, dashboard-skelet, admin-paneel, `module_instelling` met niveaus. |
| **1 — Communicatie & basis** | Gebruikersbeheer (uitnodigingen, wachtwoord-reset). Documenten (zonder opslag-zwaarte), taken, contacten (relatie-uitbreiding), `notificatie` + e-mailmelding, mailto-flow voor externe taken, contracten (pacht **én huur**, indexatie-signalering), subsidieradar (incl. carbon), **omgevingsradar** (mail/RSS-ingestie + AI-relevantiefilter), **licht financieel inzicht** (bestandsimport + optioneel Moneybird), **incidenten**, en **vergaderingen** (als laatste, vanwege transcriptie). |
| **2 — Percelen, gebouwen & kaart** | `perceel`/`object`-uitbreidingen + `perceel_subsidie` als lijst-CRUD eerst. Daarna Leaflet + PDOK OGC API Features in WGS84, percelen/gebouwen aanklikken en koppelen. |
| **3 — Beheerplan, onderhoud & projecten** | `beheerplan` + `beheermaatregel`, maatregel-naar-taak, onderhoud/MJOP, `natuur_element` + `biodiversiteit_waarneming`, **`project` + `project_besluit`**. |
| **4 — Verdieping & slimmere AI** | AI-laag uitbouwen, **contractvoorbereiding-keten** (`document_versie` + `review_verzoek`), **documentmodule/visievorming** (`document_bron`, synthese uit 4 bronnen), **expert-spoor** (`expert` + `expert_verzoek`, admin-bemiddeling), rapportage/export, verfijning omgevings- en financiële AI, carbon-/verdienkansen. |
| **5 — Pro & koppelingen** | `werkorder`, `machine`, **financiële diepte** (rendement per perceel/activiteit), e-mail (Vimex IMAP), bank-aggregator (PSD2) en zwaardere boekhoudkoppeling. |

---

# Deel V — Onboarding, beheer en koppelingen per landgoed

Dit deel beschrijft hoe een nieuw landgoed van "leeg" naar "werkend dashboard" komt, hoe wij (De Nieuwe Rentmeesters) daar centraal grip op houden, en hoe externe bronnen — e-mail, boekhouding, bank, lokale info — veilig per landgoed worden gekoppeld. Het bouwt voort op het fundament (Deel I) en het niveau-mechanisme (Deel II); er komt geen nieuwe infrastructuur bij, alleen een nieuwe configuratie- en beheerlaag bovenop de bestaande tabellen.

## 1. Het uitgangspunt: zelf inrichten kan, samen inrichten ook

Twee dingen moeten tegelijk waar zijn. Een landgoedeigenaar die het zelf wil doen, moet zijn landgoed volledig zelfstandig kunnen inrichten. En een eigenaar die vastloopt of het liever uitbesteedt, moet door ons geholpen kunnen worden — reactief (als hij vastloopt) én proactief (als wij dingen voor hem regelen). Dat is de "rentmeester light / PA"-gedachte uit het businessplan, vertaald naar techniek.

Daaruit volgen drie ontwerpkeuzes die dit deel uitwerkt:

- **Onboarding is een gedeelde wizard.** Elke stap kan door de eigenaar óf door ons worden gezet. Het systeem houdt bij wat al gedaan is en wat nog mist, zodat overdracht naadloos is.
- **Wij hebben een centraal controlepaneel** over alle landgoederen: hoe ver is de onboarding, welke koppelingen werken, waar is aandacht nodig. Dit is de operationele "strikte scheiding" die je bedoelt — niet alleen data uit elkaar, maar elk landgoed apart beheersbaar.
- **"Namens de eigenaar werken" is een expliciet, herleidbaar mechanisme.** Als wij in een landgoed handelen, is dat zichtbaar en geregistreerd. Dat beschermt het vertrouwen — juist bij oudere, voorzichtige eigenaren.

## 2. Twee ontwerpprincipes voor koppelingen

Voordat de tabellen komen, twee principes die de hele koppelingenlaag sturen.

**Principe 1 — een koppeling is een server-side dienst, geen frontend-feature.** De browser mag weten *dát* er een koppeling is en *of* hij werkt (de status). De browser ziet **nooit** de credentials (IMAP-wachtwoord, OAuth-token). Geheimen leven uitsluitend server-side en worden versleuteld bewaard in **Supabase Vault**. Ze worden alleen aangeroepen vanuit beveiligde serverkant (Vercel serverless / Supabase Edge Functions), nooit teruggestuurd naar de client.

**Principe 2 — koppelingen zijn strikt read-only.** Wij halen op, we schrijven niet terug naar de boekhouding of mailbox van de klant. Dat verlaagt het risico enorm (een fout kan nooit data bij de klant beschadigen) en het is een eerlijk, geruststellend verkoopverhaal: "wij kijken mee, we rommelen nergens in." Schrijven naar een extern systeem komt er pas als een concrete klantvraag het rechtvaardigt, en dan per koppeling — nooit als standaard.

## 3. De configuratielaag — `landgoed_config`

Naast de *data* van een landgoed (documenten, contracten, percelen) en de *toegang* (lidmaatschap/RLS) heeft elk landgoed *configuratie*: instelbare eigenschappen die gedrag bepalen maar zelf geen dossierdata zijn. Denk aan de status van de onboarding, het profiel voor de omgevingsradar (waar ligt het landgoed, welke thema's zijn relevant), en branding. Dit hoort niet verspreid over losse tabellen maar in één plek.

```sql
-- CONFIGURATIE per landgoed (één rij per landgoed)
create table landgoed_config (
  landgoed_id uuid primary key references landgoed(id) on delete cascade,
  -- onboarding-voortgang
  onboarding_status text not null default 'nieuw'
    check (onboarding_status in ('nieuw','bezig','gereed')),
  onboarding_stappen jsonb default '{}'::jsonb,   -- welke stappen zijn afgevinkt
  -- omgevingsradar-profiel (voedt de AI-relevantiefilter, zie Deel III)
  gemeenten text[],                               -- relevante gemeenten
  provincie text,
  themas text[],                                  -- bv. {'natuur','pacht','monumenten'}
  -- presentatie
  weergave_naam text,                             -- evt. afwijkende displaynaam
  -- vrije ruimte voor latere instellingen
  extra jsonb default '{}'::jsonb,
  bijgewerkt_op timestamptz default now()
);

alter table landgoed_config enable row level security;
create policy "config zien" on landgoed_config for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "config beheren" on landgoed_config for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

De `onboarding_stappen` is bewust een `jsonb`-veld: zo kun je stappen toevoegen of herordenen zonder migratie. Een voorbeeldinhoud:

```json
{
  "basisgegevens": true,
  "eigenaar_uitgenodigd": true,
  "modules_gekozen": true,
  "percelen_toegevoegd": false,
  "email_gekoppeld": false,
  "boekhouding_gekoppeld": false
}
```

## 4. De koppelingenlaag — `koppeling`

Eén uniforme tabel voor alle integraties, met een consistente status. De geheimen staan hier **niet** in; alleen een verwijzing naar de Vault-sleutel.

```sql
-- KOPPELING (integraties per landgoed) — credentials NIET hier, alleen in Vault
create table koppeling (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  type text not null
    check (type in ('email_imap','boekhouding_moneybird','boekhouding_eboekhouden',
                    'bank_import','bank_psd2','rss_bron','lokale_bron')),
  naam text,                                   -- bv. "Postbus Ter Hooge (Vimex)"
  status text not null default 'niet_ingesteld'
    check (status in ('niet_ingesteld','actief','fout','gepauzeerd')),
  config jsonb default '{}'::jsonb,            -- NIET-geheime instellingen: host, poort, mapnaam, RSS-URL
  vault_secret_naam text,                      -- verwijzing naar de Vault-sleutel (geen geheim zelf!)
  readonly boolean not null default true,      -- principe 2: standaard alleen-lezen
  laatste_sync timestamptz,
  laatste_fout text,
  aangemaakt_door uuid references profiel(id),
  aangemaakt_op timestamptz default now()
);

alter table koppeling enable row level security;
-- Leden zien dát er een koppeling is en de status; nooit het geheim (dat staat niet in deze tabel)
create policy "koppeling zien" on koppeling for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "koppeling beheren" on koppeling for all
  using (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin())
  with check (rol_op(landgoed_id) in ('eigenaar','rentmeester') or is_admin());
```

**Hoe het geheim erin en eruit komt.** Het wachtwoord of token wordt nooit via de gewone API opgeslagen. Het loopt via een server-side route (Vercel serverless of een Supabase Edge Function) die het geheim in Vault schrijft en alleen de `vault_secret_naam` terugschrijft naar de `koppeling`-rij. Bij het ophalen (de sync) leest diezelfde server-laag het geheim uit Vault, maakt verbinding met de externe bron, en schrijft alleen het *resultaat* (transacties, mails) naar de gewone tabellen. De browser komt nergens in de buurt van het geheim.

```sql
-- Geheim wegschrijven (server-side, met de service-role; nooit vanuit de browser)
select vault.create_secret(
  'imap-wachtwoord-hier',           -- het geheim
  'koppeling_<koppeling_id>',       -- de naam die in koppeling.vault_secret_naam komt
  'IMAP-wachtwoord landgoed X'      -- omschrijving
);
```

> **Waarom Vault en niet gewoon een kolom.** Een gewone kolom met een wachtwoord erin is leesbaar voor iedereen met database-toegang en belandt in back-ups in platte vorm. Vault versleutelt at-rest met een sleutel die buiten de tabel leeft. Voor een dienst die contracten en mailboxen van klanten raakt, is dat het verschil tussen "verantwoord" en "een datalek dat wacht om te gebeuren".

### De vier koppelingen concreet

| Type | Bron | Aanpak | Risico |
|---|---|---|---|
| `email_imap` | Mailbox (bv. Vimex voor Ter Hooge) | Read-only IMAP; host/poort/map in `config`, wachtwoord in Vault. Haalt berichten op voor het communicatie-archief. | Middel (IMAP-credentials) |
| `boekhouding_moneybird` / `_eboekhouden` | Boekhoudpakket | OAuth-token in Vault; read-only API. Voedt licht financieel inzicht. | Middel (OAuth) |
| `bank_import` / `bank_psd2` | Bankafschriften | Import (CSV/MT940/camt.053) = geen geheim, laagdrempelig. PSD2-aggregator later = token in Vault. | Laag (import) / Middel (PSD2) |
| `rss_bron` / `lokale_bron` | Nieuwsbrieven, gemeentebladen, RSS | Meestal geen geheim; URL in `config`. Voedt de omgevingsradar. | Laag |

Dit is geen nieuwe techniek bovenop wat al besloten is — het is hetzelfde IMAP-/Moneybird-/importverhaal uit Deel III en Deel IV, nu onder één uniform `koppeling`-mechanisme met één statusweergave.

## 5. Provisioning — één atomaire handeling

Het aanmaken van een landgoed moet één onbreekbare handeling zijn: landgoed + basismodules + lege config + eigenaar-uitnodiging, alles of niets. Anders krijg je half-aangemaakte landgoederen waar de helft van de modules ontbreekt. Dit gebeurt server-side in één database-functie.

```sql
-- Provisioning: maak een landgoed compleet aan in één transactie
create or replace function landgoed_aanmaken(
  p_naam text,
  p_gemeente text default null,
  p_provincie text default null,
  p_hectare numeric default null
)
returns uuid
language plpgsql security definer
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Alleen een admin mag een landgoed aanmaken';
  end if;

  insert into landgoed (naam, gemeente, provincie, hectare)
  values (p_naam, p_gemeente, p_provincie, p_hectare)
  returning id into v_id;

  -- basismodules aan, uitbreiding/pro klaar maar uit (zie Deel II)
  insert into module_instelling (landgoed_id, module, niveau, actief) values
    (v_id,'dashboard','basis',true),
    (v_id,'documenten','basis',true),
    (v_id,'taken','basis',true),
    (v_id,'contacten','basis',true),
    (v_id,'communicatie','basis',true),
    (v_id,'contracten','basis',true),
    (v_id,'subsidieradar','basis',true),
    (v_id,'omgevingsradar','basis',true),
    (v_id,'financieel_inzicht','basis',true),
    (v_id,'incidenten','basis',true),
    (v_id,'vergaderingen','basis',true),
    (v_id,'percelen_gebouwen','uitbreiding',false),
    (v_id,'kaart','uitbreiding',false),
    (v_id,'onderhoud','uitbreiding',false),
    (v_id,'beheerplan','uitbreiding',false),
    (v_id,'natuur_bos','uitbreiding',false),
    (v_id,'projecten','uitbreiding',false),
    (v_id,'documentmodule','uitbreiding',false),
    (v_id,'werkorders','pro',false),
    (v_id,'wagenpark','pro',false),
    (v_id,'financien_diepte','pro',false),
    (v_id,'multi_landgoed','pro',false);

  -- lege configuratie met onboarding op 'nieuw'
  insert into landgoed_config (landgoed_id, provincie) values (v_id, p_provincie);

  return v_id;
end;
$$;
```

Eén aanroep, en het landgoed is consistent geboren. De eigenaar uitnodigen is een aparte stap (dat raakt Supabase Auth en de e-mail), maar de *data* staat in één klap goed.

## 6. De gedeelde onboarding-wizard

De wizard leidt door de stappen van "leeg" naar "werkend dashboard". Cruciaal: **dezelfde wizard wordt gebruikt door de eigenaar en door ons.** Het systeem leest en schrijft de voortgang in `landgoed_config.onboarding_stappen`, zodat het niet uitmaakt wie welke stap zet — wie de wizard opent, ziet wat al gedaan is en wat nog mist.

| Stap | Wat | Door wie | Verplicht? |
|---|---|---|---|
| 1. Basisgegevens | Naam, gemeente(n), provincie, oppervlakte, NSW-status, eigendomsvorm | Eigenaar of wij | Ja |
| 2. Eigenaar & team | Eigenaar uitnodigen, evt. kijkers (bestuur/familie) toevoegen | Wij (admin) of eigenaar | Ja |
| 3. Modules kiezen | Basis staat al aan; evt. een uitbreiding aanzetten | Eigenaar of wij | Nee (basis volstaat) |
| 4. Omgevingsprofiel | Gemeenten + thema's voor de omgevingsradar | Eigenaar of wij | Aanbevolen |
| 5. Percelen/objecten | Eerste percelen en gebouwen als lijst (kaart komt later) | Eigenaar of wij | Nee |
| 6. Koppelingen | E-mail, boekhouding, bank, lokale bronnen | Meestal wij (gevoelig) | Nee |

Elke stap zet zijn vlag in `onboarding_stappen`. Zodra de verplichte stappen staan, springt `onboarding_status` op `gereed`. Een eigenaar die bij stap 6 vastloopt, laat die simpelweg open; wij zien dat in het controlepaneel (sectie 7) en kunnen bijspringen.

**De koppelingenstap is bewust "meestal wij".** IMAP-wachtwoorden en OAuth-koppelingen zijn precies waar een minder technische eigenaar afhaakt. Dit als dienst aanbieden ("stuur ons de gegevens, wij zetten het voor je klaar") is geen zwakte van het product maar een verkoopargument.

## 7. Het admin-controlepaneel — jullie cockpit

Dit is de operationele kern van "strikt gescheiden / goed beheersbaar". Het bestaande `/admin` (Deel I) kan landgoederen aanmaken en gebruikers koppelen. Hier breiden we het uit tot een echt overzicht over het hele klantenbestand.

**`/admin/landgoederen` — de lijst.** Eén rij per landgoed, met in één oogopslag:

- naam, gemeente, oppervlakte, eigendomsvorm;
- onboarding-status (`nieuw` / `bezig` / `gereed`) met een voortgangsbalkje uit `onboarding_stappen`;
- aantal actieve gebruikers en hun rollen;
- koppelingen met statusstip per type (groen = actief, rood = fout, grijs = niet ingesteld);
- laatste activiteit (laatste taak/document/sync);
- aantal openstaande taken dat aandacht vraagt.

**`/admin/landgoed/[id]` — het detailscherm.** Per landgoed: de configuratie bewerken, koppelingen opzetten/repareren, de onboarding-wizard openen (zie sectie 6), gebruikers beheren, en — netjes geregeld — "binnenstappen" om namens de eigenaar te werken (sectie 8).

Een handige bron voor dit overzicht is een database-view die alles samenvat, zodat de frontend niet tien queries hoeft te doen:

```sql
-- Samenvattende view voor het admin-controlepaneel (alleen admin via serverlaag)
create or replace view admin_landgoed_overzicht as
select
  l.id,
  l.naam,
  l.gemeente,
  l.hectare,
  coalesce(c.onboarding_status,'nieuw')              as onboarding_status,
  (select count(*) from lidmaatschap m where m.landgoed_id = l.id) as aantal_gebruikers,
  (select count(*) from koppeling k
     where k.landgoed_id = l.id and k.status = 'actief')           as koppelingen_actief,
  (select count(*) from koppeling k
     where k.landgoed_id = l.id and k.status = 'fout')             as koppelingen_fout,
  (select count(*) from taak t
     where t.landgoed_id = l.id and t.status = 'open')             as taken_open,
  greatest(
    coalesce((select max(aangemaakt_op) from taak t where t.landgoed_id = l.id), 'epoch'),
    coalesce((select max(aangemaakt_op) from document d where d.landgoed_id = l.id), 'epoch')
  )                                                  as laatste_activiteit
from landgoed l
left join landgoed_config c on c.landgoed_id = l.id;
```

> Een view erft de RLS van de onderliggende tabellen niet automatisch op dezelfde manier; draai 'm daarom als `security invoker` (Postgres 15+) of leg er een expliciete admin-check overheen in de serverlaag. In de praktijk roept alleen de admin-route deze view aan, met de service-role achter een `is_admin()`-controle in `lib/auth.ts`.

## 8. Namens de eigenaar werken — zichtbaar en herleidbaar

Technisch kan een admin via RLS al overal bij. Maar voor een dienst waarbij jullie *proactief namens de klant handelen*, wil je dat dit expliciet en herleidbaar is — niet stiekem "god-mode", maar een zichtbare handeling die het vertrouwen versterkt. Twee bouwstenen:

**1. Een impersonatie-/handelingslogboek.** Elke keer dat een admin namens een landgoed iets doet (een taak aanmaakt, een koppeling instelt, een document uploadt), wordt dat geregistreerd: wie, welk landgoed, welke actie, wanneer. De eigenaar kan dit desgewenst inzien — dat is de transparantie die wantrouwige eigenaren overtuigt.

```sql
-- AUDIT: handelingen van admins/rentmeesters, herleidbaar per landgoed
create table handeling_log (
  id uuid primary key default gen_random_uuid(),
  landgoed_id uuid not null references landgoed(id) on delete cascade,
  actor_id uuid not null references profiel(id),   -- wie deed het
  namens boolean not null default false,           -- handelde admin namens de eigenaar?
  actie text not null,                             -- bv. 'taak_aangemaakt','koppeling_ingesteld'
  details jsonb default '{}'::jsonb,
  aangemaakt_op timestamptz default now()
);

alter table handeling_log enable row level security;
-- Leden van het landgoed mogen hun eigen logboek inzien (transparantie); admin ziet alles
create policy "log zien" on handeling_log for select
  using (is_lid_van(landgoed_id) or is_admin());
create policy "log schrijven" on handeling_log for insert
  with check (is_admin() or rol_op(landgoed_id) in ('eigenaar','rentmeester'));
```

**2. "Binnenstappen" als bewuste modus.** In het admin-detailscherm zit een knop "Werk in dit landgoed". Die zet de admin in de normale landgoed-context (dezelfde schermen die de eigenaar ziet), met een duidelijke balk bovenin: *"Je werkt nu in [landgoed] namens De Nieuwe Rentmeesters."* Zolang die modus aanstaat, krijgen handelingen `namens = true` mee in het logboek. Zo blijft glashelder wat door de klant zelf en wat door jullie is gedaan.

Dit hoeft technisch niet ingewikkeld: het is een context-vlag in de sessie plus het meeschrijven naar `handeling_log`. Geen aparte inlog, geen rolwissel in de database — de admin *is* al admin; je maakt het alleen zichtbaar en netjes.

## 9. Claude Code-prompts

**Prompt A — provisioning + admin-controlepaneel.**

> Breid het admin-paneel uit van de landgoedbeheer-app (Next.js + Supabase). De database heeft nu `landgoed_config`, `koppeling`, `handeling_log`, de functie `landgoed_aanmaken(...)` en de view `admin_landgoed_overzicht` (al aangemaakt — alleen mee verbinden).
>
> Bouw: (1) **`/admin/landgoederen`** — een overzichtstabel gevoed door `admin_landgoed_overzicht`, met per landgoed de onboarding-status als voortgangsbalk, aantal gebruikers, koppelingsstatus als gekleurde stippen (groen/rood/grijs), laatste activiteit en aantal openstaande taken. Sorteerbaar; landgoederen die aandacht vragen (status fout of onboarding niet gereed) bovenaan. (2) **"Nieuw landgoed"** — een knop die de functie `landgoed_aanmaken` aanroept (rpc) en daarna direct de onboarding-wizard opent. (3) **`/admin/landgoed/[id]`** — detailscherm: configuratie bewerken, gebruikers beheren, koppelingen opzetten/repareren, wizard openen, en een knop "Werk in dit landgoed" die de admin in de gewone landgoed-context zet met een duidelijke balk bovenin.
>
> Alleen toegankelijk voor admin (controle via `lib/auth.ts`, `is_admin()`). Nederlandse interface, stijl conform het bestaande ontwerp (#1B3A28). Vertrouw op RLS; roep de view aan via de server-client achter een admin-check.

**Prompt B — onboarding-wizard (gedeeld).**

> Bouw een onboarding-wizard voor de landgoedbeheer-app, bruikbaar door zowel de eigenaar als een admin. De wizard leest en schrijft voortgang in `landgoed_config.onboarding_stappen` (jsonb) en zet `onboarding_status` op `gereed` zodra de verplichte stappen staan.
>
> Stappen: (1) basisgegevens, (2) eigenaar/team uitnodigen, (3) modules kiezen (basis staat al aan), (4) omgevingsprofiel: gemeenten + thema's, (5) percelen/objecten als lijst, (6) koppelingen. Toon links een stappenbalk met afgevinkte/openstaande stappen; je kunt stappen overslaan en later terugkomen. Elke stap slaat zijn eigen vlag op. Stap 6 (koppelingen) toont per type een statuskaart; het instellen van een geheim loopt via een server-side route (zie prompt C), niet via de browser.
>
> Nederlandse interface, bestaande stijl. De wizard is bereikbaar vanuit zowel `/landgoed/[id]/instellingen` (eigenaar) als `/admin/landgoed/[id]` (admin).

**Prompt C — koppelingen veilig instellen (server-side).**

> Bouw de server-side afhandeling van koppelingen voor de landgoedbeheer-app. Credentials mogen **nooit** in een gewone tabel of naar de browser; ze gaan in **Supabase Vault**.
>
> Maak een serverroute (Next.js route handler met de Supabase service-role, of een Supabase Edge Function) die: (1) een credential (IMAP-wachtwoord of OAuth-token) ontvangt over een beveiligde verbinding, (2) het wegschrijft met `vault.create_secret(...)`, (3) alleen de `vault_secret_naam` en niet-geheime config (host, poort, mapnaam, RSS-URL) terugschrijft naar de `koppeling`-rij, en de status op `actief` zet. Bouw daarnaast een **sync-route** die per koppeling het geheim uit Vault leest, read-only verbinding maakt met de bron (IMAP / Moneybird / import), het resultaat naar de gewone tabellen schrijft, en `laatste_sync` / `laatste_fout` / `status` bijwerkt. Alle koppelingen standaard `readonly = true`.
>
> Schrijf elke admin-handeling namens een landgoed weg in `handeling_log` met `namens = true`. Nederlandse foutmeldingen. Geen geheim mag ooit in een log of in een API-respons belanden.

## 10. Plek in de fasering

Deze laag raakt twee bestaande fasen en verdient een eigen, kleine plek ertussen.

| Fase | Aanvulling uit Deel V |
|---|---|
| **0 — Fundament** | Voeg `landgoed_config`, `koppeling`, `handeling_log`, de functie `landgoed_aanmaken` en de view `admin_landgoed_overzicht` toe aan de database-scripts. Provisioning vervangt de losse `insert into landgoed`. |
| **1 — Communicatie & basis** | Het **admin-controlepaneel** (prompt A) en de **gedeelde onboarding-wizard** (prompt B). De configuratie (omgevingsprofiel) voedt meteen de omgevingsradar uit Deel III. |
| **1b — Koppelingen (nieuw, klein)** | De **veilige koppeling-laag met Vault** (prompt C), te beginnen met bestandsimport (geen geheim) en daarna IMAP voor Ter Hooge. Boekhouding-OAuth en PSD2 blijven later (Fase 5), maar gebruiken hetzelfde `koppeling`-mechanisme. |
| **5 — Pro & koppelingen** | De zwaardere koppelingen (PSD2-aggregator, Moneybird/e-Boekhouden-OAuth, Vimex IMAP op schaal) landen netjes in de bestaande `koppeling`-structuur — geen nieuw model nodig. |

## 11. Risico-inschatting (aanvulling op Deel IV)

| Onderdeel | Risico | Toelichting |
|---|---|---|
| `landgoed_config` + provisioning-functie | **Laag** | Standaard datawerk; de transactie-functie voorkomt half-aangemaakte landgoederen. |
| Admin-controlepaneel + view | **Laag** | Leesvlak bovenop bestaande tabellen; let op de `security invoker`-instelling van de view. |
| Onboarding-wizard | **Laag** | Frontend-flow op bestaande velden. |
| Namens-werken + `handeling_log` | **Laag** | Een sessie-vlag plus auditschrijven; geen databaserol-wissel. |
| Koppelingen + Vault (geheimen) | **Middel** | De gevoeligste laag. Strikt server-side, Vault voor geheimen, read-only. Begin met bestandsimport (geen geheim), dan IMAP. |

**Conclusie:** de onboarding-, beheer- en configuratielaag is overwegend laag risico en kan vroeg (Fase 1) — het geeft jullie meteen grip op het klantenbestand. Alleen de credential-houdende koppelingen vragen zorg; die isoleer je server-side met Vault en houd je read-only, en je begint met de variant zonder geheim (bestandsimport).

---

*Technisch werkdocument. Bouw met Claude Code; vertrouw overal op Row Level Security voor de data-afscherming. Het algemene plan staat in een apart document (versie 1.1).*

