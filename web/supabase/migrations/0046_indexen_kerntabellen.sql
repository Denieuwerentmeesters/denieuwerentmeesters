-- Indexen op de kerntabellen (issue #6).
--
-- Vrijwel elke query in de app filtert op landgoed_id (multi-tenant).
-- Zonder index betekent dat een volledige tabel-scan zodra er meer
-- landgoederen en meer data zijn. Puur additief en idempotent; bestaande
-- data wordt niet geraakt. Tabellen die al een landgoed-index hadden
-- (kadastraal_perceel, beheerperceel_kadastraal, verband, omgeving_run)
-- staan hier bewust niet nogmaals in.

create index if not exists document_landgoed_idx       on document (landgoed_id);
create index if not exists perceel_landgoed_idx        on perceel (landgoed_id);
create index if not exists contract_landgoed_idx       on contract (landgoed_id);
create index if not exists taak_landgoed_idx           on taak (landgoed_id);
create index if not exists agenda_item_landgoed_idx    on agenda_item (landgoed_id);
create index if not exists relatie_landgoed_idx        on relatie (landgoed_id);
create index if not exists stamobject_landgoed_idx     on stamobject (landgoed_id);
create index if not exists gesprek_landgoed_idx        on gesprek (landgoed_id);
create index if not exists subsidie_landgoed_idx       on subsidie (landgoed_id);
create index if not exists transactie_landgoed_idx     on transactie (landgoed_id);
create index if not exists vergadering_landgoed_idx    on vergadering (landgoed_id);
create index if not exists landgoed_inbox_landgoed_idx on landgoed_inbox (landgoed_id);
create index if not exists notitie_landgoed_idx        on notitie (landgoed_id);

-- Lidmaatschap wordt bij vrijwel elke RLS-check per gebruiker geraadpleegd.
create index if not exists lidmaatschap_gebruiker_idx  on lidmaatschap (gebruiker_id);
