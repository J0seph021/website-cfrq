import { useId, useMemo, useState } from "react";
import { AGENCES_CFRQ, COUVERTURE, NOMS_AGENCES } from "../data/couverture";
import { site } from "../data/site";
import { withBase } from "../lib/url";
import { mesurer } from "../lib/mesure";

// « CFRQ est-il actif chez vous? » : le visiteur choisit sa municipalité et
// apprend si elle est sur le territoire d'une agence qui accrédite CFRQ, donc
// si CFRQ peut y obtenir l'aide financière du PAMVFP. Données et méthode dans
// src/data/couverture.ts.

interface Entree {
  nom: string;
  mrc: string;
  agence: string;
  /** Forme normalisée du nom, pour la recherche. */
  cle: string;
}

/** Page de secteur où la municipalité est citée, calculée au build (clé : `${mrc}|${nom}`). */
export type LiensSecteurs = Record<string, { href: string; secteur: string }>;

const MAX_SUGGESTIONS = 8;

/** Sans accents ni ponctuation, « St » et « Ste » développés : « st-ferdinand » trouve « Saint-Ferdinand ». */
function normaliser(texte: string): string {
  return ` ${texte}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/ ste /g, " sainte ")
    .replace(/ st /g, " saint ")
    .replace(/\s+/g, " ")
    .trim();
}

const ENTREES: Entree[] = COUVERTURE.flatMap(([agence, mrc, noms]) =>
  noms.split(";").map((nom) => ({ nom, mrc, agence, cle: normaliser(nom) })),
).sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.mrc.localeCompare(b.mrc, "fr"));

/** Le nom qui commence par la saisie d'abord, puis un mot du nom, puis n'importe où. */
function chercher(saisie: string): Entree[] {
  const q = normaliser(saisie);
  if (q.length < 2) return [];
  const rang = (e: Entree) => (e.cle.startsWith(q) ? 0 : e.cle.includes(` ${q}`) ? 1 : e.cle.includes(q) ? 2 : -1);
  return ENTREES.map((e) => ({ e, r: rang(e) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .slice(0, MAX_SUGGESTIONS)
    .map((x) => x.e);
}

export default function VerifierSecteur({ liens }: { liens: LiensSecteurs }) {
  const id = useId();
  const [saisie, setSaisie] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const [choix, setChoix] = useState<Entree | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  const suggestions = useMemo(() => chercher(saisie), [saisie]);
  // Une fois la municipalité choisie, la liste reste fermée même si le champ
  // reprend le focus (retour dans l'onglet) : elle cacherait la réponse.
  const listeVisible = ouvert && suggestions.length > 0 && !choix;

  function choisir(e: Entree) {
    setChoix(e);
    setSaisie(e.nom);
    setOuvert(false);
    setIntrouvable(false);
    mesurer("verification_secteur", { resultat: AGENCES_CFRQ.includes(e.agence) ? "oui" : "non" });
  }

  function onKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setOuvert(true);
      setActif((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActif((i) => Math.max(i - 1, 0));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (suggestions[actif]) choisir(suggestions[actif]);
      else if (normaliser(saisie).length >= 2) setIntrouvable(true);
    } else if (ev.key === "Escape") {
      setOuvert(false);
    }
  }

  const present = choix ? AGENCES_CFRQ.includes(choix.agence) : false;
  const lien = choix ? liens[`${choix.mrc}|${choix.nom}`] : undefined;
  const agence = choix?.agence ? NOMS_AGENCES[choix.agence] : "";
  // « Lévis (Lévis) » ne dit rien : la MRC n'est ajoutée que si elle diffère.
  const lieu = choix ? (choix.mrc === choix.nom ? choix.nom : `${choix.nom} (${choix.mrc})`) : "";
  const lienAction = "inline-flex items-center rounded-xl px-5 py-3 text-[15px] font-bold transition-colors";

  return (
    <div data-mesure-outil="verifier-secteur" className="rounded-3xl border border-black/5 bg-white p-[clamp(22px,4vw,34px)] shadow-sm">
      <label htmlFor={`${id}-champ`} className="block text-[14.5px] font-semibold text-cfrq-deep">
        Votre municipalité
      </label>
      <div className="relative mt-2">
        <input
          id={`${id}-champ`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listeVisible}
          aria-controls={`${id}-liste`}
          aria-activedescendant={listeVisible ? `${id}-option-${actif}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Ex. : Saint-Raymond, Lévis, Plessisville"
          value={saisie}
          onChange={(ev) => {
            setSaisie(ev.target.value);
            setOuvert(true);
            setActif(0);
            setChoix(null);
            setIntrouvable(false);
          }}
          onFocus={() => setOuvert(true)}
          onBlur={() => setOuvert(false)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-black/15 bg-[#fbfbf8] px-4 py-3.5 text-[16.5px] text-cfrq-deep outline-none transition-colors placeholder:text-cfrq-ink/40 focus:border-cfrq-green focus:bg-white"
        />
        {listeVisible && (
          <ul
            id={`${id}-liste`}
            role="listbox"
            aria-label="Municipalités"
            className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-[320px] overflow-auto rounded-xl border border-black/10 bg-white py-1.5 shadow-lg"
          >
            {suggestions.map((e, i) => (
              <li
                key={`${e.mrc}|${e.nom}`}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={i === actif}
                // mousedown plutôt que click : il passe avant le blur du champ, qui fermerait la liste.
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  choisir(e);
                }}
                onMouseEnter={() => setActif(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2.5 text-[15px] ${i === actif ? "bg-[#eef2e6]" : ""}`}
              >
                <span className="font-medium text-cfrq-deep">{e.nom}</span>
                <span className="flex-none text-[12.5px] text-cfrq-ink/50">{e.mrc}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div aria-live="polite">
        {introuvable && !choix && (
          <p className="mt-4 text-[15px] leading-relaxed text-cfrq-ink/70">
            Aucune municipalité ne correspond. Vérifiez l'orthographe, ou{" "}
            <a href={withBase("/contact")} className="font-semibold text-cfrq-leaf underline">écrivez-nous</a>.
          </p>
        )}

        {choix && present && (
          <div className="mt-5 rounded-2xl border border-cfrq-green/30 bg-[#eef2e6] p-[22px]">
            <p className="font-display text-[22px] font-medium leading-tight text-cfrq-deep">
              <span aria-hidden="true" className="text-cfrq-green">✓ </span>Oui, on est présent dans votre secteur
            </p>
            <p className="mt-2.5 text-[15.5px] leading-[1.6] text-cfrq-ink/75">
              {lieu} relève de l'{agence}, qui accrédite CFRQ. Vos travaux peuvent donc être admissibles à l'aide financière avec nous.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a href={withBase("/contact")} className={`${lienAction} bg-cfrq-green text-[#123005] hover:bg-[#6ecb3e]`}>Réserver une visite-conseil</a>
              <a href={site.telHref} className={`${lienAction} border border-cfrq-deep/20 text-cfrq-deep hover:border-cfrq-deep`}>Appeler le {site.tel}</a>
            </div>
            {lien && (
              <p className="mt-4 text-[14.5px]">
                <a href={lien.href} className="font-semibold text-cfrq-leaf underline decoration-cfrq-green/40 underline-offset-2 hover:decoration-cfrq-green">
                  Voir les travaux qu'on fait dans le secteur {lien.secteur} →
                </a>
              </p>
            )}
          </div>
        )}

        {choix && !present && (
          <div className="mt-5 rounded-2xl border border-black/10 bg-[#f6f6f2] p-[22px]">
            <p className="font-display text-[22px] font-medium leading-tight text-cfrq-deep">On n'a pas de budget dans votre région</p>
            <p className="mt-2.5 text-[15.5px] leading-[1.6] text-cfrq-ink/75">
              {agence
                ? `${lieu} relève de l'${agence}, qui n'accrédite pas CFRQ : nous n'avons pas accès à l'aide financière du programme pour votre boisé.`
                : `${lieu} est hors des territoires des agences qui accréditent CFRQ : nous n'avons pas accès à l'aide financière du programme pour votre boisé.`}{" "}
              On peut quand même vous guider : appelez-nous ou écrivez-nous.
              {agence && " Pour un conseiller accrédité près de chez vous, l'agence tient la liste de ses conseillers."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a href={site.telHref} className={`${lienAction} bg-cfrq-deep text-cfrq-cream hover:bg-black`}>Appeler le {site.tel}</a>
              <a href={withBase("/contact")} className={`${lienAction} border border-cfrq-deep/20 text-cfrq-deep hover:border-cfrq-deep`}>Nous écrire</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
