"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function uitloggen() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function nieuwLandgoed(formData: FormData) {
  const naam = String(formData.get("naam") ?? "").trim();
  if (!naam) return;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("landgoed_aanmaken", {
    p_naam: naam,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/landgoederen");
  redirect(`/landgoed/${data}/overzicht`);
}
