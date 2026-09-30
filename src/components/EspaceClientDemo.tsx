import { useState } from "react";
import { DashboardView } from "./EspaceClient";
import { DemandeRecue, FormulaireAcces } from "./DemandeAcces";
import { DemandesAccesVue, type DemandeAccesEmploye } from "./VueEmploye";
import { dossierDemo } from "../data/dossierDemo";

// Démonstration locale (serveur de développement seulement) : les vrais écrans de
// l'espace client, nourris de données inventées, sans compte ni appel à la base.
const DEMANDES_DEMO: DemandeAccesEmploye[] = [
  {
    id: 1, courriel: "pierre.gagnon@exemple.test", nom: "Pierre Gagnon", municipalite: "Saint-Raymond",
    telephone: "418 555-0142", no_producteur: null, lots: "5 612 384", cree_le: new Date().toISOString(),
    suggestions: [
      { id: 101, nom: "GAGNON PIERRE", no_prod: "GAGP00001234", municipalite: "Saint-Raymond", a_compte: false, score: 90 },
      { id: 102, nom: "GAGNON PIERRE-LUC", no_prod: "GAGP00005678", municipalite: "Pont-Rouge", a_compte: true, score: 60 },
    ],
  },
  {
    id: 2, courriel: "boises.lachance@exemple.test", nom: "Boisés Lachance inc.", municipalite: "Lyster",
    telephone: null, no_producteur: "LACB00009911", cree_le: new Date(Date.now() - 86400000).toISOString(),
    suggestions: [],
  },
];

const ONGLETS = [
  { cle: "tableau", titre: "Tableau de bord" },
  { cle: "non_relie", titre: "Compte non relié" },
  { cle: "employe", titre: "Vue employé : demandes d'accès" },
] as const;

export default function EspaceClientDemo() {
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number]["cle"]>("tableau");
  const [envoye, setEnvoye] = useState(false);
  const [demandes, setDemandes] = useState(DEMANDES_DEMO);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2 bg-[#fff6dc] px-4 py-2 text-[13px] text-[#6b4e00]">
        <span className="font-medium">Démonstration locale, données fictives :</span>
        {ONGLETS.map((o) => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`rounded-full px-3 py-1 ${onglet === o.cle ? "bg-[#6b4e00] text-white" : "border border-[#6b4e00]/30"}`}>
            {o.titre}
          </button>
        ))}
      </div>

      {onglet === "tableau" && <DashboardView d={dossierDemo} courriel="demo@exemple.test" apercu />}

      {onglet === "non_relie" && (
        <div className="flex min-h-screen items-start justify-center bg-cfrq-cream px-5 py-10">
          <div className="w-full max-w-[560px] rounded-3xl border border-black/[.07] bg-white p-[clamp(26px,5vw,42px)]">
            <h1 className="font-display text-[clamp(23px,4.5vw,30px)] font-medium leading-[1.15] text-cfrq-deep">
              Il reste à relier votre espace à votre dossier forestier
            </h1>
            {envoye ? (
              <DemandeRecue
                demande={{ id: 1, statut: "en_attente", nom: "Pierre Gagnon", municipalite: "Saint-Raymond", telephone: null, no_producteur: null }}
                courriel="pierre.gagnon@exemple.test"
                onModifier={() => setEnvoye(false)}
              />
            ) : (
              <FormulaireAcces envoi={false} onEnvoyer={() => setEnvoye(true)} />
            )}
          </div>
        </div>
      )}

      {onglet === "employe" && (
        <main className="mx-auto min-h-screen max-w-3xl bg-cfrq-cream px-5 py-10">
          <DemandesAccesVue
            demandes={demandes}
            occupe={null}
            onRelier={(d) => setDemandes((l) => l.filter((x) => x.id !== d.id))}
            onChercher={() => {}}
            onRefuser={(d) => setDemandes((l) => l.filter((x) => x.id !== d.id))}
          />
          {demandes.length === 0 && <p className="text-[15px] text-cfrq-ink/60">Plus aucune demande en attente.</p>}
        </main>
      )}
    </>
  );
}
