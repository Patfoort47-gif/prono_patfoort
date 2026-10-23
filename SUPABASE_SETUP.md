# Activer les comptes BetMaster

La synchronisation utilise l'offre gratuite de Supabase. Les données de chaque compte sont isolées par les règles RLS de la base.

1. Créez un projet sur [supabase.com](https://supabase.com/), puis ouvrez **SQL Editor** et exécutez le contenu de `supabase-schema.sql`.
   Pour activer les profils, avatars et classements de la V3, exécutez ensuite `supabase-v3-schema.sql` dans le même éditeur. Le script est réexécutable : relancez-le après une mise à jour de ces fonctions.
   Exécutez enfin `supabase-v4-schema.sql` (annuaire des joueurs) : il crée un profil public pour chaque compte, à l'inscription et pour les comptes existants, et rend le pseudo unique sans tenir compte de la casse. Ensuite `supabase-v5-schema.sql` (tickets certifiés) : paris, bankroll et statistiques passent côté serveur. Ordre à respecter : `supabase-schema.sql` (v1), `supabase-v3-schema.sql`, `supabase-v4-schema.sql`, `supabase-v5-schema.sql`, `supabase-v6-schema.sql` (points de ligue et quota hebdomadaire), `supabase-v7-schema.sql` (défi du jour), `supabase-v8-schema.sql` (ligue générale : saisons, groupes, classements), `supabase-v9-schema.sql` (ligues spéciales : compétitions et clubs), `supabase-v10-schema.sql` (XP, niveaux, trophées, défis hebdomadaires), `supabase-v11-schema.sql` (jetons et récompenses de saison), `supabase-v12-schema.sql` (club de cœur sur le profil), `supabase-v13-schema.sql` (page profil : confidentialité, pseudo mensuel, export et suppression du compte), `supabase-v14-schema.sql` (ligues privées entre amis), `supabase-v15-schema.sql` (hub communauté : suivis, fil d'activité, classements généraux, hall of fame), `supabase-v16-schema.sql` (boutique, bouclier de série, recharge de bankroll, duels, ligues premium payées en jetons). Les jetons n'ont aucune valeur : ils ne s'achètent pas, ne s'échangent pas et ne se convertissent pas. Les identifiants ESPN des 12 clubs de lancement sont dans ce script : à vérifier sur la première journée jouée. Jouez ensuite la recette de sécurité `supabase-v5-recette.sql`.
   Contrôle après exécution (doit renvoyer 0) : `select count(*) from auth.users u left join public.profiles p on p.user_id = u.id where p.user_id is null;`
2. Dans **Authentication > URL Configuration**, renseignez (la page « Rejoindre le club » renvoie ici après la confirmation d'email, la connexion Google et la réinitialisation du mot de passe) :
   - Site URL : `https://patfoort47-gif.github.io/prono_patfoort/`
   - Redirect URL : `https://patfoort47-gif.github.io/prono_patfoort/`
3. Dans le dépôt GitHub, ouvrez **Settings > Secrets and variables > Actions > Variables**, puis ajoutez :
   - `SUPABASE_URL` : l'URL du projet Supabase ;
   - `SUPABASE_ANON_KEY` : la clé publique `anon` / `publishable` du projet.
   Le déploiement accepte également ces valeurs dans **Secrets**. Si Supabase affiche une clé au nouveau format, vous pouvez la nommer `SUPABASE_PUBLISHABLE_KEY`.
4. Relancez le workflow **Deploy GitHub Pages** ou poussez un commit sur `main`.

Avatar 3D (BET-49) : exécutez `supabase-v17-schema.sql` après `supabase-v16-schema.sql`. Il valide la configuration de l'avatar, vérifie que chaque objet porté est possédé, offre aux anciens joueurs les lunettes et la casquette qu'ils portaient, et crée le seau public **avatars** dans Storage (Storage > Buckets doit le lister : public, 1,5 Mo au plus, WebP, JPEG ou PNG). Aucune clé supplémentaire : le navigateur envoie les images avec la session du joueur, chacun n'écrit que dans son dossier (`{user_id}/bust` et `{user_id}/full`). Contrôle : `select id, public from storage.buckets where id = 'avatars';` doit renvoyer une ligne.

La clé `service_role` n'est jamais utilisée par le site ni écrite dans le dépôt. Elle sert uniquement aux workflows : ajoutez-la comme **Secret** GitHub Actions nommé `SUPABASE_SERVICE_ROLE_KEY` (Settings > Secrets and variables > Actions > Secrets) pour que `scripts/sync-supabase.mjs` envoie les matchs et règle les paris certifiés. Sans ce secret, les paris restent en attente. La clé `anon` est publique ; la confidentialité repose sur les politiques RLS et les fonctions des scripts SQL.

Le workflow `close-season.yml` clôture chaque mois la saison de la ligue générale (montées, descentes, nouveaux groupes) avec le même secret `SUPABASE_SERVICE_ROLE_KEY`. Il tourne chaque jour à 00 h 30 (Paris) et ne fait rien tant qu'aucune saison n'est terminée ; il est relançable à la main (Actions > Clôturer la saison de ligue).

## Connexion Google

La page « Rejoindre le club » propose « Continuer avec Google ». Pour l'activer :

1. Dans la [console Google Cloud](https://console.cloud.google.com/), créez un projet puis un **ID client OAuth** de type « Application Web ». Ajoutez comme URI de redirection autorisée l'adresse de callback affichée par Supabase dans **Authentication > Providers > Google** (de la forme `https://<projet>.supabase.co/auth/v1/callback`).
2. Dans Supabase, ouvrez **Authentication > Providers > Google**, activez le fournisseur et collez l'ID client et le secret client.
3. Dans **Authentication > URL Configuration**, vérifiez que l'adresse GitHub Pages du site figure dans les URL de redirection autorisées (étape 2 ci-dessus).

Le secret client Google reste dans Supabase : il n'est jamais écrit dans le dépôt. Sans cette configuration, le bouton Google affiche une erreur et la connexion par email reste disponible. Dans **Authentication > Sign In / Providers**, vérifiez aussi que la confirmation d'email est activée.

### BET-78 · Saisons de football
Après V19, exécuter `supabase-v20-schema.sql`, puis lancer la synchronisation habituelle. La ligue générale utilise la clé `AAAA-AAAA` (1er juillet au 30 juin, Paris). Les points de l’année sportive courante sont rattachés à cette clé sans duplication, le dernier groupe est repris ; les classements et résultats mensuels passés restent consultables. Les anciennes saisons mensuelles ouvertes sont archivées sans nouvelle montée/descente. Les clôtures suivantes ont lieu après le 30 juin. Les mois des primes de compétitions et les quotas hebdomadaires restent distincts des saisons. Les dates propres aux compétitions restent dans `special_leagues.season_start/season_end` et doivent être mises à jour pour chaque édition.
