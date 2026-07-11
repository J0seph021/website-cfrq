// Courbe de production Pothier-Savard : volume marchand brut (m3/ha) selon l'âge,
// interpolée entre les classes d'IQS publiées. Fournit aussi l'âge de maturité
// biologique (culmination de l'AAM) et l'âge du sommet de volume (début de la
// décroissance nette / sénescence).
import psData from "./data/pothier-savard.json" with { type: "json" };
import type { CodePS, Densite } from "./especes.ts";

type Table = {
  ages_totaux: number[];
  V9: (number | null)[];
  maturite_bio: number | null;
  pic_volume_age: number | null;
  pic_volume_V9: number | null;
  ans_pour_1m: number;
};
type Tables = Record<CodePS, Record<Densite, Record<string, Table>>>;

const TABLES = (psData as { tables: Tables }).tables;

// Interpolation linéaire d'une série (x croissant) au point xq, sans extrapoler.
function interp(xs: number[], ys: (number | null)[], xq: number): number | null {
  const pts = xs.map((x, i) => [x, ys[i]] as const).filter((p) => p[1] != null) as [number, number][];
  if (pts.length === 0) return null;
  if (xq <= pts[0][0]) return xq <= 0 ? 0 : pts[0][1] * (xq / pts[0][0]); // sous la 1re mesure : rampe vers 0
  if (xq >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (xq <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (xq - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// Classes d'IQS disponibles pour une essence/densité, triées.
function classesIqs(esp: CodePS, dens: Densite): number[] {
  return Object.keys(TABLES[esp]?.[dens] ?? {}).map(Number).sort((a, b) => a - b);
}

// Encadre l'IQS demandé par deux classes publiées (avec poids d'interpolation).
function encadre(classes: number[], iqs: number): { lo: number; hi: number; t: number } {
  if (classes.length === 0) return { lo: NaN, hi: NaN, t: 0 };
  if (iqs <= classes[0]) return { lo: classes[0], hi: classes[0], t: 0 };
  if (iqs >= classes[classes.length - 1]) {
    const last = classes[classes.length - 1];
    return { lo: last, hi: last, t: 0 };
  }
  for (let i = 1; i < classes.length; i++) {
    if (iqs <= classes[i]) {
      const lo = classes[i - 1], hi = classes[i];
      return { lo, hi, t: (iqs - lo) / (hi - lo) };
    }
  }
  const last = classes[classes.length - 1];
  return { lo: last, hi: last, t: 0 };
}

export type Courbe = {
  espece: CodePS;
  densite: Densite;
  iqs: number;
  points: { age: number; volume: number }[]; // volume marchand brut m3/ha
  maturiteBio: number | null;                // âge culmination AAM
  picVolumeAge: number | null;               // âge du sommet de volume
  picVolumeM3: number | null;
  ans1m: number;
  ageMax: number;
};

// Valeur de la courbe à un âge donné (interpolée en IQS puis en âge).
export function volumeAAge(esp: CodePS, dens: Densite, iqs: number, age: number): number | null {
  const tabs = TABLES[esp]?.[dens];
  if (!tabs) return null;
  const classes = classesIqs(esp, dens);
  const { lo, hi, t } = encadre(classes, iqs);
  if (Number.isNaN(lo)) return null;
  const vLo = interp(tabs[String(lo)].ages_totaux, tabs[String(lo)].V9, age);
  if (lo === hi) return vLo;
  const vHi = interp(tabs[String(hi)].ages_totaux, tabs[String(hi)].V9, age);
  if (vLo == null || vHi == null) return vLo ?? vHi;
  return vLo + (vHi - vLo) * t;
}

// Construit la courbe complète (échantillonnée à pas de 5 ans) + repères.
export function construireCourbe(esp: CodePS, dens: Densite, iqs: number): Courbe | null {
  const tabs = TABLES[esp]?.[dens];
  if (!tabs) return null;
  const classes = classesIqs(esp, dens);
  const { lo, hi, t } = encadre(classes, iqs);
  if (Number.isNaN(lo)) return null;
  const tLo = tabs[String(lo)], tHi = tabs[String(hi)];

  const lerp = (a: number | null, b: number | null): number | null =>
    a == null ? b : b == null ? a : a + (b - a) * t;

  const ageMax = Math.max(
    tLo.ages_totaux[tLo.ages_totaux.length - 1],
    tHi.ages_totaux[tHi.ages_totaux.length - 1],
  );
  const points: { age: number; volume: number }[] = [];
  for (let age = 0; age <= ageMax; age += 5) {
    const v = volumeAAge(esp, dens, iqs, age);
    if (v != null) points.push({ age, volume: Math.round(v * 10) / 10 });
  }
  return {
    espece: esp,
    densite: dens,
    iqs,
    points,
    maturiteBio: lo === hi ? tLo.maturite_bio : Math.round((lerp(tLo.maturite_bio, tHi.maturite_bio) ?? 0)),
    picVolumeAge: lo === hi ? tLo.pic_volume_age : Math.round((lerp(tLo.pic_volume_age, tHi.pic_volume_age) ?? 0)),
    picVolumeM3: lo === hi ? tLo.pic_volume_V9 : lerp(tLo.pic_volume_V9, tHi.pic_volume_V9),
    ans1m: tLo.ans_pour_1m,
    ageMax,
  };
}
