import { describe, expect, it } from "vitest";
import {
  invMerc3857,
  labelPunt3857,
  merc3857,
  oppervlakte3857,
  splitsPolygoon3857,
} from "@/lib/geo";

// Vierkant van 100×100 (3857-eenheden), ergens midden in Nederland.
const X = 585000;
const Y = 6800000;
const vierkant = {
  type: "Polygon",
  coordinates: [
    [
      [X, Y],
      [X + 100, Y],
      [X + 100, Y + 100],
      [X, Y + 100],
      [X, Y],
    ],
  ],
};

describe("merc3857 / invMerc3857", () => {
  it("zijn elkaars inverse", () => {
    const [x, y] = merc3857(5.25, 52.1);
    const [lon, lat] = invMerc3857(x, y);
    expect(lon).toBeCloseTo(5.25, 6);
    expect(lat).toBeCloseTo(52.1, 6);
  });
});

describe("oppervlakte3857", () => {
  it("berekent een vierkant", () => {
    expect(oppervlakte3857(vierkant)).toBeCloseTo(100 * 100, 5);
  });

  it("trekt gaten af, ongeacht draairichting", () => {
    const metGat = {
      type: "Polygon",
      coordinates: [
        vierkant.coordinates[0],
        [
          [X + 20, Y + 20],
          [X + 40, Y + 20],
          [X + 40, Y + 40],
          [X + 20, Y + 40],
          [X + 20, Y + 20],
        ],
      ],
    };
    expect(oppervlakte3857(metGat)).toBeCloseTo(10000 - 400, 5);
  });

  it("telt MultiPolygon-vlakken op", () => {
    const dubbel = {
      type: "MultiPolygon",
      coordinates: [vierkant.coordinates, vierkant.coordinates],
    };
    expect(oppervlakte3857(dubbel)).toBeCloseTo(20000, 5);
  });

  it("is 0 voor onbruikbare invoer", () => {
    expect(oppervlakte3857(null)).toBe(0);
    expect(oppervlakte3857({})).toBe(0);
  });
});

describe("labelPunt3857", () => {
  it("kiest het midden van een vierkant", () => {
    const p = labelPunt3857(vierkant);
    expect(p?.[0]).toBeCloseTo(X + 50, 3);
    expect(p?.[1]).toBeCloseTo(Y + 50, 3);
  });

  it("valt bij een U-vorm binnen een van de poten (niet in het gat)", () => {
    // U-vorm: het middelpunt van de omtrek ligt in de opening.
    const u = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [30, 0],
          [30, 20],
          [20, 20],
          [20, 5],
          [10, 5],
          [10, 20],
          [0, 20],
          [0, 0],
        ],
      ],
    };
    const p = labelPunt3857(u);
    // Breedste doorsnede op y=10 is [0,10] (of [20,30]) — midden = 5.
    expect(p?.[1]).toBeCloseTo(10, 5);
    expect(p && (p[0] < 10 || p[0] > 20)).toBe(true);
  });

  it("is null voor onbruikbare invoer", () => {
    expect(labelPunt3857(null)).toBeNull();
    expect(labelPunt3857({})).toBeNull();
  });
});

describe("splitsPolygoon3857", () => {
  it("splitst een vierkant in twee gelijke delen", () => {
    const delen = splitsPolygoon3857(vierkant, [
      [X + 50, Y - 10],
      [X + 50, Y + 110],
    ]);
    expect(delen).toHaveLength(2);
    const opp = delen.map((d) => oppervlakte3857(d));
    expect(opp[0] + opp[1]).toBeCloseTo(10000, 3);
    expect(opp[0] / 10000).toBeCloseTo(0.5, 3);
  });

  it("splitst in drie delen als de lijn twee keer snijdt", () => {
    // Zigzag: in en uit en weer in.
    const delen = splitsPolygoon3857(vierkant, [
      [X + 25, Y - 10],
      [X + 25, Y + 110],
      [X + 75, Y + 110],
      [X + 75, Y - 10],
    ]);
    expect(delen.length).toBeGreaterThanOrEqual(3);
    const som = delen.reduce((s, d) => s + oppervlakte3857(d), 0);
    expect(som).toBeCloseTo(10000, 3);
  });

  it("geeft één deel terug als de lijn niet doorsnijdt", () => {
    const delen = splitsPolygoon3857(vierkant, [
      [X - 50, Y - 50],
      [X - 10, Y - 10],
    ]);
    expect(delen.length).toBeLessThanOrEqual(1);
  });

  it("weigert MultiPolygon en te korte lijnen", () => {
    const mp = { type: "MultiPolygon", coordinates: [vierkant.coordinates] };
    expect(splitsPolygoon3857(mp, [[X, Y], [X + 1, Y]])).toEqual([]);
    expect(splitsPolygoon3857(vierkant, [[X, Y]])).toEqual([]);
  });
});
