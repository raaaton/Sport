# Sport

Sport est une application personnelle de suivi d'entraînement, conçue d'abord pour iOS avec React Native, Expo et TypeScript. Elle fonctionne localement et hors ligne : les séances et l'inventaire sont stockés dans SQLite, sans compte ni backend.

## État du projet

| Étape | État |
| --- | --- |
| Fondations, navigation native et tabs Liquid Glass | Validée sur iPhone |
| Séances, séries, persistance et repos | Validée sur iPhone |
| Progression et historique 2.0 | Validée sur iPhone |
| Système de lest | Implémenté; validation iPhone à faire |
| Notifications locales | Implémentées; validation iPhone à faire |

Les fonctions livrées comprennent Aujourd'hui, le démarrage et la reprise d'une séance, la saisie des séries, le timer de repos, l'historique avec ajout/modification/suppression, la progression basée sur les performances, et le calcul des charges réalisables à partir du matériel.

Le système de lest utilise un sac fixe de 3,0 kg et des objets dont les poids sont combinés à la demande. Les séances conservent la charge et sa composition telles qu'elles ont été enregistrées, même si l'inventaire change ensuite.

Les rappels locaux de séance sont opt-in et utilisent les jours actifs du planning. Comme aucun horaire de séance n'était défini, ils restent désactivés jusqu'au choix d'une heure. Les rappels de progression photo sont mensuels, à 06:00 par défaut, et ne contiennent aucune information privée. Les requêtes de séance sont programmées concrètement sur 28 jours et ignorent une date où une séance a déjà commencé.

Le coffre photo, Face ID, Live Activities / Dynamic Island, Shortcuts et iCloud ne sont pas encore implémentés.

## Développement

Prérequis : Node.js et npm. Depuis la racine du dépôt :

```sh
npm ci
npm start
```

`npm start` lance Expo en mode Go. Ouvre ensuite le projet avec Expo Go. Certaines fonctions qui nécessiteront un runtime iOS natif seront testées plus tard avec un development build.

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

L'export iOS vérifie la génération du bundle JavaScript; il ne remplace pas un test sur iPhone.

## Organisation

- `app/` — routes Expo Router et navigation
- `src/features/` — écrans et logique par fonctionnalité : Today, workout, History, progression, Settings et lest
- `src/shared/` — base SQLite, thème, haptics et composants partagés
- `tests/` — tests automatisés du domaine et des accès SQLite
- `docs/DESIGN.md` — conventions visuelles et d'interaction
- `PROJECT.md` — spécification produit
- `.agent/exec-plans/` — plans de travail des étapes importantes

SQLite est la source de vérité des données d'entraînement. Les changements de schéma passent par des migrations; aucune donnée d'entraînement ne dépend d'un service distant.
