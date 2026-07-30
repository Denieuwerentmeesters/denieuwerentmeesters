// Dunne datalaag: dwingt af dat een Supabase-fout nooit stil wordt genegeerd.
//
// Probleem dat dit oplost: een schrijf-actie die `error` niet controleert, oogt
// als geslaagd terwijl RLS 'm weigerde of een constraint 'm blokkeerde. Wikkel
// elke query in `moet(...)`; bij een fout gooit die met een leesbare melding, die
// de dichtstbijzijnde error-boundary (app/(app)/error.tsx) aan de gebruiker toont.
//
//   const taak = await moet(
//     supabase.from("taak").insert({ ... }).select("id").single(),
//     "taak opslaan",
//   );
//
// Voor schrijf-acties zonder returnwaarde is `data` gewoon null — dat is prima.

type SupabaseResultaat<T> = { data: T; error: { message: string } | null };

// Geeft de data terug zonder null: als er geen fout was, is de rij er (bij
// `.single()`), en bij schrijf-acties zonder select is de returnwaarde toch niet
// in gebruik. Gebruik `moet` daarom NIET op `.maybeSingle()`, waar null een
// geldig "niet gevonden" is — handel die apart af.
export async function moet<T>(
  query: PromiseLike<SupabaseResultaat<T>>,
  waarbij?: string,
): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error) {
    throw new Error(
      waarbij ? `${waarbij} mislukt: ${error.message}` : error.message,
    );
  }
  return data as NonNullable<T>;
}
