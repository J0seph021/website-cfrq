// Vérification du moteur de valeur TS contre la FIXTURE DORÉE partagée (générée par
// la version Python). Garantit que Python et TypeScript produisent EXACTEMENT le même
// résultat. Lancer :  node src/lib/valeur/__verify.ts
import { valeurPeuplements, type Peuplement, type PrixEssence, type Params } from "./valeurBois.ts";
import fixture from "./fixture_valeur_bois.json" with { type: "json" };

type Cas = {
  name: string;
  peuplements: Peuplement[];
  prix_resolu: Record<string, PrixEssence>;
  params?: Params;
  expected: unknown;
};

// Égalité profonde tolérante aux flottants (1e-9) — évite un faux échec sur un
// dernier bit près, tout en attrapant toute vraie divergence de calcul.
function egal(a: any, b: any, chemin = ""): string | null {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= 1e-9 ? null : `${chemin}: ${a} != ${b}`;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${chemin}: type tableau`;
    if (a.length !== b.length) return `${chemin}: longueur ${a.length} != ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const e = egal(a[i], b[i], `${chemin}[${i}]`);
      if (e) return e;
    }
    return null;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.join(",") !== kb.join(",")) return `${chemin}: clés {${ka}} != {${kb}}`;
    for (const k of ka) {
      const e = egal(a[k], b[k], chemin ? `${chemin}.${k}` : k);
      if (e) return e;
    }
    return null;
  }
  return a === b ? null : `${chemin}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

let ok = 0;
const echecs: string[] = [];
for (const c of fixture as Cas[]) {
  const res = valeurPeuplements(c.peuplements, c.prix_resolu, c.params);
  const diff = egal(res, c.expected);
  if (diff) echecs.push(`✗ ${c.name}\n    ${diff}`);
  else ok++;
}

console.log(`Fixture dorée valeur du bois : ${ok}/${(fixture as Cas[]).length} cas identiques Python↔TS`);
if (echecs.length) {
  console.error(echecs.join("\n"));
  process.exit(1);
}
console.log("OK — le moteur TypeScript reproduit exactement le moteur Python.");
