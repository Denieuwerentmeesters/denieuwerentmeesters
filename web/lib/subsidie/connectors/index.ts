import type { Connector } from "../connectors";
import { rvoConnector } from "./rvo";
import { koopCvdrConnector, koopPublicatiesConnector } from "./koop";

// Register hier elke connector op bron-sleutel (== subsidie_bron.sleutel).
export const CONNECTORS: Record<string, Connector> = {
  [rvoConnector.bronSleutel]: rvoConnector,
  [koopCvdrConnector.bronSleutel]: koopCvdrConnector,
  [koopPublicatiesConnector.bronSleutel]: koopPublicatiesConnector,
};

export function connectorsVoor(sleutel?: string | null): Connector[] {
  if (sleutel) {
    const c = CONNECTORS[sleutel];
    return c ? [c] : [];
  }
  return Object.values(CONNECTORS);
}
