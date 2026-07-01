"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

const SCOPES = [
  { key: "nationaal", label: "Nationaal" },
  { key: "provinciaal", label: "Provinciaal" },
  { key: "gemeentelijk", label: "Gemeentelijk" },
];

const DOELGROEPEN = [
  { key: "eigenaar", label: "Voor mij (eigenaar)" },
  { key: "pachter", label: "Via mijn pachter" },
  { key: "beiden", label: "Eigenaar + pachter" },
];

export function SubsidieFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const actieveScope = params.get("scope") ?? "";
  const actieveDoelgroep = params.get("doelgroep") ?? "";

  const toggle = useCallback(
    (param: string, waarde: string) => {
      const p = new URLSearchParams(params.toString());
      if (p.get(param) === waarde) p.delete(param);
      else p.set(param, waarde);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const reset = () => router.replace(pathname, { scroll: false });
  const heeftFilter = actieveScope || actieveDoelgroep;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--text-3)" }}>
        Aanvrager:
      </span>
      {DOELGROEPEN.map((d) => (
        <button
          key={d.key}
          onClick={() => toggle("doelgroep", d.key)}
          className={`tag cursor-pointer transition-opacity ${
            actieveDoelgroep === d.key ? "tag-green" : "tag-gray hover:opacity-70"
          }`}
        >
          {d.label}
        </button>
      ))}
      <span className="text-[12px] shrink-0 mx-1" style={{ color: "var(--text-3)" }}>·</span>
      <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--text-3)" }}>
        Niveau:
      </span>
      {SCOPES.map((s) => (
        <button
          key={s.key}
          onClick={() => toggle("scope", s.key)}
          className={`tag cursor-pointer transition-opacity ${
            actieveScope === s.key ? "tag-blue" : "tag-gray hover:opacity-70"
          }`}
        >
          {s.label}
        </button>
      ))}
      {heeftFilter && (
        <button
          onClick={reset}
          className="text-[12px] underline"
          style={{ color: "var(--text-3)" }}
        >
          wis filters
        </button>
      )}
    </div>
  );
}
