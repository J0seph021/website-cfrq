# Mise en production de cfrq.ca

Procédure de bascule de l'ancien site WordPress vers le nouveau site Astro.
Établie le 2026-08-18. À suivre dans l'ordre.

---

## 0. Ce qu'il faut savoir avant de commencer

**Le DNS n'est pas chez GoDaddy.** GoDaddy est le **registraire** : il ne détient
pas les enregistrements, il dit seulement quels serveurs de noms font autorité.
La zone elle-même est chez **Cloudflare**. Chez GoDaddy, on ne touchera qu'à une
seule chose, et une seule fois : la liste des serveurs de noms (étape 4.4).

**Le courriel passe par le même domaine.** L'enregistrement MX pointe vers
Microsoft 365 (`cfrq-ca.mail.protection.outlook.com`), le SPF autorise Outlook et
Mailgun, et six clés DKIM signent les envois. Ces enregistrements n'ont rien à
voir avec le site web :

> ⚠️ Ne toucher **ni** aux MX, **ni** aux TXT (SPF, DMARC, `MS=ms75276617`,
> `google-site-verification`, KnowBe4), **ni** aux `_domainkey`. Y toucher coupe
> le courriel de CFRQ, ou fait passer ses envois en indésirable.

Seuls les enregistrements du domaine nu `cfrq.ca` et de `www` changent.

### Il existe DEUX zones Cloudflare pour cfrq.ca (constaté le 2026-08-18)

Vérifié auprès des serveurs faisant autorité :

| | Zone **agence** | Zone **Joseph** |
|---|---|---|
| Compte Cloudflare | inconnu (ancien fournisseur) | `J.moffet@cfrq.ca` |
| Serveurs de noms | `adele.ns` + `alexis.ns` | `anna.ns` + `kyle.ns` |
| Numéro de série SOA | 2410096297 | 2411095110 |
| Adresse de `cfrq.ca` | 172.64.80.1 | 104.21.45.11 + 172.67.207.72 |
| **Délégué par le registre .ca** | **OUI, c'est elle qui sert** | non, statut « Pending » |

La zone de Joseph existe et répond si on l'interroge directement, mais personne
ne l'interroge : GoDaddy pointe encore vers `adele`/`alexis`. Cloudflare affiche
donc « En attente que votre serveur d'inscription propage vos nouveaux serveurs
de noms ».

**Comparaison complète des deux zones, faite le 2026-08-18 :** MX, les 4 TXT
(SPF, DMARC, `MS=…`, google-site-verification, KnowBe4), les 6 `_domainkey`
(`selector1`, `selector2`, `cf2024-1`, `mx`, `s1`, `s2`), `autodiscover`,
`_domainconnect`, `email`, `enterpriseenrollment`, `enterpriseregistration`,
`lyncdiscover`, `mail`, `sip` et les 2 `SRV` sont **identiques**. Aucun
enregistrement de la zone agence ne manque dans celle de Joseph. **Le courriel
ne risque donc rien à basculer la délégation.**

Les seuls écarts sont la paire de serveurs de noms et les enregistrements web
(`cfrq.ca` et `www`), qui sont précisément ceux qu'on remplace.

**Conséquence : on bascule la délégation vers la zone de Joseph.** Pas besoin
d'accès au compte de l'ancien fournisseur, et CFRQ reprend le contrôle de son
propre DNS.

> ⚠️ **Piège à ne pas rater.** Dans la zone de Joseph, les A de `cfrq.ca` et de
> `www` valent `104.21.45.11` et `172.67.207.72`, qui sont **des adresses de
> Cloudflare lui-même** (recopiées par le scan automatique lors de l'ajout du
> domaine). Cloudflare refuse de servir un site dont l'origine est une de ses
> propres adresses : basculer les serveurs de noms sans corriger ces
> enregistrements d'abord donnerait une **erreur Cloudflare 1000, « DNS points to
> prohibited IP »**. D'où l'ordre imposé plus bas : on corrige les
> enregistrements AVANT de toucher à GoDaddy.

---

## 1. Ce qui est déjà fait dans le dépôt

| Élément | État |
|---|---|
| Toutes les URL de l'ancien site répondent | ✅ vérifié automatiquement |
| Redirections des URL disparues | ✅ 22 redirections générées |
| `sitemap-index.xml` + `sitemap-0.xml` | ✅ 15 pages, sans les pages privées |
| `robots.txt` | ✅ pointe vers le sitemap |
| Page 404 sur mesure | ✅ `dist/404.html` |
| Fichier `CNAME` (domaine GitHub Pages) | ✅ `cfrq.ca` |
| Espace client retiré de la publication | ✅ ni page, ni lien, ni section |
| Contenu légal indépendant de WordPress | ✅ figé dans `src/contenu-legal/` |
| Mesure d'audience GTM + consentement Loi 25 | ✅ voir section 9 |
| Contrôle automatique avant publication | ✅ `npm run verifier`, bloquant en CI |

Le workflow `.github/workflows/deploy.yml` construit désormais pour
`https://cfrq.ca` et refuse de publier si le contrôle échoue.

---

## 2. Vérification locale (5 minutes)

```bash
npm ci && npm run build && npm run verifier
```

Le script doit se terminer par « Aucun problème bloquant. Le build est publiable. »
Pour naviguer dans le site tel qu'il sera en ligne :

```bash
npm run preview
```

---

## 3. Publier sur GitHub

Pousser sur `main` déclenche le déploiement.

```bash
git push origin main
```

Suivre l'exécution dans l'onglet **Actions** du dépôt. Le job `build` lance le
contrôle : s'il échoue, rien n'est publié.

Au premier déploiement contenant le fichier `CNAME`, GitHub inscrit
automatiquement `cfrq.ca` comme domaine personnalisé du dépôt. À partir de ce
moment, l'aperçu `j0seph021.github.io/website-cfrq` redirige vers `cfrq.ca`,
qui affiche encore l'ancien site WordPress tant que le DNS n'a pas changé.
C'est normal, et sans conséquence pour les visiteurs.

---

## 4. Bascule DNS

Tout se passe dans la **zone de Joseph** (compte Cloudflare `J.moffet@cfrq.ca`,
celle dont l'*Overview* affiche `anna.ns.cloudflare.com` / `kyle.ns.cloudflare.com`
et le bandeau « En attente »).

**L'ordre est impératif.** Corriger les enregistrements d'abord, basculer les
serveurs de noms en dernier. L'inverse casserait le site (erreur Cloudflare 1000,
voir section 0).

### 4.1 — Régler le mode SSL

**SSL/TLS → Overview → Full.**

> Ni « Flexible » (boucle de redirection infinie), ni « Full (strict) » (le
> certificat de GitHub Pages ne porte pas le nom cfrq.ca, la connexion serait
> refusée). C'est **Full**, exactement. Sur une zone neuve, Cloudflare met parfois
> « Flexible » par défaut : vérifier, ne pas supposer.

### 4.2 — Vérifier le certificat avant de basculer

**SSL/TLS → Edge Certificates → Universal SSL.**

Si le certificat est déjà **Active**, la bascule se fera sans aucune coupure
HTTPS. S'il est encore en attente, il sera émis à l'activation de la zone, ce qui
peut laisser quelques minutes sans HTTPS valide juste après l'étape 4.4. Dans ce
cas, faire la bascule en soirée.

### 4.3 — Remplacer les enregistrements du site

Dans **DNS → Records**. Supprimer :

| Type | Nom | Contenu actuel |
|---|---|---|
| A | `cfrq.ca` | `104.21.45.11` et `172.67.207.72` |
| AAAA | `cfrq.ca` | `2606:4700:3031::ac43:cf48` et `2606:4700:3034::6815:2d0b` |
| A | `www` | `104.21.45.11` et `172.67.207.72` |
| AAAA | `www` | `2606:4700:3031::ac43:cf48` et `2606:4700:3034::6815:2d0b` |

Créer à la place, exactement ces deux-là :

| Type | Name | Target | Proxy status | TTL |
|---|---|---|---|---|
| CNAME | `@` | `j0seph021.github.io` | **Proxied** (nuage orange) | Auto |
| CNAME | `www` | `j0seph021.github.io` | **Proxied** (nuage orange) | Auto |

Cloudflare aplatit le CNAME sur le domaine nu : les quatre adresses A de GitHub
sont inutiles.

**Ne toucher à rien d'autre.** Restent intacts : `MX`, les `TXT` (SPF, DMARC,
`MS=ms75276617`, google-site-verification, KnowBe4), les `_domainkey`
(`selector1`, `selector2`, `cf2024-1`, `mx`, `s1`, `s2`), `autodiscover`,
`_domainconnect`, `email`, `enterpriseenrollment`, `enterpriseregistration`,
`lyncdiscover`, `mail`, `sip`, et les `SRV` `_sip._tls` /
`_sipfederationtls._tcp`. Y toucher couperait le courriel, les signatures DKIM
ou Teams.

### 4.4 — Basculer les serveurs de noms chez GoDaddy

C'est le point de bascule réel. Dans GoDaddy, sur le domaine cfrq.ca, section
serveurs de noms, remplacer :

| Avant | Après |
|---|---|
| `adele.ns.cloudflare.com` | `anna.ns.cloudflare.com` |
| `alexis.ns.cloudflare.com` | `kyle.ns.cloudflare.com` |

Cloudflare détecte le changement en 1 à 2 heures d'ordinaire, jusqu'à 24 h au
pire, et la zone passe de « En attente » à « Active ».

**Cloudflare n'agit jamais de lui-même : tant que GoDaddy n'a pas été modifié,
la zone reste « En attente » indéfiniment.** C'est cette étape 4.4 qui déclenche
tout le reste.

Pour suivre l'avancement à tout moment :

```bash
node scripts/etat-bascule.mjs
```

Le script dit vers quelle zone GoDaddy pointe (vu par quatre résolveurs publics
différents, ce qui montre la propagation en cours), quel site répond réellement
sur cfrq.ca, et contrôle au passage que les MX et le SPF n'ont pas bougé.

**Pendant la propagation, il n'y a pas de coupure.** Les résolveurs qui ont
encore l'ancienne délégation servent le WordPress, les autres servent le nouveau
site. Le courriel est identique dans les deux zones : il ne bouge pas.

### 4.5 — Forcer HTTPS

Une fois la zone **Active** : **SSL/TLS → Edge Certificates → Always Use HTTPS :
activé.**

À ne faire qu'après l'activation : activé trop tôt, ce réglage peut empêcher la
validation du certificat.


---

## 5. Vérification après bascule

### Comment savoir que c'est fait

Trois signaux, du plus passif au plus fiable :

1. **Cloudflare envoie un courriel** à `J.moffet@cfrq.ca`, intitulé quelque chose
   comme « cfrq.ca is now active on Cloudflare ».
2. **Le tableau de bord** perd son bandeau « En attente » et affiche **Active**.
   Le bouton « Vérifier les serveurs de noms maintenant » force une vérification
   au lieu d'attendre le prochain passage automatique.
3. **En ligne de commande**, sans rien attendre ni rafraîchir :

```bash
node scripts/etat-bascule.mjs
```

C'est le plus fiable des trois : il montre l'état réel du DNS public, pas ce que
Cloudflare croit. Il se termine par « Étape 0 / 1 / 2 sur 2 » selon où en est la
bascule.

### Puis le contrôle du site

```bash
node scripts/verifier-en-ligne.mjs
```

Ce script interroge le site réellement en ligne et contrôle que chaque URL de
l'ancien site répond, que les redirections aboutissent, que le sitemap et le
`robots.txt` sont servis, et que l'espace client reste bien inaccessible.

À contrôler aussi à la main :

- Envoyer un vrai formulaire de contact et vérifier la réception du courriel.
- Vérifier que le courriel de CFRQ fonctionne toujours (envoi **et** réception).

---

## 6. Référencement, dans les jours qui suivent

1. **Google Search Console** (la propriété existe déjà, l'enregistrement
   `google-site-verification` est dans la zone DNS) :
   soumettre `https://cfrq.ca/sitemap-index.xml`.
2. Dans Search Console, retirer l'ancien sitemap WordPress (`/wp-sitemap.xml`).
3. Surveiller le rapport **Pages → Indexation** pendant deux à quatre semaines.
   Une baisse passagère du nombre de pages indexées est normale : l'ancien site
   publiait 35 URL, le nouveau en publie 15 réellement utiles. Ce qui compte est
   qu'aucune URL ne remonte en « 404 introuvable ».
4. Vérifier `https://cfrq.ca/robots.txt` et `https://cfrq.ca/sitemap-index.xml`
   dans un navigateur.

---

## 7. Retour en arrière

Le site WordPress n'est pas supprimé par la bascule : seul le DNS cesse de
pointer vers lui, et la zone de l'ancien fournisseur reste intacte.

**Retour complet** : remettre chez GoDaddy les serveurs de noms
`adele.ns.cloudflare.com` et `alexis.ns.cloudflare.com`. Tout redevient comme
avant, y compris le WordPress. Compter **1 à quelques heures** de propagation :
c'est plus lent qu'un simple changement d'enregistrement, c'est la contrepartie
de cette méthode.

**Retour rapide sur le site seul** : sans toucher aux serveurs de noms, il suffit
de repointer le CNAME de `cfrq.ca` vers l'ancien hébergement dans la zone de
Joseph. Encore faut-il connaître l'adresse d'origine du WordPress, que le proxy
Cloudflare masque. **À demander à l'ancien fournisseur avant la bascule** : c'est
la seule information qui manque au dossier.

> ⚠️ Ne pas demander à l'ancien fournisseur de supprimer sa zone Cloudflare :
> c'est le filet de sécurité. La laisser dormir au moins un mois.

Ne pas résilier l'hébergement WordPress avant **au moins un mois** de
fonctionnement stable du nouveau site.

---

## 8. Décisions prises sur les pages sans équivalent

| URL de l'ancien site | Ce que c'était | Décision du 2026-08-18 |
|---|---|---|
| `/mon-releve/` | Relevé forestier (Supabase, liens Stripe encore en **mode test**) | **301 vers `/calculateur-valeur-bois/`**, qui tient la même promesse en mieux |
| `/assistant-reg-for/` | Assistant de réglementation forestière, extension WordPress `galogix-assistant 0.1.10` | **laissée en 404.** L'outil n'est plus offert et une extension WordPress ne peut pas être portée sur un site statique |
| `/login` | Connexion WordPress | laissée en 404, aucune valeur SEO |

Les URL laissées en 404 aboutissent sur la page 404 sur mesure, qui oriente vers
les services et les coordonnées. Ce choix est documenté dans
`src/data/redirections-heritees.mjs` pour que ce reste un choix, pas un oubli.

---

## 9. Mesure d'audience et Loi 25

Le conteneur **Google Tag Manager `GTM-PW8SP69`**, celui de l'ancien site, est
repris sur le nouveau : l'historique de mesure n'est pas coupé par la bascule.

Le chargement respecte la Loi 25 :

- le conteneur ne se charge **que sur cfrq.ca en production**, jamais en local
  ni sur l'aperçu GitHub Pages, pour ne pas fausser les statistiques ;
- l'état de consentement est poussé **avant** le conteneur, à « refusé » pour
  tout ce qui n'est pas essentiel (mode consentement de Google, v2) ;
- **aucun témoin n'est déposé avant le choix de la personne** (vérifié : zéro
  témoin sur une première visite) ;
- « Refuser » et « Accepter » ont exactement la même taille et la même
  importance visuelle, comme l'exige la loi ;
- le choix se change à tout moment par **« Préférences de témoins »** dans le
  pied de page.

Le script de contrôle refuse de publier si l'une de ces conditions saute.

**À faire une fois en ligne :** vérifier dans GA4 que les visites remontent
depuis `cfrq.ca` après avoir accepté les témoins, et confirmer que les balises
du conteneur GTM sont toujours d'actualité (elles pointaient vers un site
WordPress dont la structure de pages a changé).
