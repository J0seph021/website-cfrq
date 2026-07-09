import { createClient } from "@supabase/supabase-js";

// URL + clé publishable du projet "Relevés forestiers".
// La clé publishable est PUBLIQUE par conception (bornée par les politiques RLS).
// Ne JAMAIS mettre la clé service_role ici.
const url = import.meta.env.PUBLIC_SUPABASE_URL || "https://sfzcslpbysabsiszcpqm.supabase.co";
const key =
  import.meta.env.PUBLIC_SUPABASE_KEY || "sb_publishable_aD3nhUKl1LJCCeYC6YSHYQ_5ImGu7r1";

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Lien magique + réinitialisation de mot de passe: Supabase renvoie les
    // jetons dans le fragment (#access_token=...) de l'URL de retour et le
    // client doit les capter automatiquement pour ouvrir la session.
    detectSessionInUrl: true,
    storageKey: "cfrq-auth",
  },
});
