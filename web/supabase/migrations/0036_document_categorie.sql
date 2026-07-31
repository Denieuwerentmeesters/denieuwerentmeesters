-- ============================================================
-- Documenten — van platte lijst naar archief met categorieën
--
-- PROBLEEM. De documentenmodule was één ongesorteerde lijst per landgoed. Drie
-- dingen liepen daarop stuk:
--
--   (a) Terugvinden. Een landgoed verzamelt binnen een jaar aktes, pachtcontracten,
--       keuringsrapporten, subsidiebeschikkingen en notulen door elkaar. Zonder
--       indeling is de lijst na een paar honderd stuks alleen nog chronologie.
--   (b) Signalering. Een keuringsrapport dat verloopt of een beschikking die
--       afloopt is pas een signaal als de app wéét dat het om een keuring of een
--       beschikking gaat, én tot wanneer die geldig is. Beide stonden nergens.
--   (c) Hergebruik. Hetzelfde pachtcontract hoort thuis bij het contract, bij het
--       perceel én bij de pachter. In een platte lijst kan dat alleen door het
--       document drie keer te uploaden.
--
-- ONTWERP. Een categorie is een LABEL, geen opslaglocatie. Geen mappenboom, geen
-- pad-kolom, geen verplaatsen: één document bestaat één keer en wordt op meerdere
-- plekken getoond. Andere modules (contracten, subsidies, objecten, contacten)
-- tonen straks een gefilterde doorsnede van dezelfde tabel via document_koppeling.
--
-- De categorie kan op twee manieren ontstaan, en dat verschil is bewust in het
-- schema vastgelegd via categorie_herkomst:
--
--   'bron'      -- de herkomst legt de categorie vast (notulen uit een gesprek,
--                  upload vanaf een contractpagina). Er valt niets te raden, dus
--                  categorie_geaccordeerd blijft true en de gebruiker wordt niets
--                  gevraagd.
--   'inhoud'    -- de AI leidde de categorie af uit de tekst. Dan geldt de regel
--                  uit CLAUDE.md: AI-uitvoer is een vóórstel. categorie_geaccordeerd
--                  gaat op false en het document telt in het overzicht mee onder
--                  'nog_in_te_delen' tot de gebruiker bevestigt.
--   'handmatig' -- de gebruiker koos zelf. Per definitie geaccordeerd.
--
-- Dit is hetzelfde voorstel/accordeer-patroon als stamobject (herkomst,
-- voorstel_reden, geaccordeerd) — bewust geen nieuw mechanisme.
--
-- Bestaande documenten krijgen 'nog_in_te_delen' met geaccordeerd=false, zodat ze
-- in de werkvoorraad verschijnen. Bewust NIET automatisch classificeren bij de
-- migratie: dat zou een berg ongecontroleerde AI-uitspraken als feit wegzetten.
--
-- vertrouwelijkheid leggen we nu al vast terwijl er nog geen gedrag aan hangt —
-- het achteraf toevoegen aan een gevuld archief is duur, want dan moet iemand
-- honderden bestaande stukken alsnog langslopen.
-- ============================================================

-- ── document: categorie en signaalvelden ────────────────────────────────

alter table document add column if not exists categorie text not null default 'nog_in_te_delen';
alter table document add column if not exists categorie_herkomst text not null default 'handmatig';
alter table document add column if not exists categorie_geaccordeerd boolean not null default true;
alter table document add column if not exists categorie_voorstel_reden text;
alter table document add column if not exists is_leidend boolean not null default false;
alter table document add column if not exists vertrouwelijkheid text not null default 'normaal';
alter table document add column if not exists geldig_tot date;
alter table document add column if not exists soort text not null default 'archiefstuk';

alter table document drop constraint if exists document_categorie_check;
alter table document add constraint document_categorie_check check (categorie in (
  'eigendom_rechten',
  'governance',
  'contracten_verhuur',
  'leveranciers',
  'beheerplannen',
  'subsidies',
  'vergunningen',
  'keuringen',
  'onderzoeken',
  'verzekeringen',
  'personeel',
  'vergaderingen',
  'historisch',
  'nog_in_te_delen'
));

alter table document drop constraint if exists document_categorie_herkomst_check;
alter table document add constraint document_categorie_herkomst_check
  check (categorie_herkomst in ('handmatig', 'bron', 'inhoud'));

alter table document drop constraint if exists document_vertrouwelijkheid_check;
alter table document add constraint document_vertrouwelijkheid_check
  check (vertrouwelijkheid in ('normaal', 'vertrouwelijk', 'gevoelig'));

alter table document drop constraint if exists document_soort_check;
alter table document add constraint document_soort_check
  check (soort in ('archiefstuk', 'bijlage'));

comment on column document.categorie is
  'Vaste categorie uit app/(app)/landgoed/[id]/documenten/categorieen.ts — dat bestand is de '
  'bron van waarheid voor deze constraint, de keuzelijst in de UI en de classificatieprompt. '
  'Een categorie is een label, geen map: hetzelfde document kan via document_koppeling op '
  'meerdere plekken in de app opduiken. Let op het verschil tussen contracten_verhuur '
  '(landgoed ontvangt geld) en leveranciers (landgoed betaalt) — dat is de meest voorkomende '
  'classificatiefout. nog_in_te_delen = nog niet bevestigd.';

comment on column document.categorie_herkomst is
  'Hoe de categorie tot stand kwam. handmatig = de gebruiker koos zelf. bron = afgeleid uit '
  'waar het document vandaan kwam (notulen uit een gesprek, upload vanaf een contract- of '
  'subsidiepagina); daar valt niets te raden, dus geen bevestiging nodig. inhoud = de AI leidde '
  'het af uit de tekst; dan is het een vóórstel en staat categorie_geaccordeerd op false.';

comment on column document.categorie_geaccordeerd is
  'false = de indeling is nog een AI-voorstel dat de gebruiker moet bevestigen. Het document is '
  'zichtbaar en te openen, maar telt in het overzicht mee onder Nog in te delen. Bij herkomst '
  'handmatig of bron altijd true.';

comment on column document.categorie_voorstel_reden is
  'Eén zin in het Nederlands waarom de AI deze categorie koos, getoond in de werkvoorraad zodat '
  'de gebruiker kan beoordelen zonder het document te openen. Alleen gevuld bij herkomst=inhoud.';

comment on column document.is_leidend is
  'true = het juridisch of procesmatig leidende stuk in een dossier (de beschikking, de akte, '
  'het ondertekende contract) — niet de begeleidende brief. Bepaalt welk stuk bovenaan komt als '
  'een dossier uit meerdere documenten bestaat.';

comment on column document.vertrouwelijkheid is
  'normaal / vertrouwelijk / gevoelig. Wordt nu alleen vastgelegd; er hangt bewust nog geen '
  'rechtengedrag aan (rechten per categorie staan expliciet buiten scope). Vastleggen gebeurt '
  'nu al omdat het achteraf aanvullen van een gevuld archief duur is.';

comment on column document.geldig_tot is
  'Einddatum van de geldigheid, alleen relevant voor keuringen, vergunningen en beschikkingen. '
  'Voedt de signalering op de overzichtspagina (verlopen = rood, binnen 60 dagen = amber voor '
  'keuringen; binnen 90 dagen = amber voor subsidies en vergunningen). Bij twijfel leeg laten — '
  'niet zelf een looptijd uitrekenen.';

comment on column document.soort is
  'archiefstuk = hoort in het archief en telt mee in het overzicht. bijlage = meegekomen '
  'materiaal zonder zelfstandige archiefwaarde (foto bij een melding, meterstandfoto); wordt '
  'standaard niet in het hoofdoverzicht getoond.';

create index if not exists document_landgoed_categorie_idx
  on document (landgoed_id, categorie);

-- ── document_koppeling: één document, meerdere contexten ────────────────
--
-- Bewust een losse tabel en geen kolommen op document: een pachtcontract hoort
-- tegelijk bij het contract, het perceel en de pachter. Geen foreign key op
-- doel_id, want het doel staat in wisselende tabellen; de combinatie
-- (doel_soort, doel_id) is de verwijzing. De unique voorkomt dat dezelfde
-- koppeling twee keer ontstaat als een module 'm opnieuw legt.

create table if not exists document_koppeling (
  id            uuid        primary key default gen_random_uuid(),
  document_id   uuid        not null references document(id) on delete cascade,
  doel_soort    text        not null,
  doel_id       uuid        not null,
  aangemaakt_op timestamptz not null default now(),
  unique (document_id, doel_soort, doel_id)
);

-- 'gesprek_bewerking' staat bewust naast 'gesprek' in de lijst. Notulen die
-- definitief worden gemaakt krijgen een document-rij, en die mag bij een herziening
-- niet verdubbelen. Een koppeling naar het gesprek is daarvoor te grof — één
-- vergadering kan meerdere bewerkingen hebben (notulen, besluitenlijst). De
-- koppeling naar de bewerking is de identiteit van de rij; de koppeling naar het
-- gesprek is de context waarin hij getoond wordt. Beide worden gelegd.
alter table document_koppeling drop constraint if exists document_koppeling_doel_soort_check;
alter table document_koppeling add constraint document_koppeling_doel_soort_check
  check (doel_soort in (
    'stamobject', 'contract', 'subsidie', 'relatie', 'gesprek', 'gesprek_bewerking', 'perceel'
  ));

comment on table document_koppeling is
  'Koppelt één document aan meerdere contexten, zodat het maar één keer geüpload hoeft te '
  'worden en toch bij het contract, het object én het contact opduikt. Geen foreign key op '
  'doel_id: het doel staat in wisselende tabellen, de combinatie (doel_soort, doel_id) is de '
  'verwijzing.';

comment on column document_koppeling.doel_soort is
  'De tabel waar doel_id naar wijst: stamobject, contract, subsidie, relatie, gesprek, '
  'gesprek_bewerking of perceel. gesprek_bewerking wijst naar het notulenstuk zelf en dient '
  'als identiteit bij het bijwerken van definitief gemaakte notulen; gesprek is de context.';

create index if not exists document_koppeling_doel_idx
  on document_koppeling (doel_soort, doel_id);

-- RLS volgt exact het patroon van de document-policies uit 0001: zien mag elk lid
-- van het landgoed, beheren alleen eigenaar/rentmeester. De toegang loopt via het
-- bijbehorende document, zodat er maar één plek is waar de tenantgrens ligt.

alter table document_koppeling enable row level security;

drop policy if exists "documentkoppeling zien" on document_koppeling;
create policy "documentkoppeling zien" on document_koppeling for select
  using (
    exists (
      select 1 from document d
      where d.id = document_koppeling.document_id
        and (d.scope = 'nationaal' or is_lid_van(d.landgoed_id) or is_admin())
    )
  );

drop policy if exists "documentkoppeling beheren" on document_koppeling;
create policy "documentkoppeling beheren" on document_koppeling for all
  using (
    exists (
      select 1 from document d
      where d.id = document_koppeling.document_id
        and (
          (d.scope = 'nationaal' and is_admin())
          or (d.scope = 'landgoed' and (rol_op(d.landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
        )
    )
  )
  with check (
    exists (
      select 1 from document d
      where d.id = document_koppeling.document_id
        and (
          (d.scope = 'nationaal' and is_admin())
          or (d.scope = 'landgoed' and (rol_op(d.landgoed_id) in ('eigenaar','rentmeester') or is_admin()))
        )
    )
  );

-- ── Bestaande data ──────────────────────────────────────────────────────
--
-- Alles wat er al staat gaat naar de werkvoorraad. De default op de kolom vult
-- 'nog_in_te_delen' al; alleen categorie_geaccordeerd moet expliciet naar false,
-- want de default (true) is bedoeld voor nieuwe handmatige uploads. Beperkt tot
-- rijen die nog op de default staan, zodat opnieuw draaien niets terugdraait.

update document
   set categorie_geaccordeerd = false
 where categorie = 'nog_in_te_delen'
   and categorie_herkomst = 'handmatig'
   and categorie_geaccordeerd = true;
