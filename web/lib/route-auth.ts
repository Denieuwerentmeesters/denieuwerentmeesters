// Fail-closed autorisatiebeslissing voor secret-beveiligde API-routes.
//
// De regel (zoals subsidie/import die al hanteert):
//   - Is het verwachte geheim niet in de omgeving gezet, dan alléén toestaan
//     buiten productie (lokaal testen). In productie: weigeren.
//   - Is het geheim wel gezet, dan moet de meegestuurde header exact kloppen.
//
// Bewust een pure functie zodat de kritische beslissing te unit-testen is.
export function geautoriseerdMetSecret(opts: {
  secretGezet: boolean;
  headerKlopt: boolean;
  isProductie: boolean;
}): boolean {
  if (!opts.secretGezet) return !opts.isProductie;
  return opts.headerKlopt;
}
