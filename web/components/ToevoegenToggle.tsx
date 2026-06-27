"use client";

import { useState } from "react";

export function ToevoegenToggle({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-5">
      {!open && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOpen(true)}
        >
          + {label}
        </button>
      )}
      {open && (
        <div>
          <div className="card p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold">{label}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOpen(false)}
              >
                Annuleren
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
