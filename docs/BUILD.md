# Builds iOS de Sport

## Développement local

Depuis Linux ou macOS, avec Node.js et npm installés :

```sh
npm ci
npx expo start --go
```

Expo Go sert au test quotidien des écrans qui ne nécessitent pas de code natif personnalisé. Le coffre Face ID et la protection native des fichiers doivent être vérifiés dans une vraie build iOS.

## Build iOS automatique

Un push vers `main` lance `.github/workflows/build-ios.yml` :

```text
git commit
git push origin main
        ↓
GitHub Actions (runner macOS / Xcode)
        ↓
Expo prebuild → CocoaPods → Release iphoneos non signée
        ↓
validation → artifact Sport-IPA → GitHub prerelease
```

Le workflow peut aussi être lancé manuellement dans GitHub : **Actions → Build unsigned iOS IPA → Run workflow**, en sélectionnant `main`. Il utilise `npm ci` et le lockfile du dépôt. Il ne fait pas appel à EAS.

Le fichier attaché au Release suit cette forme :

```text
Sport-1.0.0-build42-a1b2c3d.ipa
```

La version marketing vient de `app.json`, le build number est le numéro de run GitHub, et le suffixe est le hash court du commit. Chaque run produit le tag `build-<numéro>-<hash>` et un prerelease distinct. L'Actions artifact `Sport-IPA` est conservé 14 jours en plus de l'asset du Release.

### Signature et compte Apple

GitHub compile `iphoneos/Release` pour arm64 avec la signature Xcode désactivée. Il emballe le bundle résultant sous `Payload/Sport.app` dans une archive IPA et vérifie notamment son bundle identifier, son architecture, son plist et l'absence de signature/provisioning profile.

Cette IPA est **non signée**. Elle n'est pas directement installable par iOS en l'état : SideStore doit la re-signer pour l'appareil avec le certificat de développement lié au compte Apple de l'utilisateur. GitHub Actions n'a besoin d'aucun Apple ID, certificat, provisioning profile, team ID ou secret Apple. Aucun abonnement Apple Developer payant n'est requis pour produire cette build; le compte et les limites d'utilisation de SideStore restent indépendants du pipeline. Avec un compte Apple gratuit, SideStore indique notamment des limites de nombre d'apps et d'App IDs actifs [dans sa FAQ](https://docs.sidestore.io/docs/faq).

### Installer depuis SideStore

1. Dans **Releases** du dépôt GitHub, ouvrir le prerelease voulu et télécharger son fichier `.ipa` sur l'iPhone. L'Actions artifact `Sport-IPA` est aussi disponible depuis la page du run, mais le Release est la source habituelle.
2. Ouvrir/importer l'IPA dans SideStore (depuis Fichiers ou le partage iOS), puis lancer l'installation. SideStore signe l'app avec le compte Apple configuré dans SideStore.
3. Si SideStore n'est pas encore installé et configuré, suivre son [guide officiel d'installation](https://docs.sidestore.io/docs/installation/install) avant d'importer Sport.

Le guide SideStore peut demander d'approuver le profil développeur dans Réglages et d'activer LocalDevVPN selon l'état de configuration de l'appareil. La procédure peut varier selon la version d'iOS et de SideStore. L'IPA n'est pas déclarée installable tant que l'import, la signature SideStore, l'ouverture de l'app et le coffre Face ID n'ont pas été vérifiés sur l'iPhone cible.

## EAS

EAS n'est plus utilisé par ce pipeline. `eas.json` et les références de projet EAS dans `app.json` sont conservés temporairement : aucune build GitHub ne les utilise, et ils pourront être supprimés après validation d'un Release GitHub puis d'une installation SideStore réussie. Cette vérification réelle n'a pas encore eu lieu.
