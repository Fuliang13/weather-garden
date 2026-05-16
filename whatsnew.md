# Weather Garden — What’s new

Ce fichier doit être mis à jour à chaque patch livré.

## Non publié


### Jardin / KML 1

- Activation réelle de l’import KML depuis l’onglet Jardin : sélection d’un fichier, envoi au Worker, parsing backend, rapport d’import visible et sauvegarde immédiate du GardenState dans KV.
- Ajout des endpoints `POST /api/garden/import-kml` et `GET /api/garden/export-kml`.
- L’export KML est généré depuis le GardenState persisté, avec téléchargement `weather-garden.kml`.
- Lecture KV de `garden_state` rendue tolérante : si la clé est absente, l’état par défaut est retourné ; si le JSON est corrompu, un état de récupération est retourné sans écraser la valeur corrompue.
- Le module KML importe désormais les cas simples de `MultiGeometry` en plusieurs entités liées, au lieu de ne conserver que la première géométrie.
- Le GardenState normalisé conserve maintenant les métadonnées légères d’import, `settings`, `metadata` et `style`, sans stocker le KML brut.
- Ajout de tests Worker pour import/export KML via KV et corruption de `garden_state`, et d’un test KML pour `MultiGeometry`.
- Limite : le fichier réel `Le clos noir - version améliorée.kml` est mentionné dans le manifeste mais n’est pas inclus dans le zip ChatGPT, donc la validation automatisée utilise des fixtures KML inline.

### Correctif socle historique météo

- Correction de la sanitation des messages d’erreur historisés : les URLs complètes sont désormais remplacées par `<redacted-url>`, au lieu de conserver les noms de paramètres sensibles comme `application_key` ou `api_key`.
- Renforcement des tests de non-exposition : URLs, noms de paramètres secrets, MAC, IMEI et tokens ne doivent pas apparaître dans les samples ni dans le diagnostic historique.
- Normalisation en LF des fichiers récents du socle historique.
- Ajout de `.gitattributes` pour stabiliser les fins de ligne des prochains patchs.
- Ajustement des tests KML pour rester exécutables dans le contexte exporté ChatGPT, sans dépendre de fixtures `.kml` exclues du zip.
- Aucun impact UI, aucun changement de stockage KV, aucun changement sur `/api/status` ou `/api/refresh`.

### Diagnostic historique météo

- Ajout de l’endpoint `GET /api/debug/weather-history`.
- Diagnostic compact du stockage KV `weather_history_recent` : présence de la clé, corruption éventuelle, nombre d’échantillons, timestamps extrêmes, rétention approximative, sources, niveaux de confiance et fraîcheur.
- L’endpoint ne retourne aucun sample complet, aucun payload source brut, aucun secret, aucun token, aucun header d’authentification, aucun MAC/IMEI complet et aucune URL signée.
- Gestion explicite des cas KV absent, clé absente, historique vide et JSON corrompu.
- Aucun impact UI, aucun stockage supplémentaire, aucun changement sur `/api/status` ou `/api/refresh`.
- Ajout de tests Vitest couvrant endpoint, KV vide/absent/corrompu, historique valide et non-exposition de données sensibles.
- Limite assumée : `lastSampleTooRecentSkips` est exposé à `0` tant qu’aucune métrique persistante dédiée n’existe.

### Socle historique météo / WGF

- Ajout d’un premier module d’historique météo public-safe avec `src/weatherHistory.js`.
- Ajout d’une persistance KV minimale sur la clé `weather_history_recent`.
- Conservation bornée des derniers échantillons météo récents, limitée à 72 entrées.
- Écriture ignorée lorsqu’un échantillon récent existe déjà depuis moins de 10 minutes, afin d’éviter une écriture KV à chaque refresh rapproché.
- Branchement de l’écriture historique après la mise à jour de `latest_status`, sans faire échouer `/api/refresh` si l’historique échoue.
- Ajout d’un format `weather-history-sample` destiné à conserver les informations utiles à la comparaison future entre observation locale, prévisions, radar et synthèse WGF.
- Les échantillons peuvent contenir : observation, prévision immédiate, horizons pluie, résumé radar, résumé WGF, fraîcheur des sources, état des sources et erreurs nettoyées.
- Exclusion explicite des secrets, tokens, headers d’authentification, MAC/IMEI complets, URL sensibles, HDF5 complets, blobs radar bruts et KML brut.
- Ajout de tests dédiés dans `test/weatherHistory.spec.js`.
- Ajout de la documentation `docs/weather-history.md`.

### Dashboard météo

- Réorganisation du Dashboard autour d’une lecture plus utile sur mobile : synthèse immédiate, radar pluie, comparaison réel/modèles, comparatif des prévisions, impacts jardin puis détails.
- Radar pluie remonté plus haut dans l’écran pour être visible plus rapidement, surtout sur mobile.
- Amélioration de la formulation des horizons pluie : les durées longues ne doivent plus être affichées brutalement en minutes.
- Synthèse pluie rendue plus compacte lorsque le signal est calme, afin d’éviter la répétition d’informations inutiles.
- Comparaison réel/modèles rendue plus explicite pour mieux distinguer l’observation locale et les prévisions.
- Prévision immédiate orientée modèles, avec clarification des sources utilisées.
- Correction du rendu responsive pour éviter les largeurs excessives et le scroll horizontal sur mobile.
- Amélioration du comparatif des prévisions : WGF plus identifiable, sources externes plus sobres, icônes météo intégrées et lecture plus visuelle.
- Ajout ou intégration des familles d’icônes météo dans `src/public/assets/weather-icons/wgf/` et `src/public/assets/weather-icons/source/`.

### Jardin / KML / géofencing

- Présence d’un socle Jardin structuré autour de `GardenState`, avec entités jardin, alertes et persistance KV.
- Présence d’un module KML `src/kml.js` destiné à l’import/export KML comme format d’échange, sans faire du KML brut une source de vérité.
- Présence d’un module `src/geofencing.js` pour préparer les calculs spatiaux utiles au jardin et aux futurs widgets contextuels.
- Présence de tests associés pour le modèle Jardin, KML et géofencing.
- Ajout d’une checklist UX d’acceptation Jardin dans `weather-garden-garden-ux-acceptance-template.md`.
- Ajout de revues QA/UX dans `docs/reviews/`.

### Sources météo / radar / capteurs

- Conservation du principe : Open-Meteo / AROME comme source principale de prévision immédiate, MET Norway comme confirmation indépendante, Ecowitt comme observation locale prioritaire, Météo-France Radar comme cible native et RainViewer comme fallback visuel.
- Le radar RainViewer reste un fallback visuel et ne doit pas devenir une source métier principale.
- Le radar Météo-France natif reste conditionné à une preuve complète : grille, dataset, projection, bounds et valeurs fiables.
- Les données Ecowitt doivent rester côté Worker et ne jamais exposer de secrets, clés, MAC complet ou IMEI complet.

### Documentation et organisation projet

- Ajout d’un fichier `AGENTS.md` décrivant les règles de travail, rôles, validations attendues et contraintes de sécurité du projet.
- Ajout ou mise à jour des fiches d’équipe Weather Garden.
- Ajout de documents de cadrage sur le modèle Jardin, l’API Worker Jardin, les alertes Jardin, les sources météo, le KML, la QA, la roadmap produit et la charte UX/UI.
- Ajout du présent fichier `whatsnew.md`, à maintenir dans chaque patch futur.

### Validation / qualité

- Les patchs doivent continuer à reporter les commandes exécutées, les tests passés, les tests non lancés et les risques résiduels.
- Pour chaque patch futur, `whatsnew.md` doit être mis à jour avec uniquement les changements réellement livrés.
- Ne pas ajouter dans ce fichier de fonctionnalités prévues mais non implémentées, sauf dans une section explicitement marquée comme limite ou suite recommandée.
