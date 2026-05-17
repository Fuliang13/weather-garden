# Meteo-France Observations In Situ API

Date de documentation: 2026-05-17.

Statut Weather Garden: candidate documentee, testee manuellement, non integree dans le Worker.

Cette fiche est centree sur les observations temps reel ou quasi temps reel. La climatologie et les archives qualifiees sont traitees separement dans `meteofrance-climatology-api-doc.md`.

## Sources consultees

- Documentation officielle: `API Ciblee Donnees d'Observation`, mise a jour le 2026-03-12.
- Documentation officielle: `API Paquet Observations`, mise a jour le 2025-07-10.
- Descriptif technique officiel: `des donnees d'Observations du reseau sol de France`, version du 2025-03-15.
- Fichiers projet: `src/worker.js`, `src/scoring.js`, `src/sources/ecowitt.js`, `src/gardenAlerts.js`, `README.md`.
- Tests API reels lances localement le 2026-05-17 avec une cle locale, sortie tronquee et sans secret.

## 1. Role de la source dans Weather Garden

Cette source peut completer ou remplacer partiellement l'observation locale Ecowitt pour les conditions mesurees par une station Meteo-France proche:

- observation station officielle pour le Dashboard;
- confirmation pluie locale pour le score pluie;
- verification des modeles Open-Meteo AROME / MET Norway;
- contexte jardin: humidite, temperature, gel, pluie recente, vent, rafales, rayonnement si disponible;
- diagnostic de fraicheur d'une station publique.

Elle ne doit pas devenir une archive climatologique; les donnees d'observation DPObs ont une retention de 24h.

## 2. Nom officiel exact de l'API ou du produit

API principale:

- `API Ciblee Donnees d'Observation`
- endpoint racine observe/documente: `https://public-api.meteofrance.fr/public/DPObs`

API paquet associee:

- `API Paquet Observations`
- endpoint racine documente: `https://public-api.meteofrance.fr/public/DPPaquetObs`

Produit technique:

- `donnees d'Observations du reseau sol de France`

## 3. Endpoints officiels

Stations terrestres du reseau Meteo-France:

```text
GET https://public-api.meteofrance.fr/public/DPObs/liste-stations
GET https://public-api.meteofrance.fr/public/DPObs/station/infrahoraire-6m
GET https://public-api.meteofrance.fr/public/DPObs/station/horaire
```

SYNOP, inclus dans l'API officielle mais secondaire pour Weather Garden:

```text
GET https://public-api.meteofrance.fr/public/DPObs/liste-stations-synop
GET https://public-api.meteofrance.fr/public/DPObs/v1/synop
```

Bouees, incluses dans l'API officielle mais hors cible jardin terrestre:

```text
GET https://public-api.meteofrance.fr/public/DPObs/liste-bouees
GET https://public-api.meteofrance.fr/public/DPObs/v1/bouees
```

Paquets utiles pour decouvrir toutes les stations a une date donnee:

```text
GET https://public-api.meteofrance.fr/public/DPPaquetObs/paquet/stations/infrahoraire-6m
GET https://public-api.meteofrance.fr/public/DPPaquetObs/paquet/stations/horaire
```

Paquets 24h documentes:

```text
GET https://public-api.meteofrance.fr/public/DPPaquetObs/paquet/infra-horaire-6m
GET https://public-api.meteofrance.fr/public/DPPaquetObs/paquet/horaire
```

## 4. Methode HTTP

`GET` pour tous les endpoints documentes ci-dessus.

## 5. Mode d'authentification

Documentation officielle: les exemples utilisent OAuth2 avec:

```http
Authorization: Bearer <TOKEN>
```

Test local Weather Garden du 2026-05-17: la cle locale `METEOFRANCE_API_KEY` a aussi permis d'appeler `DPObs/liste-stations`, `DPObs/station/infrahoraire-6m` et `DPObs/station/horaire` avec:

```http
apikey: <METEOFRANCE_API_KEY>
```

Conclusion integration: reutiliser prudemment la strategie existante Meteo-France du Worker (`api-key` d'abord, OAuth2 ensuite si disponible), mais verifier en test d'integration avant merge.

## 6. Headers requis

Headers confirmes par la documentation officielle:

```http
accept: */*
Authorization: Bearer <TOKEN>
```

Headers confirmes par test local Weather Garden avec API key:

```http
accept: */*
apikey: <METEOFRANCE_API_KEY>
```

`accept: application/json` n'a pas ete teste sur DPObs. Non confirmé dans les sources disponibles.

## 7. Query parameters exacts

`/liste-stations`:

- `format`: optionnel dans les exemples officiels; le test local sans `format` retourne un CSV `text/plain; charset=ISO-8859-1`.

`/station/infrahoraire-6m`:

- `id_station`: obligatoire pour cibler une station terrestre; identifiant station a 8 chiffres.
- `format`: exemple officiel et test local: `geojson`.
- `date`: optionnel; si absent, la date courante est utilisee d'apres la nomenclature officielle des fichiers.

`/station/horaire`:

- `id_station`: obligatoire pour cibler une station terrestre; identifiant station a 8 chiffres.
- `format`: exemple teste: `geojson`.
- `date`: optionnel; si absent, la date courante est utilisee d'apres la nomenclature officielle des fichiers.

`/v1/synop`:

- `format`: exemples officiels: `csv`, `json`, `geojson`.
- `id_station`: optionnel; identifiant SYNOP a 5 chiffres, plusieurs valeurs separees par virgule possible.
- `date_debut`: optionnel pour periode specifique; format `AAAA-MM-JJTHH:00:00Z`.
- `date_fin`: optionnel pour periode specifique; format `AAAA-MM-JJTHH:00:00Z`.

`/v1/bouees`:

- `format`: exemples officiels: `csv`.
- `id_bouees`: optionnel; identifiant bouee a 7 chiffres, plusieurs valeurs separees par virgule possible.
- `date_debut`: optionnel.
- `date_fin`: optionnel.

`DPPaquetObs /paquet/stations/infrahoraire-6m`:

- `date`: exemple officiel: `2024-05-06T18:00:00Z`; pour les donnees 6 minutes, minutes rondes et secondes `00`, par exemple `hh:06:00Z`.
- `format`: exemple officiel: `geojson`.

`DPPaquetObs /paquet/stations/horaire`:

- `date`: pour les donnees horaires, heure ronde `hh:00:00Z`.
- `format`: Non confirmé dans les sources disponibles pour un test local Weather Garden.

## 8. Exemple de requete anonymise

Liste des stations:

```bash
curl "https://public-api.meteofrance.fr/public/DPObs/liste-stations" \
  -H "accept: */*" \
  -H "apikey: <METEOFRANCE_API_KEY>"
```

Observation 6 minutes d'une station:

```bash
curl "https://public-api.meteofrance.fr/public/DPObs/station/infrahoraire-6m?id_station=01014002&format=geojson" \
  -H "accept: */*" \
  -H "apikey: <METEOFRANCE_API_KEY>"
```

Observation horaire d'une station:

```bash
curl "https://public-api.meteofrance.fr/public/DPObs/station/horaire?id_station=01014002&format=geojson" \
  -H "accept: */*" \
  -H "apikey: <METEOFRANCE_API_KEY>"
```

## 9. Format reel de reponse observe

Tests API reels lances localement le 2026-05-17. Aucun secret n'a ete affiche ni conserve.

`GET /DPObs/liste-stations`:

- statut HTTP: `200`;
- content-type: `text/plain; charset=ISO-8859-1`;
- taille observee: `139778` octets;
- format: CSV separe par `;`.

Extrait structurel:

```csv
Id_station;Id_omm;Nom_usuel;Latitude;Longitude;Altitude;Date_ouverture;Pack
01014002;;ARBENT;46.278167;5.669000;534;2003-10-01;RADOME
01027003;;BALAN_AERO;45.833000;5.106667;196;2014-05-26;ETENDU
```

`GET /DPObs/station/infrahoraire-6m?id_station=01014002&format=geojson`:

- statut HTTP: `200`;
- content-type: `application/json; charset=UTF-8`;
- format: tableau JSON de `Feature` GeoJSON.

Extrait structurel reel tronque:

```json
[
  {
    "type": "Feature",
    "geometry": {
      "type": "Point",
      "coordinates": [5.669, 46.278167]
    },
    "properties": {
      "geo_id_insee": "01014002",
      "reference_time": "2026-05-17T08:36:04Z",
      "insert_time": "2026-05-17T08:30:36Z",
      "validity_time": "2026-05-17T08:30:00Z",
      "t": 285.15,
      "td": 279.65,
      "u": 69,
      "dd": 340,
      "ff": 1.4,
      "dxi10": 320,
      "fxi10": 3.8,
      "rr_per": 0.0,
      "ray_glo01": null,
      "pres": null,
      "pmer": null
    }
  }
]
```

`GET /DPObs/station/horaire?id_station=01014002&format=geojson`:

- statut HTTP: `200`;
- content-type: `application/json; charset=UTF-8`;
- format: tableau JSON de `Feature` GeoJSON.

Extrait structurel reel tronque:

```json
[
  {
    "type": "Feature",
    "geometry": {
      "type": "Point",
      "coordinates": [5.669, 46.278167]
    },
    "properties": {
      "geo_id_insee": "01014002",
      "reference_time": "2026-05-17T08:10:06Z",
      "insert_time": "2026-05-17T08:02:16Z",
      "validity_time": "2026-05-17T08:00:00Z",
      "t": 282.75,
      "td": 278.75,
      "tx": 282.75,
      "tn": 279.85,
      "u": 76,
      "ux": 89,
      "un": 76,
      "dd": 330,
      "ff": 1.2,
      "dxy": 340,
      "fxy": 1.4,
      "dxi": 310,
      "fxi": 2.7,
      "rr1": 0.0,
      "ray_glo01": null,
      "pres": null,
      "pmer": null
    }
  }
]
```

## 10. Champs disponibles

Champs 6 minutes confirmes par le descriptif officiel:

| Champ | Description | Unite / format |
| --- | --- | --- |
| `geo_id_insee` | identifiant du point defini par le numero Insee | texte |
| `lat` | latitude du poste | degre |
| `lon` | longitude du poste | degre |
| `validity_time` | date/heure de validite | ISO 8601 UTC |
| `insert_time` | date/heure d'insertion | ISO 8601 UTC |
| `reference_time` | date/heure de production | ISO 8601 UTC |
| `t` | temperature sous abri | K |
| `u` | humidite relative | % |
| `dd` | direction de `ff` | degre |
| `ff` | vent moyen a 10 m | m/s |
| `dxi10` | direction de `fxi10` | degre |
| `fxi10` | vent instantane maximal sur 10 min a 10 m | m/s |
| `rr_per` | precipitation tombee sur 6 min | mm |
| `t_10`, `t_20`, `t_50`, `t_100` | temperature sol a profondeur 10/20/50/100 cm | K |
| `vv` | visibilite horizontale | m |
| `etat_sol` | code etat du sol | code de reference |
| `sss` | hauteur neige | m |
| `insolh` | duree d'insolation sur la periode | min |
| `ray_glo01` | rayonnement global sur la periode | J/m2 |
| `pres` | pression station | Pa |
| `pmer` | pression mer | Pa |

Champs horaires confirmes en plus:

| Champ | Description | Unite / format |
| --- | --- | --- |
| `td` | point de rosee a 2 m | K |
| `tx` | temperature maximale de l'air a 2 m dans l'heure | K |
| `tn` | temperature minimale de l'air a 2 m dans l'heure | K |
| `ux` | humidite relative maximale dans l'heure | % |
| `un` | humidite relative minimale dans l'heure | % |
| `dxy` | direction de `fxy` | degre |
| `fxy` | force maximale de `ff` dans l'heure a 10 m | m/s |
| `dxi` | direction de `fxi` | degre |
| `fxi` | vent instantane maximal dans l'heure a 10 m | m/s |
| `rr1` | precipitation dans l'heure | mm |
| `n` | nebulosite totale | octas |

Station list confirmee par test local:

| Champ | Description observee |
| --- | --- |
| `Id_station` | identifiant station a 8 chiffres |
| `Id_omm` | identifiant OMM, vide pour certaines stations |
| `Nom_usuel` | nom usuel station |
| `Latitude` | latitude |
| `Longitude` | longitude |
| `Altitude` | altitude |
| `Date_ouverture` | date ouverture |
| `Pack` | famille/pack station, exemples observes `RADOME`, `ETENDU` |

## 11. Champs utiles pour Weather Garden

Priorite directe:

- `t`: temperature mesuree;
- `u`: humidite relative;
- `rr_per`: pluie recente 6 min;
- `rr1`: cumul pluie horaire;
- `ff`: vent moyen;
- `fxi10` ou `fxi`: rafales / vent instantane maximal;
- `pres` ou `pmer`: pression;
- `ray_glo01`: rayonnement global si non null;
- `geo_id_insee` ou `Id_station`: identifiant station;
- `Nom_usuel`: nom station depuis `liste-stations`;
- `geometry.coordinates` ou `Latitude`/`Longitude`: position station;
- `Altitude`: altitude depuis `liste-stations`;
- `validity_time`: timestamp meteo;
- `insert_time` / `reference_time`: diagnostic de fraicheur.

Secondaire:

- `td`, `tx`, `tn`, `ux`, `un`;
- temperatures sol `t_10`, `t_20`, `t_50`, `t_100`;
- `etat_sol`, `sss`, `vv`, `n`.

## 12. Mapping cible vers le modele interne Weather Garden

| Weather Garden cible | Champ DPObs | Transformation |
| --- | --- | --- |
| `source` | constant | `meteofrance-observation` |
| `station.id` | `geo_id_insee` ou `Id_station` | conserver comme string 8 chiffres |
| `station.name` | `Nom_usuel` | depuis `liste-stations`; absent dans payload station |
| `station.latitude` | `geometry.coordinates[1]` ou `Latitude` | nombre |
| `station.longitude` | `geometry.coordinates[0]` ou `Longitude` | nombre |
| `station.altitudeM` | `Altitude` | nombre |
| `current.timestamp` | `validity_time` | ISO UTC |
| `current.temperatureC` | `t` | `K - 273.15` |
| `current.humidityPercent` | `u` | deja en % |
| `current.rain6mMm` | `rr_per` | deja en mm |
| `current.rain1hMm` | `rr1` | deja en mm |
| `current.windKmh` | `ff` | `m/s * 3.6` |
| `current.gustKmh` | `fxi10` ou `fxi` | `m/s * 3.6` |
| `current.windDirectionDeg` | `dd` | deja en degres |
| `current.pressureHpa` | `pres` | `Pa / 100` |
| `current.seaLevelPressureHpa` | `pmer` | `Pa / 100` |
| `current.globalRadiationJm2` | `ray_glo01` | deja en J/m2 |
| `freshness.observedAt` | `validity_time` | date source |
| `freshness.insertedAt` | `insert_time` | date ingestion Meteo-France |
| `freshness.referenceAt` | `reference_time` | date production |
| `freshness.ageMinutes` | `now - validity_time` | calcul Worker |

Decision a prendre avant integration: exposer `rainRateMmPerHour` derive de `rr_per * 10` ou garder `rain6mMm` separe. Pour eviter d'inventer une intensite instantanee, preferer `rain6mMm` et `rain1hMm` dans un premier patch.

## 13. Unites exactes

- temperature air et sol: kelvins (`K`);
- humidite relative: pourcentage;
- direction vent: degres;
- vent moyen et rafales: metres par seconde (`m/s`);
- precipitation: millimetres (`mm`);
- visibilite: metres (`m`);
- neige: metres (`m`);
- insolation: minutes;
- rayonnement global: joules par metre carre (`J/m2`);
- pression station et mer: pascals (`Pa`);
- nebulosite: octas;
- timestamps: ISO 8601 UTC.

## 14. Pas temporel disponible

Confirme par documentation officielle:

- stations terrestres 6 minutes: toutes les 6 minutes;
- stations terrestres horaires: horaire, heure ronde + environ 10 minutes;
- liste stations: horaire;
- SYNOP: toutes les 3 heures, delai de mise a disposition environ 1 heure;
- bouees: horaire, heure ronde + environ 10 minutes;
- retention DPObs: 24h.

Quotidien: non applicable a cette API temps reel; voir climatologie.

## 15. Couverture

Documentation officielle:

- domaine: France metropole et outre-mer;
- granularite API ciblee: 1 station;
- API paquet: 1 station, 1 departement ou toutes les stations selon endpoint;
- `liste-stations` testee localement retourne des stations metropole et outre-mer d'apres la documentation et un CSV de 139778 octets.

Station proche de la localisation Weather Garden: non determinee dans cette fiche. Il faudra utiliser `liste-stations`, filtrer par distance a `APP_LATITUDE` / `APP_LONGITUDE`, puis tester les champs disponibles station par station.

## 16. Fraicheur attendue

Documentation officielle:

- 6 minutes: toutes les 6 minutes;
- horaire: heure ronde + environ 10 minutes;
- retention: 24h.

Recommandation Weather Garden pour un premier patch:

- source `fresh` si `validity_time` a moins de 20 minutes pour le flux 6 minutes;
- source `stale` si entre 20 et 90 minutes;
- source `unavailable` si plus ancien, vide ou erreur.

Ces seuils sont une proposition Weather Garden, pas une contrainte officielle. Non confirmé dans les sources disponibles.

## 17. Erreurs observees

Erreurs documentees officiellement:

- CSV avec seulement l'entete ou JSON avec liste vide: station inexistante ou requete dans le futur;
- HTTP 400 `Identifiant station semantiquement incorrect`: identifiant station terrestre pas exactement sur 8 chiffres;
- HTTP 400 `Le parametre xxx est une date future.`;
- API Paquet: HTTP 400 `Controle de parametres en erreur` si departement inexistant;
- API Paquet: HTTP 400 `Controles de date en erreur` si format/contraintes de date incorrects.

Erreurs observees localement:

- aucun echec API avec `apikey` sur les trois appels testes;
- un premier essai sans acces reseau sandbox a echoue avec `Impossible de se connecter au serveur distant`; ce n'est pas une erreur Meteo-France.

## 18. Limites techniques

- Le payload station ne contient pas le nom usuel ni l'altitude; il faut joindre avec `liste-stations`.
- Les champs peuvent etre `null`; la documentation officielle le confirme.
- Les temperatures sont en Kelvin, pas en Celsius.
- La pression est en Pa, pas hPa.
- `liste-stations` est en ISO-8859-1 et CSV `;`, pas JSON par defaut.
- Les identifiants des departements 01 a 09 doivent conserver leur zero initial dans `id_station`.
- Les donnees sont brutes temps reel sur 24h, pas des archives qualifiees.
- Le choix de la station la plus proche doit verifier la disponibilite reelle des variables utiles, pas seulement la distance.

## 19. Fallback Weather Garden si source absente

Ordre de fallback recommande:

1. Ecowitt si configure, frais et valide.
2. DPObs station proche si integree, fraiche et avec champs utiles non null.
3. Open-Meteo AROME / MET Norway pour les conditions et previsions.
4. Radar Meteo-France / RainViewer pour pluie observee ou visuelle.

Si DPObs echoue, `/api/status` doit rester fonctionnel et marquer `meteofrance-observation` comme `unavailable` ou `stale`, sans inventer de valeurs.

## 20. Endpoints Worker futurs concernes

Integration future probable:

- `GET /api/refresh`: fetch DPObs avec les autres sources;
- `GET /api/status` et `/api/public-status`: exposition normalisee public-safe;
- `GET /api/debug/sources`: etat source DPObs;
- `GET /api/debug/rain`: contribution pluie observee;
- `GET /api/debug/weather-history`: echantillon public-safe, sans payload brut;
- futur endpoint possible `GET /api/debug/meteofrance/observations`: diagnostic station, champs disponibles, fraicheur, sans secret.

Ne pas modifier ces endpoints dans cette fiche documentaire.

## 21. Tests effectues

Tests API reels, le 2026-05-17:

| Test | Endpoint | Auth | Resultat |
| --- | --- | --- | --- |
| Liste stations | `/public/DPObs/liste-stations` | `apikey` local | HTTP 200, CSV `text/plain; charset=ISO-8859-1`, 139778 octets |
| Station 6 min | `/public/DPObs/station/infrahoraire-6m?id_station=01014002&format=geojson` | `apikey` local | HTTP 200, JSON GeoJSON, champs `t`, `u`, `ff`, `fxi10`, `rr_per` confirmes |
| Station horaire | `/public/DPObs/station/horaire?id_station=01014002&format=geojson` | `apikey` local | HTTP 200, JSON GeoJSON, champs `tx`, `tn`, `rr1`, `fxy`, `fxi` confirmes |

Tests non effectues:

- OAuth2 Bearer DPObs: pas de `METEOFRANCE_APPLICATION_ID` disponible dans `.dev.vars`.
- SYNOP: non teste, secondaire pour le patch Weather Garden initial.
- Bouees: non teste, hors cible jardin terrestre.
- DPPaquetObs: non teste, utile plus tard pour selection automatique de station.

## 22. Points non confirmes

- Quotas officiels DPObs pour la cle actuelle: Non confirmé dans les sources disponibles.
- Reponse `format=json` hors GeoJSON: Non confirmé dans les sources disponibles.
- Comportement exact si `date` est omis, au-dela des observations faites sur les deux endpoints station: Non confirmé dans les sources disponibles.
- Liste complete des packs station et leur signification fonctionnelle pour Weather Garden: Non confirmé dans les sources disponibles.
- Disponibilite des champs utiles autour de la localisation reelle Weather Garden: Non confirmé dans les sources disponibles.
