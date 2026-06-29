const RAW = import.meta.env.BASE_URL || "/";

/** Préfixe un chemin interne avec la base du site (utile pour GitHub Pages). */
export function withBase(path = "/"): string {
  const base = RAW.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
