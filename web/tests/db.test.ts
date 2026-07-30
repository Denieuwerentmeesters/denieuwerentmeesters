// Tests voor de datalaag-helper die databasefouten afdwingt (issue #4).
// Een stille regressie hier betekent dat schrijffouten weer onzichtbaar worden.
import { describe, it, expect } from "vitest";
import { moet } from "@/lib/db";

describe("moet", () => {
  it("geeft data terug als er geen fout is", async () => {
    const data = await moet(Promise.resolve({ data: { id: "x" }, error: null }));
    expect(data).toEqual({ id: "x" });
  });

  it("gooit met label én bericht bij een fout", async () => {
    await expect(
      moet(
        Promise.resolve({ data: null, error: { message: "RLS weigert" } }),
        "taak opslaan",
      ),
    ).rejects.toThrow("taak opslaan mislukt: RLS weigert");
  });

  it("gooit zonder label enkel het bericht", async () => {
    await expect(
      moet(Promise.resolve({ data: null, error: { message: "kapot" } })),
    ).rejects.toThrow("kapot");
  });
});
