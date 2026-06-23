# Matera — Sondage secondaire BSPCE

Application web confidentielle pour collecter les **indications d'intérêt non
contraignantes** des détenteurs de BSPCE (employés actuels et anciens employés)
dans le cadre d'un processus de levée de fonds.

> ⚠️ **Confidentiel.** Les données affichées (prix indicatifs, titres détenus,
> produits potentiels) sont strictement confidentielles. La sécurité, la
> traçabilité (audit/access logs) et le contrôle d'accès sont traités comme des
> exigences de premier ordre.

---

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Supabase** — Auth (magic link), PostgreSQL, RLS
- **Tailwind CSS**
- **Upstash Redis** (rate limiting `/login`)
- Déploiement **Vercel**

---

## État d'avancement

Cette itération livre la **fondation** (voir l'ordre de développement du cahier
des charges) :

| # | Domaine | État |
|---|---------|------|
| 1 | Schéma DB + migrations + RLS | ✅ |
| 2 | Auth (magic link) + porte NDA | ✅ |
| 3 | Import des données (aperçu + écriture idempotente) | ✅ |
| 4 | UX sondage employés actuels (curseur %) | ⏳ landing en lecture seule ; curseur interactif à venir |
| 5 | UX ex-employés (binaire + fallback curseur) | ⏳ landing en lecture seule ; réponse à venir |
| 6 | Réglages admin + recalcul live | ⏳ à venir |
| 7 | Dashboards + tableaux + export CSV | ⏳ à venir |
| 8 | Logs audit + accès | ✅ (helpers branchés sur les pages livrées) |
| 9 | Confidentialité (watermark, footer, print) | ✅ base |
| 10 | FAQ + support | ✅ base (FAQ par défaut, éditeur admin à venir) |
| 11 | Tests bout-en-bout (pilote 5 pers.) | ⏳ |

Le cœur financier (`src/lib/pricing.ts`) est complet et partagé entre la page
détenteur et (à venir) les dashboards admin.

---

## Configuration

### 1. Variables d'environnement

Copiez `.env.example` vers `.env.local` et renseignez :

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon (publique, RLS appliquée) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role — **serveur uniquement, jamais exposée au client** |
| `NEXT_PUBLIC_APP_URL` | URL publique (cibles des magic links) |
| `ADMIN_EMAILS` | Liste d'emails admin, séparés par des virgules |
| `SUPPORT_EMAIL` | Email de support affiché aux détenteurs |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate limiting `/login` (optionnel en dev) |
| `ADMIN_IP_ALLOWLIST` | Liste d'IP/préfixes autorisés pour `/admin` (vide = désactivé) |

> Les variables `SUPABASE_URL` / `SUPABASE_ANON_KEY` du cahier des charges sont
> ici préfixées `NEXT_PUBLIC_` car Next.js l'exige pour l'usage côté client.

### 2. Base de données Supabase

Exécutez les migrations dans l'ordre (SQL Editor du dashboard Supabase, ou CLI) :

```
supabase/migrations/0001_schema.sql     -- tables, enums, contraintes, triggers
supabase/migrations/0002_rls.sql        -- Row Level Security
supabase/migrations/0003_seed.sql       -- valeurs admin_settings par défaut
supabase/migrations/0004_bspce2026.sql  -- extensions BSPCE 2026 + departure_tracking
```

Via la CLI Supabase :

```bash
supabase db push          # applique le contenu de supabase/migrations
```

ou collez chaque fichier dans le **SQL Editor** et exécutez-les dans l'ordre.

#### Auth Supabase

- Activez **Email** comme provider et **magic link**.
- Réglez **Site URL** = `NEXT_PUBLIC_APP_URL`.
- Ajoutez `${NEXT_PUBLIC_APP_URL}/auth/callback` aux **Redirect URLs**.

### 3. Lancer en local

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # build de production
npm run typecheck    # vérification TypeScript
```

---

## Modèle de sécurité

- **RLS** : un détenteur ne peut lire que **ses propres** lignes (holder,
  batches, responses, history), via correspondance email du JWT.
- **Toutes les écritures** (soumissions, import, réglages) passent par des
  *server actions* utilisant la **clé service role** (hors RLS) avec contrôle
  d'autorisation applicatif + journalisation.
- `holder_overrides`, `audit_log`, `access_log` : **aucun accès anon** (service
  role uniquement).
- En-têtes : CSP stricte, `X-Frame-Options: DENY`, HSTS, pas de mise en cache
  des pages confidentielles (`Cache-Control: no-store`).
- Rate limit `/login` : 5 requêtes / IP / heure (Upstash).
- Allowlist IP optionnelle sur `/admin`.
- L'import ne révèle jamais l'existence d'un email côté `/login` (message
  générique systématique).

---

## Import des données (`/admin/import`)

Un seul fichier : **BSPCE 2026 (.xlsx)** fourni par la finance, avec 2 onglets :

- **`Par titulaires`** — une ligne par grant. Le **statut employé** (`Actif` /
  `Ex-employé`) est lu directement (colonne « Actif ou ex-employés ») et **jamais
  re-déduit du domaine email** (les fondateurs ont des emails @matera.eu courts).
- **`Sheet1`** — suivi légal des départs d'ex-employés en cours → table
  `departure_tracking`.

Décisions de modélisation (à valider avec la finance) :

- **Quantité cessible** par grant = scission en deux sous-lots : *vesté* =
  `Solde exerçable` (`is_vested=true`) et *non-vesté* = `Quantité non vestée`
  (`is_vested=false`), pour que chaque portion soit valorisée au bon prix.
- Grant sans rien à céder (`Actual in circulation`=0 ET `Quantité non vestée`=0)
  → un lot `voided` conservé pour la traçabilité, exclu de l'UI détenteur.
- `ordinary_shares` = somme de `Quantité exercée` (BSPCE déjà exercés = actions).
- **Fondateurs** (tag `Founders`) → `current_employee` + `is_founder=true`
  (process dédié, hors sondage standard).
- **Sans email personnel** → importés mais `needs_review=true`, email synthétique
  non routable (non contactables).

Le flux affiche un **rapport de pré-import** (détenteurs, split actif/ex,
fondateurs, sans-email, statuts à reclasser, lots actifs/caducs, solde exerçable
total, départs) **avant toute écriture**. À la confirmation, les lots de chaque
détenteur sont **rafraîchis** (delete + reinsert, le fichier étant la source de
vérité) sans réinitialiser les NDA déjà acceptés. Parser : `src/lib/import/parse.ts`.

---

## Structure du code

```
supabase/migrations/      SQL : schéma, RLS, seed
src/middleware.ts         Auth/session, garde des routes, allowlist IP, no-store
src/lib/
  pricing.ts              Cœur financier (prix par lot, produits, fourchettes)
  settings.ts             Lecture typée de admin_settings (sans cache)
  format.ts               Formatage FR (€, dates)
  logging.ts              audit_log / access_log
  ratelimit.ts            Upstash
  supabase/{server,browser,service}.ts
  auth/{admins,session}.ts
  import/{parse,apply}.ts Parsing pur + application idempotente
src/app/
  login/                  Saisie email + envoi magic link
  auth/callback/          Échange code → session
  nda/                    Porte de confidentialité
  survey/                 Landing détenteur (lettre + produits, lecture seule)
  faq/                    Aide & FAQ
  admin/                  Layout protégé + dashboard + import
  api/health/             Sonde de liveness
src/components/Confidential.tsx   Watermark, footer, protection impression
```

---

## Prochaines itérations

- UI de réponse interactive (curseur % live + binaire ex-employés) + soumission
  avec `response_history`.
- Panneau Réglages admin avec **recalcul live** des dashboards.
- Dashboards réponses (KPIs, histogramme, pie, série temporelle) + export CSV.
- Détail détenteur (surcharges, reclassement, voided par lot, timeline).
- Audit log consultable/filtrable, éditeur FAQ markdown.
- Emails de confirmation, notifications Slack (nice-to-have).

---

## Points à confirmer (hors périmètre du build initial)

1. Format exact du fichier actions ordinaires (Ryo).
2. Format exact de l'export roster Omni Analytics (Enzo) — un fichier réel
   permettra de valider le parseur.
3. Personnalisation des emails magic link (défauts Supabase pour l'instant).
4. Email de confirmation à la soumission (par défaut : oui).
5. Multilingue : FR uniquement pour la v1.
```
