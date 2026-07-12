// Moteur Valeur du bois PAR ESSENCE — cœur partagé (TypeScript).
// MIROIR EXACT de Portrait-forets-clients/moteurs/valeur_bois_essence.py : mêmes
// constantes, même arrondi, même ordre déterministe -> les deux passent la même
// FIXTURE DORÉE (fixture_valeur_bois.json). Ne jamais faire diverger l'un sans l'autre.
//
// Croise le VOLUME par essence (composition, m³/HA) × la SUPERFICIE × le PRIX par
// essence (déjà résolu) -> volumes ventilés sciage/pâte + valeur brute + valeur nette
// (peut être négative). La RÉSOLUTION de prix (crosswalk) est séparée, en amont.
// PIÈGE CLÉ : composition est en m³/HA -> toujours × superficie.

export type Classe = "resineux" | "feuillu";

// Partition 13 résineux / 26 feuillus (miroir de prixbois_crosswalk.IEQM_TO_PRIX).
export const CLASSE_ESSENCE: Record<string, Classe> = {
  SAB: "resineux", EPB: "resineux", EPN: "resineux", EPR: "resineux", EPO: "resineux",
  PIG: "resineux", PIB: "resineux", PIR: "resineux", PIS: "resineux", MEL: "resineux",
  MEH: "resineux", PRU: "resineux", THO: "resineux",
  BOP: "feuillu", BOJ: "feuillu", BOG: "feuillu", ERS: "feuillu", ERR: "feuillu",
  ERA: "feuillu", PET: "feuillu", PEG: "feuillu", PED: "feuillu", PEH: "feuillu",
  PEB: "feuillu", CHR: "feuillu", CHB: "feuillu", CHG: "feuillu", FRA: "feuillu",
  FRN: "feuillu", FRP: "feuillu", HEG: "feuillu", TIL: "feuillu", CET: "feuillu",
  CAC: "feuillu", OSV: "feuillu", ORA: "feuillu", ORR: "feuillu", ORT: "feuillu",
  NOC: "feuillu",
};

export const NOM_ESSENCE: Record<string, string> = {
  SAB: "Sapin baumier", EPB: "Épinette blanche", EPN: "Épinette noire",
  EPR: "Épinette rouge", EPO: "Épinette de Norvège", PIB: "Pin blanc",
  PIG: "Pin gris", PIR: "Pin rouge", PIS: "Pin sylvestre", MEL: "Mélèze laricin",
  MEH: "Mélèze hybride", PRU: "Pruche du Canada", THO: "Thuya (cèdre)",
  BOP: "Bouleau à papier", BOJ: "Bouleau jaune (merisier)", BOG: "Bouleau gris",
  ERS: "Érable à sucre", ERR: "Érable rouge", ERA: "Érable argenté",
  PET: "Peuplier faux-tremble", PEG: "Peuplier à grandes dents",
  PEB: "Peuplier baumier", PED: "Peuplier deltoïde", PEH: "Peuplier hybride",
  HEG: "Hêtre à grandes feuilles", TIL: "Tilleul d'Amérique", CET: "Cerisier tardif",
  CAC: "Caryer cordiforme", FRA: "Frêne d'Amérique", FRN: "Frêne noir",
  FRP: "Frêne rouge", CHR: "Chêne rouge", CHB: "Chêne blanc", CHG: "Chêne à gros fruits",
  ORA: "Orme d'Amérique", ORR: "Orme rouge", ORT: "Orme liège",
  OSV: "Ostryer de Virginie", NOC: "Noyer cendré",
};

export type PrixEssence = { sciage: number | null; pate: number | null };
export type Peuplement = { composition: Record<string, number>; superficie_ha: number };
export type Params = {
  ratio_resineux_sciage?: number;
  ratio_feuillu_sciage?: number;
  transport_m3?: number;
  cout_recolte_m3?: number;
  cout_recolte_pct?: number | null;
};

// Ventilation : résineux 70 % sciage (reste pâte), feuillu = pâte (règle JM).
// Déductions du net à 0 par défaut (net = brut tant que le client n'a pas saisi
// ses coûts — logique B3 « le client remplit »).
const PARAMS_DEFAUT: Required<Params> = {
  ratio_resineux_sciage: 0.70,
  ratio_feuillu_sciage: 0.0,
  transport_m3: 0.0,
  cout_recolte_m3: 0.0,
  cout_recolte_pct: null,
};

// Arrondi « moitié loin de zéro », IDENTIQUE à la version Python (pas banquier).
function r(x: number, n: number): number {
  const f = 10 ** n;
  return x >= 0 ? Math.floor(x * f + 0.5) / f : -Math.floor(-x * f + 0.5) / f;
}

const classe = (code: string): Classe => CLASSE_ESSENCE[code] ?? "feuillu";

export type Resultat = {
  volumes: {
    total_m3: number; sciage_m3: number; pate_m3: number;
    par_essence: { code: string; nom: string; classe: Classe; m3: number; sciage_m3: number; pate_m3: number }[];
  };
  valeur: {
    brut: number; transport: number; recolte: number; net: number;
    prix_manquants: string[];
    par_essence: { code: string; brut: number }[];
  };
  params: Required<Params>;
};

export function valeurPeuplements(
  peuplements: Peuplement[],
  prixResolu: Record<string, PrixEssence>,
  params?: Params,
): Resultat {
  const p: Required<Params> = { ...PARAMS_DEFAUT };
  if (params) for (const k of Object.keys(params) as (keyof Params)[]) {
    const v = params[k];
    if (v !== undefined && (v !== null || k === "cout_recolte_pct")) (p as any)[k] = v;
  }

  // 1. Agréger le volume par essence : vmb_ha × superficie_ha (m³/HA -> m³ total).
  const vol: Record<string, number> = {};
  for (const peup of peuplements) {
    const ha = Number(peup.superficie_ha) || 0;
    for (const [code, vmbHa] of Object.entries(peup.composition || {})) {
      const v = (Number(vmbHa) || 0) * ha;
      if (v > 0) vol[code] = (vol[code] || 0) + v;
    }
  }
  const codes = Object.keys(vol).sort(); // ordre déterministe (mêmes sommes qu'en Python)

  const parEssVol: Resultat["volumes"]["par_essence"] = [];
  const parEssVal: Resultat["valeur"]["par_essence"] = [];
  let totM3 = 0, totSci = 0, totPate = 0, brut = 0;
  const manquants: string[] = [];

  for (const code of codes) {
    const v = vol[code];
    const cl = classe(code);
    const ratioSci = cl === "resineux" ? p.ratio_resineux_sciage : p.ratio_feuillu_sciage;
    const vSci = v * ratioSci;
    const vPate = v - vSci;

    const pr = prixResolu[code] || ({} as PrixEssence);
    const pSci = pr.sciage ?? null;
    const pPate = pr.pate ?? null;
    if (pSci === null && pPate === null) manquants.push(code);
    const b = vSci * (pSci ?? 0) + vPate * (pPate ?? 0);

    totM3 += v; totSci += vSci; totPate += vPate; brut += b;
    parEssVol.push({
      code, nom: NOM_ESSENCE[code] ?? code, classe: cl,
      m3: r(v, 1), sciage_m3: r(vSci, 1), pate_m3: r(vPate, 1),
    });
    parEssVal.push({ code, brut: r(b, 0) });
  }

  // 2. Net = brut - transport - récolte (peut être négatif).
  const transport = p.transport_m3 * totM3;
  const recolte = p.cout_recolte_pct !== null ? p.cout_recolte_pct * brut : p.cout_recolte_m3 * totM3;
  const net = brut - transport - recolte;

  parEssVol.sort((a, b2) => (b2.m3 - a.m3) || (a.code < b2.code ? -1 : a.code > b2.code ? 1 : 0));

  return {
    volumes: {
      total_m3: r(totM3, 1), sciage_m3: r(totSci, 1), pate_m3: r(totPate, 1),
      par_essence: parEssVol,
    },
    valeur: {
      brut: r(brut, 0), transport: r(transport, 0), recolte: r(recolte, 0), net: r(net, 0),
      prix_manquants: manquants, par_essence: parEssVal,
    },
    params: {
      ratio_resineux_sciage: p.ratio_resineux_sciage,
      ratio_feuillu_sciage: p.ratio_feuillu_sciage,
      transport_m3: p.transport_m3,
      cout_recolte_m3: p.cout_recolte_m3,
      cout_recolte_pct: p.cout_recolte_pct,
    },
  };
}
