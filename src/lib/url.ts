const RAW = import.meta.env.BASE_URL || "/";

/**
 * Préfixe un chemin interne avec la base du site (utile pour GitHub Pages)
 * et garantit un slash final, pour rester cohérent avec trailingSlash: 'always'
 * et les URLs WordPress historiques (ex. /amenagement/).
 */
export function withBase(path = "/"): string {
  const base = RAW.replace(/\/$/, "");
  let p = path.startsWith("/") ? path : `/${path}`;
  if (!p.endsWith("/")) p += "/";
  return `${base}${p}` || "/";
}

/**
 * Même chose pour un fichier de `public/` (image, PDF), mais SANS slash final :
 * une image n'est pas une page. `withBase` en ajouterait un et le fichier
 * deviendrait introuvable, ce que `verifier-build.mjs` signale comme un lien
 * interne cassé.
 */
export function withBaseAsset(path: string): string {
  const base = RAW.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
