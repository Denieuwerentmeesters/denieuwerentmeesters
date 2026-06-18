"use client";

import { useFormStatus } from "react-dom";

// Verzendknop die tijdens een lopende server-action een ronddraaiend
// kasteeltje toont — zodat je weet dat de AI bezig is en niet wegklikt.
export default function SubmitKnop({
  children,
  className,
  disabled = false,
  pendingTekst = "Bezig…",
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pendingTekst?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block animate-spin">🏰</span>
          {pendingTekst}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
