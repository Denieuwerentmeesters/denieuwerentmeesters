-- 0019: "lijkt op bestaand object"-hint voor AI-voorstellen.
-- Bij extractie kan de AI markeren dat een voorgesteld object overlapt met een
-- bestaand object. De gebruiker ziet dan een waarschuwing + knop "Samenvoegen".
-- Alleen relevant zolang geaccordeerd=false; bij accorderen/samenvoegen wordt het genegeerd.

alter table stamobject
  add column if not exists lijkt_op_id uuid references stamobject(id) on delete set null;
