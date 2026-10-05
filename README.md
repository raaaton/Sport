# Sport

Sport est une application personnelle de suivi d'entraînement, conçue d'abord pour iOS avec React Native, Expo et TypeScript. Elle fonctionne localement et hors ligne : les séances et l'inventaire sont stockés dans SQLite, sans compte ni backend.

## État du projet

| Étape | État |
| --- | --- |
| Fondations, navigation native et tabs Liquid Glass | Validée sur iPhone |
| Séances, séries, persistance et repos | Validée sur iPhone |
| Progression et historique 2.0 | Validée sur iPhone |
| Système de lest | Implémenté; validation iPhone à faire |
| Notifications locales et planning éditable | Implémentés; validation iPhone à faire |
| Coffre de photos de progression | Implémenté; development build et validation iPhone obligatoires |
| Live Activity / Dynamic Island (étape 9) | Présentation et expiration programmée implémentées; validation de cette version iOS 26 sur iPhone en attente |

Les fonctions livrées comprennent Aujourd'hui, le démarrage et la reprise d'une séance, la saisie des séries, le timer de repos et sa Live Activity, l'historique avec ajout/modification/suppression, la progression basée sur les performances, le calcul des charges réalisables à partir du matériel, les notifications locales, et un coffre privé pour les photos de progression.

Le système de lest utilise un sac fixe de 3,0 kg et des objets dont les poids sont combinés à la demande. Les séances conservent la charge et sa composition telles qu'elles ont été enregistrées, même si l'inventaire change ensuite.

Les rappels locaux de séance sont opt-in et utilisent les jours actifs du planning. Chaque séance dispose de sa propre heure de rappel, à la minute, configurée dans Réglages > Planning; une heure absente ne programme aucun rappel. La page Planning permet aussi de déplacer, renommer, activer/désactiver et composer chaque séance avec les exercices disponibles, dans un ordre choisi. Les rappels de progression photo sont mensuels, à 06:00 par défaut, et ne contiennent aucune information privée. Les requêtes de séance sont programmées concrètement sur 28 jours et ignorent une date où une séance a déjà commencé.

Le sélecteur d'heure utilise le composant natif SwiftUI `DatePicker` via `@expo/ui`, compatible avec Expo Go en SDK 57. Sport cible désormais iOS 26 minimum. Le repos expose une Live Activity via `expo-widgets`, rendue en SwiftUI dans l'extension: countdown système basé sur l'échéance SQLite, exercice et prochaine série, bouton Pause/Reprendre, réconciliation au lancement et lien vers la bonne séance. Une seconde activité locale est programmée à l'échéance pour demander à iOS d'afficher `Repos terminé` dans l'Île dynamique, même si l'app est suspendue; pause, reprise, skip et fin anticipée annulent ou remplacent cette échéance. Expo Go ne contient pas cette extension; il faut installer l'IPA GitHub avec SideStore pour la valider. Shortcuts n'est pas encore implémenté.

Le coffre chiffre les photos et leurs miniatures en AES-256-GCM dans le conteneur privé de Sport. La clé aléatoire est gardée dans SecureStore avec la protection du jeu biométrique actuel et de cet appareil. Progression demande une action explicite de Face ID, se verrouille en quittant l'onglet et masque l'aperçu natif de l'app lors des transitions vers l'arrière-plan. L'import depuis Photos ou la caméra crée une copie indépendante. L'export vers Photos est explicite et la copie exportée n'est plus protégée par le coffre. Le coffre nécessite un development build iOS : Expo Go ne contient pas le module local de protection de fichiers/aperçus, et ne permet pas de valider Face ID.

## Développement

Prérequis : Node.js et npm. Depuis la racine du dépôt :

```sh
npm ci
npx expo start --go
```

`npm start` lance Expo en mode Go. Ouvre ensuite le projet avec Expo Go. Le coffre Face ID et la Live Activity nécessitent une vraie build iOS; la Live Activity se teste avec l'IPA non signée, après installation avec SideStore.

## Build iOS pour SideStore

Chaque push vers `main` déclenche un build iOS non signé sur GitHub Actions et publie l'IPA comme asset d'une Release GitHub normale. SideStore est chargé de signer l'IPA pour l'iPhone. Voir [docs/BUILD.md](docs/BUILD.md) pour le workflow, le versioning et les étapes d'installation.

Pour lancer la version web :

```sh
npm run web
```

## Vérifications

```sh
npx tsc --noEmit
npm run lint
npm test
npx expo install --check
npx expo export --platform ios
git diff --check
```

L'export iOS vérifie la génération du bundle JavaScript; il ne remplace pas un test sur iPhone. La présentation resserrée, l'unique bouton Pause/Reprendre et l'expiration programmée nécessitent encore une validation sur iPhone avec l'IPA construite pour iOS 26 minimum. Vérifier l'expansion à l'échéance quand Sport est au premier plan puis suspendue, l'annulation en pause/reprise/skip, et le rendu sur Lock Screen et Dynamic Island.

## Organisation

- `app/` — routes Expo Router et navigation
- `src/features/` — écrans et logique par fonctionnalité : Today, workout, History, progression, Settings et lest
- `src/shared/` — base SQLite, thème, haptics et composants partagés
- `tests/` — tests automatisés du domaine et des accès SQLite
- `docs/DESIGN.md` — conventions visuelles et d'interaction
- `PROJECT.md` — spécification produit
- `.agent/exec-plans/` — plans de travail des étapes importantes

SQLite est la source de vérité des données d'entraînement. Les changements de schéma passent par des migrations; aucune donnée d'entraînement ne dépend d'un service distant.
