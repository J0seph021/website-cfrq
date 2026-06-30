import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { withBase } from "../lib/url";
import CarteForet from "./CarteForet";

type Row = Record<string, any>;
interface Dossier {
  producteur: Row | null;
  proprietes: Row[];
  lots: Row[];
  paf: Row[];
  travaux: Row[];
  documents: Row[];
  carte: Row | null;
}

const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 });
const ha = (v: any) => (v == null ? "—" : nf.format(Number(v)) + " ha");

export default function EspaceClient() {
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<Dossier | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace(withBase("/espace-client")); return; }
      const [prod, props, lots, paf, travaux, docs, carte] = await Promise.all([
        supabase.from("producteurs").select("*").maybeSingle(),
        supabase.from("proprietes").select("*").order("no_propriete"),
        supabase.from("lots").select("*"),
        supabase.from("paf").select("*"),
        supabase.from("travaux").select("*"),
        supabase.from("documents").select("*"),
        supabase.from("cartes").select("geojson,bbox").maybeSingle(),
      ]);
      if (!alive) return;
      setD({
        producteur: prod.data ?? null,
        proprietes: props.data ?? [],
        lots: lots.data ?? [],
        paf: paf.data ?? [],
        travaux: travaux.data ?? [],
        documents: docs.data ?? [],
        carte: carte.data ?? null,
      });
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) window.location.replace(withBase("/espace-client"));
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace(withBase("/espace-client"));
  }

  // Ouvre un document via une URL signée temporaire (RLS: ses propres fichiers seulement).
  async function ouvrirDoc(path?: string) {
    if (!path) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  if (loading || !d) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cfrq-cream text-cfrq-deep">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-cfrq-green border-t-transparent"></div>
          <p className="text-[15px] text-black/60">Chargement de votre dossier…</p>
        </div>
      </div>
    );
  }

  const nom = d.producteur?.nom ?? "Votre dossier";
  const superficieTotale = d.proprietes.reduce((t, p) => t + (Number(p.superficie_totale) || 0), 0);
  const lotsParPropriete = (id: number) => d.lots.filter((l) => l.propriete_id === id).length;
  const initiales = nom.split(/\s+/).map((m: string) => m[0]).join("").slice(0, 2).toUpperCase();

  const stats = [
    { valeur: nf.format(superficieTotale) + " ha", label: "Superficie totale" },
    { valeur: String(d.proprietes.length), label: "Propriétés" },
    { valeur: String(d.lots.length), label: "Lots boisés" },
    { valeur: String(d.travaux.length), label: "Travaux au dossier" },
  ];

  return (
    <div className="min-h-screen bg-cfrq-cream">
      <header className="sticky top-0 z-30 bg-cfrq-deep text-cfrq-cream">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <a href={withBase("/")} className="font-display text-xl text-cfrq-cream" aria-label="Accueil CFRQ">
              CFR<span style={{ color: "#5abd2a" }}>Q</span>
            </a>
            <span className="hidden border-l border-white/20 pl-3 text-[14px] text-cfrq-cream/70 sm:inline">Espace client</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cfrq-green text-[13px] font-medium text-[#123005]">{initiales}</span>
            <button onClick={logout} className="rounded-lg border border-white/25 px-3 py-2 text-[13px] text-cfrq-cream/90 transition-colors hover:bg-white/10">
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-medium text-cfrq-deep">Bonjour</h1>
          <span className="rounded-full bg-cfrq-green/20 px-3 py-1 text-[13px] font-medium text-cfrq-leaf">{nom}</span>
          {d.producteur?.type_proprio && (
            <span className="rounded-full bg-black/5 px-3 py-1 text-[13px] text-black/60">{d.producteur.type_proprio}</span>
          )}
        </div>
        <p className="mt-1 text-[15px] text-black/55">Voici votre dossier forestier, à jour.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white p-4">
              <div className="text-[13px] text-black/55">{s.label}</div>
              <div className="mt-1 font-display text-2xl font-medium text-cfrq-deep">{s.valeur}</div>
            </div>
          ))}
        </div>

        {d.carte?.geojson && (
          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Ma forêt</h2>
              <span className="text-[13px] text-black/50">Cliquez un peuplement pour voir le détail</span>
            </div>
            <div className="mt-4">
              <CarteForet data={d.carte.geojson} bbox={d.carte.bbox} documents={d.documents} />
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-cfrq-deep">Mes propriétés</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-black/5 bg-white">
            <table className="w-full text-left text-[15px]">
              <thead className="bg-cfrq-tint/60 text-[13px] uppercase tracking-wide text-cfrq-leaf">
                <tr>
                  <th className="px-4 py-3 font-medium">Propriété</th>
                  <th className="px-4 py-3 font-medium">Municipalité</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">MRC</th>
                  <th className="px-4 py-3 font-medium">Superficie</th>
                  <th className="px-4 py-3 font-medium">Lots</th>
                </tr>
              </thead>
              <tbody>
                {d.proprietes.map((p) => (
                  <tr key={p.id} className="border-t border-black/5">
                    <td className="px-4 py-3 font-medium text-cfrq-deep">{p.no_propriete ? "No " + p.no_propriete : "—"}</td>
                    <td className="px-4 py-3 text-black/70">{p.municipalite ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-black/60 sm:table-cell">{p.mrc ?? "—"}</td>
                    <td className="px-4 py-3 text-black/70">{ha(p.superficie_totale)}</td>
                    <td className="px-4 py-3 text-black/70">{lotsParPropriete(p.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-xl font-medium text-cfrq-deep">Plan d'aménagement</h2>
            <div className="mt-4 rounded-2xl border border-black/5 bg-white p-6">
              {d.paf.length > 0 ? (
                d.paf.map((pf) => (
                  <div key={pf.id} className="text-[15px]">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-cfrq-green/20 px-3 py-1 text-[13px] font-medium text-cfrq-leaf">{pf.statut_courant ?? "Actif"}</span>
                      <span className="text-black/55">{pf.date_plan ?? ""}{pf.date_echeance ? " → " + pf.date_echeance : ""}</span>
                    </div>
                    {pf.no_plan && <div className="mt-3 text-black/70">Plan {pf.no_plan}</div>}
                  </div>
                ))
              ) : (
                <p className="text-[15px] leading-relaxed text-black/60">
                  Aucun plan d'aménagement structuré à votre dossier pour le moment. C'est l'étape qui
                  donne accès aux programmes d'aide.{" "}
                  <a href={withBase("/contact")} className="font-medium text-cfrq-leaf hover:underline">Nous en parler</a>.
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-cfrq-deep">Travaux</h2>
            <div className="mt-4 space-y-3">
              {d.travaux.length > 0 ? (
                d.travaux.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white p-4">
                    <div>
                      <div className="text-[15.5px] font-medium text-cfrq-deep">{t.type_travaux ?? "Travaux"}</div>
                      <div className="text-[13.5px] text-black/55">{[t.no_lot, t.surface, t.date_travaux].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className={"rounded-full px-3 py-1 text-[13px] font-medium " + (t.statut === "En cours" ? "bg-cfrq-green/20 text-cfrq-leaf" : "bg-black/5 text-black/55")}>
                      {t.statut ?? "—"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-black/5 bg-white p-4 text-[15px] text-black/60">Aucun travail au dossier.</div>
              )}
            </div>
          </section>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-cfrq-deep">Documents</h2>
          <div className="mt-4 rounded-2xl border border-black/5 bg-white p-6">
            {d.documents.length > 0 ? (
              <ul className="divide-y divide-black/5">
                {d.documents.map((doc) => (
                  <li key={doc.id}>
                    <button
                      onClick={() => ouvrirDoc(doc.storage_path)}
                      disabled={!doc.storage_path}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left text-[15px] disabled:cursor-default"
                    >
                      <span className="flex items-center gap-2 font-medium text-cfrq-deep">
                        {doc.storage_path && <span aria-hidden>📄</span>}
                        <span className={doc.storage_path ? "hover:underline" : ""}>{doc.nom_document}</span>
                      </span>
                      <span className="shrink-0 text-[13px] text-black/50">{doc.taille ?? doc.date_document}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-black/60">Aucun document en ligne pour le moment. Vos plans et rapports apparaîtront ici.</p>
            )}
          </div>
        </section>

        <div className="mt-10 rounded-2xl bg-cfrq-deep p-6 text-cfrq-cream">
          <h2 className="font-display text-lg font-medium">Besoin d'un coup de main ?</h2>
          <p className="mt-2 text-[15px] text-cfrq-cream/80">Votre ingénieur forestier attitré est disponible pour vos questions.</p>
          <a href={withBase("/contact")} className="mt-4 inline-block rounded-lg bg-cfrq-green px-5 py-3 text-[15px] font-medium text-[#123005] hover:bg-cfrq-green-hover">Nous écrire</a>
        </div>
      </div>
    </div>
  );
}
