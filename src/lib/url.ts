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
