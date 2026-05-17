# MeteoFranceApiDocs

Documentation pratique des APIs Meteo-France utilisees, testees ou candidates pour Weather Garden.

Source context timestamp: `20260515-131547`.

Expected project root: `C:\Users\floja\weather-garden`.

Date de mise a jour de ce dossier: 2026-05-17.

## Fichiers crees

| Fichier | Role | Statut Weather Garden | Endpoints projet concernes | Limites connues |
| --- | --- | --- | --- | --- |
| `meteofrance-token-auth-doc.md` | Authentification API Key JWT et OAuth2 pour les appels Meteo-France. | Utilisee et testee par mocks locaux. | `/api/debug/meteofrance`, `/api/debug/meteofrance/hdf5`, `/api/refresh`, `/api/status`, `/api/debug/sources`. | OAuth2 peut retourner une page HTML `Request Rejected` depuis Cloudflare Worker d'apres le README et les tests. |
| `meteofrance-radar-api-doc.md` | Catalogue DPRadar et selection des produits radar `METROPOLE` / `LAME_D_EAU`. | Utilisee et testee par mocks locaux. | `/api/debug/meteofrance`, `/api/debug/meteofrance/hdf5`, `/api/refresh`, `/api/status`, `/api/debug/rain`, `/api/debug/sources`. | Les liens produit peuvent contenir des jetons; ils doivent etre nettoyes avant exposition. |
| `meteofrance-radar-hdf5-product-doc.md` | Telechargement et diagnostic du produit radar HDF5 500 m. | Testee; exploitable seulement quand grille, projection, bounds et valeurs sont verifiees. | `/api/debug/meteofrance/hdf5`, `/api/status`, `/api/refresh`, `/api/debug/rain`. | Le rendu natif reste bloque si le HDF5 ne peut pas etre decode et georeference sans ambiguite. |
| `meteofrance-forecast-candidate-doc.md` | APIs Meteo-France de prevision candidates, notamment AROME/ARPEGE. | Candidate; non integree directement dans le Worker. | Aucun endpoint Worker dedie. Indirectement le projet utilise Open-Meteo AROME via `src/sources/openMeteo.js`, qui n'est pas une API Meteo-France directe. | Endpoint officiel, schema exact, quotas et mapping non confirmes localement. |
| `meteofrance-observation-candidate-doc.md` | APIs Meteo-France d'observations in situ et climatologie candidates. | Candidate; non integree dans le Worker. | Aucun endpoint Worker dedie. | Endpoint officiel, schema exact, quotas et mapping non confirmes localement. |
| `meteofrance-source-inventory.md` | Inventaire de toutes les sources Meteo-France identifiees pour Weather Garden. | Reference documentaire. | Aucun endpoint Worker dedie. | Plusieurs sources sont candidates et non testees localement. |
| `meteofrance-climatology-api-doc.md` | DPClimatologie, agrometeorologie decadaire, ETP, longues series, series quotidiennes et fiches climatologiques. | Candidate. | Aucun endpoint Worker dedie. | Schemas exacts et endpoints non confirmes localement. |
| `meteofrance-swi-api-doc.md` | Indice d'humidite des sols SWI / CatNat. | Candidate. | Aucun endpoint Worker dedie. | Endpoint, format, resolution et frequence non confirmes localement. |
| `meteofrance-arome-native-api-doc.md` | AROME natif, AROME Outre-mer et AROME IFS. | Candidate. | Aucun endpoint Worker dedie. | Mapping direct non confirme; le projet utilise Open-Meteo AROME aujourd'hui. |
| `meteofrance-nowcasting-api-doc.md` | AROME-PI et PIAF pour prevision immediate. | Candidate. | Aucun endpoint Worker dedie. | Endpoint et payload non confirmes localement. |
| `meteofrance-arpege-ensemble-api-doc.md` | ARPEGE deterministe, ARPEGE ensemble, statistiques ensemble, AROME ensemble. | Candidate. | Aucun endpoint Worker dedie. | Resolution, variables et quotas non confirmes localement. |
| `meteofrance-radar-extended-products-doc.md` | Radar BUFR 1 km, reflectivite, COMEPHORE, radars individuels, PAM/PAG, archive FTP. | Candidate/test partiel. | `/api/debug/meteofrance/hdf5`, `/api/status`, `/api/refresh`. | Seul le fallback BUFR 1000 m est detecte; il n'est pas parse. |
| `meteofrance-vigilance-api-doc.md` | Vigilance Metropole, archives vigilance, Vigilance Outre-mer V6/V5. | Candidate. | Aucun endpoint Worker dedie. | Non teste localement. |
| `meteofrance-forest-api-doc.md` | Meteo des forets temps reel et archives. | Candidate. | Aucun endpoint Worker dedie. | Non teste localement. |
| `meteofrance-avalanche-nivology-api-doc.md` | Bulletins avalanche, observations nivo-meteorologiques, simulation nivologique. | Candidate specialisee. | Aucun endpoint Worker dedie. | Peu prioritaire hors zone montagne; non teste localement. |
| `meteofrance-marine-coastal-api-doc.md` | Bouees ancrees, modeles de vagues, surcote oceanique, BMS maritimes. | Candidate specialisee. | Aucun endpoint Worker dedie. | Peu prioritaire hors littoral; non teste localement. |
| `meteofrance-upperair-cyclone-api-doc.md` | Radiosondages et archives cycloniques Sud-Ouest ocean Indien. | Candidate specialisee. | Aucun endpoint Worker dedie. | Non teste localement. |

## APIs reellement testees

- Auth Meteo-France par header `apikey`, via tests Vitest mockes dans `test/meteofrance.spec.js`.
- Auth Meteo-France OAuth2 `/token`, via tests Vitest mockes dans `test/meteofrance.spec.js`.
- DPRadar catalogue et parcours de liens `mosaiques -> METROPOLE -> observations -> LAME_D_EAU`, via tests Vitest mockes.
- Produit radar HDF5 500 m, via fixtures HDF5 synthetiques dans `test/meteofrance.spec.js`, `test/meteofrance-native-raster.spec.js` et `test/meteofrance-odim-metadata.spec.js`.
- Produit radar BUFR 1000 m comme fallback de diagnostic, via metadata mockee; le BUFR n'est pas parse par Weather Garden.

## APIs non testees

- Meteo-France previsions natives AROME/ARPEGE: non testees car aucun adaptateur Worker Meteo-France direct n'existe actuellement.
- Meteo-France observations in situ: non testees car aucun adaptateur Worker n'existe actuellement.
- Meteo-France climatologie/ETP/SWI: non testees car aucun endpoint Worker ou fixture projet ne les consomme actuellement.
- Vigilance et Meteo des forets: non testees car hors comportement actuel du Worker.
- Avalanche/nivologie, marine/cotier, radiosondages, archives cycloniques, radars specialises, SWI/ETP et climatologie avancee: non testees car aucun adaptateur Worker ou fixture projet ne les consomme actuellement.

## Sources utilisees

- Documentation officielle Meteo-France, portail APIs donnees publiques: https://portail-api.meteofrance.fr/web/fr/liste-api/categorie/Donn%C3%A9esPubliques
- Documentation officielle Meteo-France Open Data: https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/overview?homepageId=222265642
- Documentation officielle donnees radar: https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/670924818/Donn%2Bes%2Bradars
- Documentation officielle donnees de prevision: https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/621019138/Mod%2Bles%2Bet%2Bdonn%2Bes%2Bde%2Bpr%2Bvision
- Documentation officielle observations in situ: https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/888143886/Observations%2Bin%2Bsitu
- Documentation officielle donnees climatologiques: https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/621510657/Donn%2Bes%2Bclimatologiques%2Bde%2Bbase
- Fichiers projet: `src/sources/meteofrance.js`, `src/worker.js`, `src/scoring.js`, `src/radarSynthesis.js`, `src/public/app.js`, `README.md`, `test/meteofrance.spec.js`, `test/meteofrance-native-raster.spec.js`, `test/meteofrance-odim-metadata.spec.js`.

## Regles de securite documentees

- Aucun token complet, API key, Basic credential, Bearer token, URL signee ou header d'autorisation reel ne doit etre ecrit dans cette documentation.
- Les exemples utilisent uniquement des placeholders comme `<METEOFRANCE_API_KEY>` ou `<ACCESS_TOKEN>`.
- Les payloads presentes sont des structures reduites issues du code et de tests mockes; ils ne sont pas des reponses API reelles copiees telles quelles.
- Les URLs produit exposees doivent etre nettoyees; les query params sensibles comme `token` doivent etre supprimes ou remplaces.
