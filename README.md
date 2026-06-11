# ✈ Contrôle Cabines Avions – Application Web

Application de contrôle qualité nettoyage cabines avions (Gros Porteur Transit).

## Stack technique

- **Frontend** : HTML + CSS + JavaScript Vanilla (aucun framework)
- **Backend** : Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Hébergement** : Cloudflare Pages
- **Supabase JS** : via CDN (`@supabase/supabase-js@2`)

---

## ÉTAPE 1 – SUPABASE

### 1. Créer un projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → **New Project**
2. Choisir un nom, un mot de passe de base de données, une région proche

### 2. Exécuter le schéma SQL

1. Dans Supabase → **SQL Editor** → **New Query**
2. Coller le contenu de `supabase/schema.sql`
3. Cliquer **Run**

### 3. Créer les comptes utilisateurs

Dans Supabase → **Authentication** → **Users** → **Add User** (avec email confirmé automatique) :

| Email | Mot de passe | Rôle |
|---|---|---|
| ADMIN@airport.ma | ADMIN2024 | admin |
| AGENT.001@airport.ma | AGENT001 | agent |
| AGENT.002@airport.ma | AGENT002 | agent |

Après création de chaque utilisateur, copier son **UUID** depuis la liste Users.

Puis dans SQL Editor, insérer les profils :

```sql
INSERT INTO public.profiles (id, email, nom, matricule, role)
VALUES
  ('<UUID_ADMIN>',  'ADMIN@airport.ma',    'Administrateur', NULL,     'admin'),
  ('<UUID_AGENT1>', 'AGENT.001@airport.ma', 'Agent 001',     'AG-001', 'agent'),
  ('<UUID_AGENT2>', 'AGENT.002@airport.ma', 'Agent 002',     'AG-002', 'agent');
```

> Remplacer `<UUID_ADMIN>`, `<UUID_AGENT1>`, `<UUID_AGENT2>` par les vrais UUID.

### 4. Vérifier le bucket Storage

Dans Supabase → **Storage** → vérifier que le bucket `photos-controle` existe et est **Public**.  
Si absent : **New Bucket** → nom `photos-controle` → cocher **Public bucket**.

### 5. Configurer les credentials dans le code

Ouvrir `js/supabase-client.js` et remplacer :

```javascript
const SUPABASE_URL = 'https://VOTRE_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';
```

Les valeurs se trouvent dans Supabase → **Project Settings** → **API** :
- **Project URL** → `SUPABASE_URL`
- **Project API Keys** → `anon public` → `SUPABASE_ANON_KEY`

---

## ÉTAPE 2 – CLOUDFLARE PAGES

### 1. Préparer le dépôt GitHub

1. Créer un nouveau dépôt GitHub (public ou privé)
2. Pusher tous les fichiers du projet :

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/votre-username/controle-cabines.git
git push -u origin main
```

### 2. Déployer sur Cloudflare Pages

1. Aller sur [pages.cloudflare.com](https://pages.cloudflare.com)
2. **Create a project** → **Connect to Git** → sélectionner votre dépôt
3. Paramètres de build :

| Paramètre | Valeur |
|---|---|
| Framework preset | **None** |
| Build command | *(laisser vide)* |
| Build output directory | `/` |

4. Cliquer **Save and Deploy**

### 3. Variables d'environnement (optionnel)

Si vous préférez ne pas hardcoder les credentials, vous pouvez les définir dans Cloudflare Pages → Settings → Environment variables et les lire dynamiquement.

---

## ÉTAPE 3 – TEST DU CIRCUIT COMPLET

### Test Agent

1. Ouvrir l'URL Cloudflare Pages
2. Se connecter avec `AGENT.001@airport.ma` / `AGENT001`
3. Créer un nouveau contrôle :
   - Saisir le numéro de vol (ex: AT789)
   - Sélectionner le type d'avion
   - Cliquer **Commencer le contrôle**
4. Remplir la fiche :
   - Cocher C, NC ou NA pour chaque point
   - Sur un point NC : saisir une observation + prendre une photo
5. Vérifier la progression en haut (barre verte)
6. Cliquer **Soumettre le contrôle** → confirmer

### Test Admin

1. Se connecter avec `ADMIN@airport.ma` / `ADMIN2024`
2. Tableau de bord → vérifier les statistiques et graphiques
3. **Tous les contrôles** → trouver la fiche soumise par l'agent
4. Cliquer **Voir** → vérifier la fiche complète avec photos
5. Cliquer **Valider** → statut passe à "Validé"
6. **Non-conformités** → liste des NC avec photos
7. **Export** → télécharger le CSV

---

## Structure des fichiers

```
controle-cabines/
├── index.html              ← Page de connexion
├── agent.html              ← Interface agent de contrôle
├── admin.html              ← Interface administrateur
├── jsconfig.json           ← Configuration VS Code JS
├── css/
│   └── style.css           ← Styles communs (aucune lib externe)
├── js/
│   ├── supabase-client.js  ← Initialisation Supabase (configurer ici)
│   ├── auth.js             ← Login / logout / session / rôles
│   ├── agent.js            ← Logique formulaire agent
│   └── admin.js            ← Logique dashboard admin
└── supabase/
    └── schema.sql          ← Tables + RLS + Storage + triggers
```

---

## Fonctionnalités

### Interface Agent
- Formulaire en-tête du vol (numéro, date, type, immatriculation, heures)
- Fiche de contrôle en accordéon par zones (Cockpit, Cabine Y/CL, Cabine C/CL, Premium Economy, Crew Rest, Toilettes, Galley, Client)
- Boutons **C / NC / NA** stylisés (min 44px pour mobile)
- Observation + photo obligatoire sur point NC
- Compression image côté client (canvas, max 800px, qualité 0.75)
- Barre de progression en temps réel
- **Auto-save** : chaque changement enregistré après 1s (debounce)
- Mode hors ligne : sauvegarde localStorage + sync à la reconnexion
- Soumission avec modal de confirmation et résumé
- Liste "Mes contrôles" avec possibilité de continuer une fiche en cours

### Interface Admin
- Tableau de bord avec 4 cartes statistiques
- Graphiques CSS (barres horizontales/verticales) : vols/agent, conformité/zone, évolution 7j
- Top 10 non-conformités
- Activité temps réel (Supabase Realtime)
- Tableau complet avec filtres (agent, date, statut, type avion)
- Actions : Voir fiche, Valider, Rejeter (avec motif)
- Analyse par agent (stats + historique + NC fréquentes)
- Liste NC avec photos cliquables (lightbox)
- Gestion agents (liste, désactiver/activer, ajouter)
- Export CSV natif + impression PDF (window.print)

---

## Sécurité

- **RLS (Row Level Security)** activé sur toutes les tables
- Les agents ne voient et ne modifient que **leurs propres vols**
- Les admins voient **tout**
- Vérification du rôle à chaque chargement de page
- Compte inactif → déconnexion automatique

---

## Responsive Mobile

L'interface agent est optimisée pour smartphone en cabine d'avion :
- Sidebar rétractable (bouton hamburger)
- Boutons C/NC/NA : hauteur minimum 44px
- Capture photo directe depuis la caméra (`capture="camera"`)
- Topbar fixe

---

## Crédits

Application développée pour le contrôle qualité nettoyage cabines  
Fiche de référence : Gros Porteur Transit  
Stack : Supabase + Cloudflare Pages + Vanilla JS
