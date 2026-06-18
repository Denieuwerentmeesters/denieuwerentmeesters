"use server";

import { revalidatePath } from "next/cache";
import { uploadDocument } from "../documenten/acties";
import {
  verrijkUitDocument,
  verrijkUitTransacties,
} from "../stamgegevens/acties";

function pad(landgoedId: string) {
  return `/landgoed/${landgoedId}/onboarding`;
}

// Wrappers die ook de wizard-pagina verversen (de onderliggende acties
// reval­ideren hun eigen module-pad).
export async function uploadBron(fd: FormData) {
  await uploadDocument(fd);
  revalidatePath(pad(String(fd.get("landgoed_id"))));
}

export async function verrijkDoc(fd: FormData) {
  await verrijkUitDocument(fd);
  revalidatePath(pad(String(fd.get("landgoed_id"))));
}

export async function verrijkTx(fd: FormData) {
  await verrijkUitTransacties(fd);
  revalidatePath(pad(String(fd.get("landgoed_id"))));
}
