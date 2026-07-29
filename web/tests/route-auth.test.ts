// Tests voor de fail-closed autorisatiebeslissing van secret-beveiligde API-routes.
// De kern van "dicht de lekken": ontbreekt het geheim in productie, dan weigeren —
// niet stilzwijgend de deur openzetten.
import { describe, expect, it } from "vitest";
import { geautoriseerdMetSecret } from "@/lib/route-auth";

describe("geautoriseerdMetSecret", () => {
  it("weigert in productie als het geheim niet is gezet (fail-closed)", () => {
    expect(
      geautoriseerdMetSecret({ secretGezet: false, headerKlopt: false, isProductie: true }),
    ).toBe(false);
  });

  it("staat toe buiten productie als het geheim niet is gezet (lokaal testen)", () => {
    expect(
      geautoriseerdMetSecret({ secretGezet: false, headerKlopt: false, isProductie: false }),
    ).toBe(true);
  });

  it("staat toe als het geheim is gezet en de header klopt", () => {
    expect(
      geautoriseerdMetSecret({ secretGezet: true, headerKlopt: true, isProductie: true }),
    ).toBe(true);
  });

  it("weigert als het geheim is gezet maar de header niet klopt", () => {
    expect(
      geautoriseerdMetSecret({ secretGezet: true, headerKlopt: false, isProductie: true }),
    ).toBe(false);
  });

  it("weigert een onjuiste header ook buiten productie", () => {
    expect(
      geautoriseerdMetSecret({ secretGezet: true, headerKlopt: false, isProductie: false }),
    ).toBe(false);
  });
});
