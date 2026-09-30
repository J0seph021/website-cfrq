import { DashboardView } from "./EspaceClient";
import { dossierDemo } from "../data/dossierDemo";

// Démonstration locale : le vrai tableau de bord, nourri d'un dossier inventé.
export default function EspaceClientDemo() {
  return (
    <>
      <div className="bg-[#fff6dc] px-4 py-2 text-center text-[13px] font-medium text-[#6b4e00]">
        Démonstration locale : dossier fictif, aucune donnée réelle.
      </div>
      <DashboardView d={dossierDemo} courriel="demo@exemple.test" />
    </>
  );
}
