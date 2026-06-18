import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function over(dagen: number) {
  const d = new Date();
  d.setDate(d.getDate() + dagen);
  return d.toISOString().slice(0, 10);
}

export default async function OverzichtPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const binnen90 = over(90);
  const vandaag = new Date().toISOString().slice(0, 10);

  const [openTaken, contacten, contracten, aflopend, indexatie] =
    await Promise.all([
      supabase
        .from("taak")
        .select("id", { count: "exact", head: true })
        .eq("landgoed_id", id)
        .eq("status", "open"),
      supabase
        .from("relatie")
        .select("id", { count: "exact", head: true })
        .eq("landgoed_id", id),
      supabase
        .from("contract")
        .select("id", { count: "exact", head: true })
        .eq("landgoed_id", id),
      supabase
        .from("contract")
        .select("id", { count: "exact", head: true })
        .eq("landgoed_id", id)
        .gte("einddatum", vandaag)
        .lte("einddatum", binnen90),
      supabase
        .from("contract")
        .select("id", { count: "exact", head: true })
        .eq("landgoed_id", id)
        .gte("volgende_indexatie", vandaag)
        .lte("volgende_indexatie", binnen90),
    ]);

  const kpis = [
    {
      label: "Open taken",
      waarde: openTaken.count ?? 0,
      href: `/landgoed/${id}/taken`,
    },
    {
      label: "Contacten",
      waarde: contacten.count ?? 0,
      href: `/landgoed/${id}/contacten`,
    },
    {
      label: "Contracten",
      waarde: contracten.count ?? 0,
      href: `/landgoed/${id}/contracten`,
    },
    {
      label: "Loopt af < 90 dagen",
      waarde: (aflopend.count ?? 0) + (indexatie.count ?? 0),
      href: `/landgoed/${id}/contracten`,
      let: (aflopend.count ?? 0) + (indexatie.count ?? 0) > 0,
    },
  ];

  return (
    <div className="flex flex-col">
      <div
        className="bg-white px-7 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
          {vandaag}
        </div>
      </div>

      <div className="p-7">
        <header className="mb-6">
          <h1 className="text-[22px] font-bold">Overzicht</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            De stand van zaken in één oogopslag.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <Link key={k.label} href={k.href} className="card block p-5">
              <div className="label-up mb-2">{k.label}</div>
              <div
                className="text-[28px] font-bold"
                style={{ color: k.let ? "var(--amber)" : "var(--text)" }}
              >
                {k.waarde}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
