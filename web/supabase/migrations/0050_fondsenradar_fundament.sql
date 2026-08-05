-- ============================================================
-- Fondsenradar — fase 1 "fundament"
-- Bron: Implementatieplan_Fondsenradar.md (versie 2, 4 aug 2026), §1–§5, §9, §10.
--
-- Kernbeslissing (§1): subsidies en fondsen delen de catalogus (`regeling` +
-- `regeling_criterium` / `_maatregel` / `_bewijs`) en verschillen alleen aan de
-- oppervlakte. Deze migratie voegt de velden toe die nodig zijn om een fonds
-- eerlijk te kunnen opslaan; UI, poort en matchmotor volgen in fase 2 en later.
--
-- Twee assen, bewust niet één binair veld (§1):
--   soort_bron     -> stuurt het tabblad en het documenttype
--   rechtskarakter -> stuurt workflow, verantwoording en cumulatieberekening
--
-- RLS-patroon gespiegeld van 0012/0047: catalogus = wereld-lezen (ingelogd),
-- admin-schrijven. Idempotent conform CLAUDE.md.
-- ============================================================

-- ------------------------------------------------------------
-- 1. §1 — soort_bron en rechtskarakter
-- ------------------------------------------------------------

alter table regeling
  add column if not exists soort_bron text not null default 'subsidie'
    check (soort_bron in ('subsidie','fonds','lening','fiscaal','eigen_bijdrage'));

comment on column regeling.soort_bron is
  'Welk soort geldstroom dit is. Stuurt het tabblad in de UI en het documenttype '
  '(subsidie = compliance, fonds = overtuiging). Staat LOS van rechtskarakter: de '
  'provinciale monumentenfondsen die het Nationaal Restauratiefonds uitvoert zijn '
  'publiek geld dat privaatrechtelijk wordt verstrekt.';

alter table regeling
  add column if not exists rechtskarakter text
    check (rechtskarakter in ('publiekrechtelijk','privaatrechtelijk','gemengd'));

comment on column regeling.rechtskarakter is
  'Juridische grondslag van de verstrekking. Bepaalt de workflow (beschikking met '
  'bezwaar/beroep vs. discretionair bestuursbesluit), het verantwoordingsregime en '
  'of de bron meetelt in de cumulatie-/staatssteuntoets (§1, §7). NULL = nog niet '
  'vastgesteld — niet als publiekrechtelijk lezen.';

-- Bestaande catalogus is volledig subsidie/publiek: eenmalige backfill.
update regeling set rechtskarakter = 'publiekrechtelijk'
  where rechtskarakter is null and soort_bron = 'subsidie';

-- §1: `bestuurslaag` gaat over welke OVERHEIDSlaag verstrekt. Voor fondsen hoort
-- dat veld leeg te blijven; "privaat" erin proppen is een categoriefout. Het
-- import-script bewaakt dit ook (lib/fondsen/bestand.ts), maar de database is de
-- laatste rem.
alter table regeling drop constraint if exists regeling_bestuurslaag_alleen_publiek;
alter table regeling add constraint regeling_bestuurslaag_alleen_publiek
  check (soort_bron <> 'fonds' or bestuurslaag is null) not valid;

-- ------------------------------------------------------------
-- 2. §2 — herkomst: gissing en feit uit elkaar houden
-- ------------------------------------------------------------
-- Van de 103 fondsen is een deel geverifieerd op de eigen website en een groot
-- deel alleen afgeleid uit een sector-tag op fondseninnederland.nl. De matcher
-- mag dat verschil niet wegmiddelen. De bestaande waarden ('import','ai',
-- 'handmatig') blijven geldig zodat de subsidie-ingestie ongemoeid blijft.
alter table regeling drop constraint if exists regeling_herkomst_check;
alter table regeling add constraint regeling_herkomst_check
  check (herkomst in (
    'import','ai','handmatig',
    'afgeleid_tag','geverifieerd_bron','ai_voorstel'
  ));

comment on column regeling.herkomst is
  'Hoe hard deze rij is. import/ai/handmatig = bestaande subsidie-ingestie. '
  'Fondsen (§2): handmatig | afgeleid_tag (alleen een sector-tag, dus een '
  'gissing) | geverifieerd_bron (op de eigen website nagelezen) | ai_voorstel. '
  'Samen met geaccordeerd de basis voor matchbaarheid.';

-- ------------------------------------------------------------
-- 3. §3 — benaderbaarheid als POORT (alleen fondsenkant)
-- ------------------------------------------------------------
-- Geen matchcriterium maar een poort: een subsidieloket dat open staat, staat
-- voor iedereen open. Alleen 'open' en 'open_met_drempel' mogen in fase 2
-- doorstromen naar een aanvraagsuggestie.
alter table regeling
  add column if not exists benaderbaarheid text not null default 'onbekend'
    check (benaderbaarheid in (
      'open','open_met_drempel','via_intermediair','op_uitnodiging','gesloten','onbekend'
    ));

comment on column regeling.benaderbaarheid is
  'Poort (§3). open = publiek loket. open_met_drempel = alleen ANBI, alleen na '
  'oriënterend contact, alleen via portaal. via_intermediair = loopt via een derde '
  '(actie is "leg contact met het provinciaal Landschap", niet "schrijf aan"). '
  'op_uitnodiging en gesloten blijven in de database maar worden nooit als kans '
  'getoond. Voor subsidies blijft dit ''onbekend'' en telt het niet mee.';

alter table regeling
  add column if not exists benaderwijze_notitie text;

comment on column regeling.benaderwijze_notitie is
  'LETTERLIJK citaat van de bron waarop de benaderbaarheid berust. Verplicht van '
  'karakter: de kosten van een fout zijn asymmetrisch — een fonds ten onrechte '
  'aanschrijven kost goodwill in een kleine sector (§3).';

-- ------------------------------------------------------------
-- 4. §5 — geografie fijner dan provincie
-- ------------------------------------------------------------
alter table regeling
  add column if not exists geo_niveau text
    check (geo_niveau in (
      'landelijk','provincie','regio','gemeente','plaats','internationaal'
    ));

alter table regeling
  add column if not exists geo_waarden text[] not null default '{}';

comment on column regeling.geo_niveau is
  'Op welk niveau het werkgebied is vastgelegd (§5). Let op de valkuil: '
  '''internationaal'' moet expliciet UITSLUITEN — Prince Bernhard Nature Fund '
  'draagt de tag "Natuur" maar financiert uitsluitend Afrika, Azië en '
  'Latijns-Amerika en hoort dus nooit bovenaan een Nederlandse natuurmatch. NULL '
  '= niet vastgesteld, en dat is iets anders dan landelijk.';

comment on column regeling.geo_waarden is
  'De waarden bij geo_niveau: provincienamen, gemeentenamen, regionamen '
  '("Kennemerland", "Zaanstreek") of plaatsnamen. Bij landelijk/internationaal '
  'leeg of de landen/werelddelen. Regionamen zijn nog niet naar gemeenten te '
  'vertalen — de regio_alias-tabel uit §5 volgt in fase 2 (de poort).';

create index if not exists regeling_geo_niveau_idx on regeling (geo_niveau);

-- ------------------------------------------------------------
-- 5. Bedragband, cofinanciering, financieringsrol, kostensoort, cooldown
--    (§9.3, §9.2, §9.4 en "kleinere punten")
-- ------------------------------------------------------------

alter table regeling add column if not exists bedrag_min numeric(14,2);
alter table regeling add column if not exists bedrag_max numeric(14,2);
alter table regeling add column if not exists bedrag_typisch numeric(14,2);
alter table regeling add column if not exists bedrag_indicatie text;

comment on column regeling.bedrag_min is
  'Ondergrens van wat deze bron uitkeert. Harde band (§9 slot): EUR 3.000 vragen '
  'bij een fonds dat niet onder de EUR 50.000 kijkt is even kansloos als andersom.';
comment on column regeling.bedrag_max is 'Bovengrens per toekenning. NULL = onbekend, niet ongelimiteerd.';
comment on column regeling.bedrag_typisch is
  'Wat er in de praktijk gemiddeld uitgaat. Vuistregel: vraag niet meer dan '
  'ongeveer een kwart van de jaarlijkse uitkeringsruimte.';
comment on column regeling.bedrag_indicatie is
  'Vrije tekst zoals de bron het zegt ("orde grootte" uit de fondsen-export), '
  'bewaard naast de getallen omdat de omzetting naar min/max interpretatie is.';

alter table regeling drop constraint if exists regeling_bedragband_volgorde;
alter table regeling add constraint regeling_bedragband_volgorde
  check (bedrag_min is null or bedrag_max is null or bedrag_min <= bedrag_max);

-- Drie-waardig via NULL: true = verplicht, false = niet verplicht,
-- NULL = niet gepubliceerd. De matcher mag NULL niet als false lezen (§2).
alter table regeling add column if not exists cofinanciering_vereist boolean;
comment on column regeling.cofinanciering_vereist is
  'true/false/NULL, waarbij NULL uitdrukkelijk "niet gepubliceerd" betekent en '
  'niet "nee" (§2, drie-waardige logica).';

alter table regeling add column if not exists max_percentage_projectkosten numeric(5,2)
  ;
alter table regeling drop constraint if exists regeling_max_percentage_bereik;
alter table regeling add constraint regeling_max_percentage_bereik
  check (max_percentage_projectkosten is null
         or (max_percentage_projectkosten > 0 and max_percentage_projectkosten <= 100));

comment on column regeling.max_percentage_projectkosten is
  'Maximaal aandeel van de projectkosten dat deze bron dekt (§9.3). Voedt straks '
  'de stapeling in het dekkingsplan en de cumulatietoets op het publieke aandeel.';

alter table regeling
  add column if not exists financieringsrol text not null default 'onbekend'
    check (financieringsrol in ('eerste_instapper','cofinancier','sluitpost','onbekend'));

comment on column regeling.financieringsrol is
  'Waar deze bron in de stapeling zit (§9.3). Eén bron is nooit het antwoord: de '
  'uitkomst hoort een volgorde te zijn ("eerst deze subsidie, dan met die '
  'toezegging naar dit fonds"), geen ranglijst.';

alter table regeling
  add column if not exists kostensoort text[] not null default '{}';

alter table regeling drop constraint if exists regeling_kostensoort_toegestaan;
alter table regeling add constraint regeling_kostensoort_toegestaan
  check (kostensoort <@ array[
    'investering','restauratie','regulier_onderhoud','exploitatie','personeel','onderzoek'
  ]::text[]);

comment on column regeling.kostensoort is
  'Welke kostensoorten deze bron financiert (§9.2). Cruciaal omdat regulier '
  'onderhoud en exploitatie bij bijna alle bronnen expliciet op de uitsluitings-'
  'lijst staan: het systeem moet zo''n vraag actief herkaderen naar restauratie of '
  'naar achterstallig onderhoud als afgebakend project, niet stil laten mislukken. '
  'Leeg = onbekend.';

alter table regeling add column if not exists cooldown_maanden integer;
alter table regeling drop constraint if exists regeling_cooldown_positief;
alter table regeling add constraint regeling_cooldown_positief
  check (cooldown_maanden is null or cooldown_maanden >= 0);

comment on column regeling.cooldown_maanden is
  'Minimale periode tussen twee aanvragen van dezelfde aanvrager (§9.4). Alleen '
  'zinvol aan de fondsenkant — bij de overheid is herhaald indienen legitiem. '
  'Veel fondsen: 12. Voedt straks ook de portefeuillebrede rem, want tien '
  'landgoederen die binnen een maand dezelfde vijf fondsen aanschrijven is '
  'collectieve en blijvende reputatieschade.';

-- ------------------------------------------------------------
-- 6. §5 — matchbaarheid apart van matchscore
-- ------------------------------------------------------------
alter table regeling
  add column if not exists matchbaarheid integer not null default 0;
alter table regeling drop constraint if exists regeling_matchbaarheid_bereik;
alter table regeling add constraint regeling_matchbaarheid_bereik
  check (matchbaarheid between 0 and 100);

comment on column regeling.matchbaarheid is
  'Hoeveel we van deze bron WETEN, op 0-100 — bewust een ander getal dan de '
  'matchscore (§5). Een fonds waarvan alleen de sector-tag bekend is kan geen 90%'
  'match opleveren, hoe goed het thema ook aansluit. Toon de twee getallen apart. '
  'Een lage matchbaarheid is zelf een actie: "zal ik het beleidsplan ophalen en '
  'analyseren?". Wordt in fase 2 berekend uit herkomst + gevulde kernvelden + '
  'regeling_bronlezing; tot die tijd 0 = nog niet bepaald.';

-- ------------------------------------------------------------
-- 7. §2 — versheid: snapshotvelden op de regeling zelf + hercontrole
-- ------------------------------------------------------------
-- subsidie_snapshot doet dit al per (bron, extern_id) voor gefeedde bronnen.
-- Fondsen komen uit een handmatig bestand en uit losse websites; de versheid
-- hoort daarom óók op de regeling te staan, zodat verlopen records zichtbaar
-- kunnen degraderen in plaats van mee te blijven doen alsof ze actueel zijn.
alter table regeling add column if not exists payload_hash text;
alter table regeling add column if not exists voor_het_eerst_gezien timestamptz default now();
alter table regeling add column if not exists laatst_gezien timestamptz default now();
alter table regeling add column if not exists hercontrole_termijn integer not null default 12;

alter table regeling drop constraint if exists regeling_hercontrole_positief;
alter table regeling add constraint regeling_hercontrole_positief
  check (hercontrole_termijn > 0);

comment on column regeling.payload_hash is
  'Hash van de brongegevens waaruit deze rij is opgebouwd (subsidie_snapshot-'
  'patroon, §2). Verschilt de hash bij een herimport, dan is de bron gewijzigd en '
  'moet de verrijking opnieuw.';
comment on column regeling.laatst_gezien is
  'Laatste moment waarop de bron deze regeling nog bevestigde. Samen met '
  'hercontrole_termijn de basis voor "dit record is verlopen".';
comment on column regeling.hercontrole_termijn is
  'Aantal maanden tot hercontrole. Twaalf als basis, korter bij deadlines (§2).';

create index if not exists regeling_versheid_idx on regeling (laatst_gezien);
create index if not exists regeling_soort_bron_idx on regeling (soort_bron, benaderbaarheid);

-- ------------------------------------------------------------
-- 8. §2 — drie-waardige uitkomst op criteria
-- ------------------------------------------------------------
-- Bij fondsen is "niet gepubliceerd" de meest voorkomende waarde. Leest de
-- matcher NULL als "voldoet niet", dan verdwijnen goede fondsen; leest hij het
-- als "voldoet wel", dan krijg je valse hoop. Daarom een expliciete derde stand.
alter table regeling_criterium
  add column if not exists uitkomst text not null default 'onbekend'
    check (uitkomst in ('ja','nee','onbekend'));

alter table regeling_criterium
  add column if not exists uitkomst_toelichting text;

comment on column regeling_criterium.uitkomst is
  'Wat we over dit criterium bij de BRON hebben vastgesteld: ja = de bron stelt '
  'deze eis aantoonbaar, nee = de bron stelt hem aantoonbaar niet, onbekend = niet '
  'gepubliceerd (§2). ''onbekend'' hoort een zichtbare actie op te leveren ("dit '
  'moeten we navragen") en mag nooit stilletjes een kant op vallen. Nieuwe rijen '
  'beginnen op ''onbekend'' — dat is de eerlijke beginstand.';

comment on column regeling_criterium.uitkomst_toelichting is
  'Waarop de uitkomst berust; bij voorkeur een letterlijk bronvcitaat.';

-- Herkomst-waarden gelijktrekken met regeling (§2): ook op criteria en bewijs
-- moet zichtbaar zijn of iets geverifieerd is of uit een tag is afgeleid.
alter table regeling_criterium drop constraint if exists regeling_criterium_herkomst_check;
alter table regeling_criterium add constraint regeling_criterium_herkomst_check
  check (herkomst in ('ai','handmatig','import','afgeleid_tag','geverifieerd_bron','ai_voorstel'));

alter table regeling_bewijs drop constraint if exists regeling_bewijs_herkomst_check;
alter table regeling_bewijs add constraint regeling_bewijs_herkomst_check
  check (herkomst in ('ai','handmatig','import','afgeleid_tag','geverifieerd_bron','ai_voorstel'));

-- ------------------------------------------------------------
-- 8b. §4 — regeling_bewijs: wat moet er geleverd worden, en door wie?
-- ------------------------------------------------------------
alter table regeling_bewijs
  add column if not exists fase text not null default 'bij_aanvraag'
    check (fase in ('vooraf','bij_aanvraag','achteraf'));

alter table regeling_bewijs
  add column if not exists verplichtheid text not null default 'verplicht'
    check (verplichtheid in ('verplicht','aanbevolen','soms'));

alter table regeling_bewijs
  add column if not exists zelf_op_te_stellen boolean;

alter table regeling_bewijs
  add column if not exists doorlooptijd_indicatie text;

alter table regeling_bewijs
  add column if not exists vereiste_type text not null default 'overig'
    check (vereiste_type in (
      'projectplan','begroting','dekkingsplan','offerte','kostenraming',
      'jaarrekening','jaarverslag','statuten','kvk_uittreksel','anbi_bewijs',
      'bestuurssamenstelling','bankgegevens','eigendomsbewijs','vergunning',
      'monumentgegevens','beheerplan','fotos','steunbrief','aanvraagformulier',
      'overig'
    ));

alter table regeling_bewijs
  add column if not exists bron_tekst text;

comment on column regeling_bewijs.zelf_op_te_stellen is
  'true = dit maakt het platform (projectplan, begroting, aanvraagbrief). '
  'false = dit moet de gebruiker extern regelen (offerte, vergunning, '
  'accountantsverklaring) — reken op doorlooptijd. NULL = nog niet bepaald. '
  'Sleutelveld voor de twee stapels op het dashboard (§4).';
comment on column regeling_bewijs.doorlooptijd_indicatie is
  'Hoe lang het duurt om een extern stuk te krijgen. Een omgevingsvergunning '
  'duurt maanden en bepaalt daarmee vaak de haalbaarheid (§4).';
comment on column regeling_bewijs.vereiste_type is
  'Genormaliseerd type, afgeleid uit de vrije tekst van de bron. ''overig'' als de '
  'tekst niet betrouwbaar te splitsen was — dan staat de originele zin in '
  'bron_tekst en wordt er niets gegokt.';
comment on column regeling_bewijs.bron_tekst is
  'De letterlijke zin of zinsnede uit de bron waar deze rij uit komt.';

-- ------------------------------------------------------------
-- 8c. Contactgegevens van de verstrekker
-- ------------------------------------------------------------
alter table regeling add column if not exists contact text;
comment on column regeling.contact is
  'Contactgegevens zoals de bron ze publiceert (e-mail, telefoon, soms een naam). '
  'LET OP (§9 slot): contactpersonen bij fondsen zijn persoonsgegevens onder de '
  'AVG — niet herpubliceren, alleen intern gebruiken.';

-- ------------------------------------------------------------
-- 8d. §5 — regio_alias: regionamen naar gemeenten (leeg in fase 1)
-- ------------------------------------------------------------
-- "Kennemerland", "Zaanstreek", "Groot-Rijnmond", "Noord-Oost Veluwe": werk-
-- gebieden die niet met een gemeentecode te vangen zijn. De tabel bestaat nu al
-- zodat geo_waarden een plek heeft om naartoe te vertalen; vullen gebeurt in
-- fase 2 (de poort), want pas daar wordt er echt op getoetst.
create table if not exists regio_alias (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  provincie text,
  gemeenten text[] not null default '{}',
  bron text,
  herkomst text not null default 'handmatig'
    check (herkomst in ('handmatig','ai_voorstel','geverifieerd_bron')),
  geaccordeerd boolean not null default false,
  aangemaakt_op timestamptz default now(),
  unique (alias)
);

comment on table regio_alias is
  'Vertaalt een regionaam uit regeling.geo_waarden naar concrete gemeenten (§5). '
  'Fase 1 legt alleen de tabel aan; zolang een alias hier ontbreekt is de '
  'geografische toets voor die bron ONBEKEND en niet "voldoet niet".';

-- ------------------------------------------------------------
-- 9. Welke bronnen zijn per fonds gelezen? (voorbereiding verdiepingsslag)
-- ------------------------------------------------------------
-- Nog niet vullen. Dit is de administratie achter matchbaarheid: van Stichting
-- Aurelia is het beleidsplan geanalyseerd, van de meeste fondsen niets meer dan
-- een tag. Zonder deze tabel is niet te zien waar dat verschil zit.
create table if not exists regeling_bronlezing (
  id uuid primary key default gen_random_uuid(),
  regeling_id uuid not null references regeling(id) on delete cascade,
  soort text not null check (soort in (
    'website','beleidsplan','jaarverslag','jaarrekening','statuten',
    'anbi_publicatie','aanvraagvoorwaarden','telefonisch_contact','overig'
  )),
  jaar integer check (jaar is null or jaar between 1900 and 2200),
  url text,
  document_id uuid references document(id) on delete set null,
  gelezen_op date,
  samenvatting text,
  herkomst text not null default 'handmatig'
    check (herkomst in ('handmatig','ai_voorstel','geverifieerd_bron')),
  geaccordeerd boolean not null default false,
  aangemaakt_op timestamptz default now(),
  unique (regeling_id, soort, jaar)
);
create index if not exists regeling_bronlezing_regeling_idx on regeling_bronlezing (regeling_id);

comment on table regeling_bronlezing is
  'Per bron: welke stukken zijn daadwerkelijk gelezen (website, beleidsplan, '
  'jaarverslag + jaar). Voedt matchbaarheid en maakt de verdiepingsslag per fonds '
  'plaatsbaar. Fase 1 maakt alleen de tabel; vullen gebeurt bij de verdieping.';

-- ------------------------------------------------------------
-- 10. §10 — module fondsenradar naast subsidieradar
-- ------------------------------------------------------------
create or replace function landgoed_aanmaken(p_naam text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  nieuw_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;
  if coalesce(trim(p_naam), '') = '' then
    raise exception 'Naam is verplicht';
  end if;

  insert into landgoed (naam) values (trim(p_naam)) returning id into nieuw_id;

  insert into lidmaatschap (landgoed_id, gebruiker_id, rol)
    values (nieuw_id, auth.uid(), 'eigenaar');

  insert into module_instelling (landgoed_id, module, actief) values
    (nieuw_id, 'dashboard',          true),
    (nieuw_id, 'stamgegevens',       true),
    (nieuw_id, 'documenten',         true),
    (nieuw_id, 'taken',              true),
    (nieuw_id, 'contacten',          true),
    (nieuw_id, 'contracten',         true),
    (nieuw_id, 'subsidieradar',      true),
    (nieuw_id, 'fondsenradar',       true),
    (nieuw_id, 'omgevingsradar',     true),
    (nieuw_id, 'financieel_inzicht', true),
    (nieuw_id, 'incidenten',         true),
    (nieuw_id, 'vergaderingen',      true);

  return nieuw_id;
end;
$$;

grant execute on function landgoed_aanmaken(text) to authenticated;

-- Bestaande landgoederen de nieuwe module-vlag geven (idempotent).
insert into module_instelling (landgoed_id, module, actief)
select id, 'fondsenradar', true from landgoed
on conflict (landgoed_id, module) do nothing;

-- ------------------------------------------------------------
-- 11. Bronregister: het handmatige fondsenbestand
-- ------------------------------------------------------------
-- De 103 fondsen komen uit een export, niet uit een API. Toch via subsidie_bron,
-- zodat de idempotente snapshot-/run-administratie van 0012 hergebruikt wordt.
-- bestuurslaag blijft NULL: dit is geen overheidslaag (§1).
insert into subsidie_bron (sleutel, naam, type, bestuurslaag, basis_url) values
  ('fondsen_handmatig', 'Fondsenoverzicht landgoederen (handmatige export)',
   'handmatig', null, null)
on conflict (sleutel) do nothing;

-- ------------------------------------------------------------
-- 12. RLS — nieuwe tabel volgens het bestaande catalogus-patroon
--     (0012 + aanscherping 0047: lezen alleen voor ingelogden)
-- ------------------------------------------------------------
alter table regeling_bronlezing enable row level security;
alter table regio_alias enable row level security;

drop policy if exists "regio_alias zien" on regio_alias;
create policy "regio_alias zien" on regio_alias
  for select to authenticated using (true);

drop policy if exists "regio_alias beheren" on regio_alias;
create policy "regio_alias beheren" on regio_alias for all
  using (is_admin()) with check (is_admin());

drop policy if exists "bronlezing zien" on regeling_bronlezing;
create policy "bronlezing zien" on regeling_bronlezing
  for select to authenticated using (true);

drop policy if exists "bronlezing beheren" on regeling_bronlezing;
create policy "bronlezing beheren" on regeling_bronlezing for all
  using (is_admin()) with check (is_admin());
