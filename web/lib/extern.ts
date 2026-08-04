// Fetch naar een externe bron (PDOK, RCE, KOOP, RVO, ...) met een harde
// tijdslimiet (issue #8). Zonder limiet kan één haperende bron een server
// action minutenlang laten hangen; met limiet faalt hij snel en netjes,
// zodat de gebruiker "bron niet bereikbaar" te zien krijgt in plaats van
// een bevroren scherm.
export function fetchExtern(
  url: string | URL,
  init?: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
