# Meteo-France Source Inventory

Date de documentation: 2026-05-17.

Ce fichier liste toutes les sources identifiees pour Weather Garden lors de la consultation du portail API Meteo-France et de la documentation Open Data Meteo-France. Il sert de table de couverture vers les fiches du dossier `MeteoFranceApiDocs`.

## Sources haute priorite

| Source identifiee | Fiche documentaire | Statut Weather Garden |
| --- | --- | --- |
| Observations reseau sol temps reel | `meteofrance-observation-candidate-doc.md` | Candidate documentee, testee manuellement, non integree. |
| API Donnees Climatologiques / DPClimatologie | `meteofrance-climatology-api-doc.md` | Candidate, non testee localement. |
| Donnees agrometeorologiques decadaires | `meteofrance-climatology-api-doc.md` | Candidate, non testee localement. |
| ETP Meteo-France | `meteofrance-climatology-api-doc.md` | Candidate, non testee localement. |
| SWI / indice d'humidite des sols CatNat | `meteofrance-swi-api-doc.md` | Candidate, non testee localement. |
| AROME Meteo-France natif | `meteofrance-arome-native-api-doc.md` | Candidate; Open-Meteo AROME existe mais pas l'API Meteo-France directe. |
| AROME-PI / prevision immediate | `meteofrance-nowcasting-api-doc.md` | Candidate, non testee localement. |
| PIAF / prevision immediate agregee fusionnee | `meteofrance-nowcasting-api-doc.md` | Candidate, non testee localement. |
| Radar mosaique lame d'eau 500 m HDF5 | `meteofrance-radar-hdf5-product-doc.md` | Testee par fixtures; source presente. |
| Radar mosaique lame d'eau 1 km BUFR | `meteofrance-radar-extended-products-doc.md` | Detectee comme fallback; non parse. |
| Radar mosaique reflectivite 1 km BUFR | `meteofrance-radar-extended-products-doc.md` | Candidate, non testee localement. |
| COMEPHORE | `meteofrance-radar-extended-products-doc.md` | Candidate, non testee localement. |

## Sources priorite moyenne

| Source identifiee | Fiche documentaire | Statut Weather Garden |
| --- | --- | --- |
| ARPEGE deterministe | `meteofrance-arpege-ensemble-api-doc.md` | Candidate, non testee localement. |
| ARPEGE ensemble | `meteofrance-arpege-ensemble-api-doc.md` | Candidate, non testee localement. |
| Champs statistiques ARPEGE ensemble | `meteofrance-arpege-ensemble-api-doc.md` | Candidate, non testee localement. |
| AROME ensemble metropole | `meteofrance-arpege-ensemble-api-doc.md` | Candidate, non testee localement. |
| AROME Outre-mer | `meteofrance-arome-native-api-doc.md` | Candidate, non testee localement. |
| AROME ensemble Outre-mer | `meteofrance-arpege-ensemble-api-doc.md` | Candidate, non testee localement. |
| AROME IFS 0.025 degre | `meteofrance-arome-native-api-doc.md` | Candidate, non testee localement. |
| Meteo des forets temps reel | `meteofrance-forest-api-doc.md` | Candidate, non testee localement. |
| Archives Meteo des forets | `meteofrance-forest-api-doc.md` | Candidate, non testee localement. |
| Vigilance Metropole temps reel | `meteofrance-vigilance-api-doc.md` | Candidate, non testee localement. |
| Archives Vigilance Metropole | `meteofrance-vigilance-api-doc.md` | Candidate, non testee localement. |
| Vigilance Outre-mer V6 | `meteofrance-vigilance-api-doc.md` | Candidate, non testee localement. |
| Bulletins avalanche temps reel et archives | `meteofrance-avalanche-nivology-api-doc.md` | Candidate specialisee, non testee localement. |
| Observations SYNOP essentielles OMM | `meteofrance-observation-candidate-doc.md` | Candidate documentee depuis la doc officielle, non testee localement. |
| Observations nivo-meteorologiques | `meteofrance-avalanche-nivology-api-doc.md` | Candidate specialisee, non testee localement. |
| Modele de simulation nivologique | `meteofrance-avalanche-nivology-api-doc.md` | Candidate specialisee, non testee localement. |
| Bouees ancrees | `meteofrance-marine-coastal-api-doc.md` | Candidate specialisee, non testee localement. |
| Modeles de vagues | `meteofrance-marine-coastal-api-doc.md` | Candidate specialisee, non testee localement. |
| Modeles de surcote oceanique | `meteofrance-marine-coastal-api-doc.md` | Candidate specialisee, non testee localement. |

## Sources basse priorite ou specialisees

| Source identifiee | Fiche documentaire | Statut Weather Garden |
| --- | --- | --- |
| Radars individuels reflectivite BUFR | `meteofrance-radar-extended-products-doc.md` | Candidate specialisee, non testee localement. |
| Radar PAM multipolarise | `meteofrance-radar-extended-products-doc.md` | Candidate specialisee, non testee localement. |
| Radar PAG | `meteofrance-radar-extended-products-doc.md` | Candidate specialisee, non testee localement. |
| Archive radar sur demande FTP | `meteofrance-radar-extended-products-doc.md` | Candidate specialisee, non testee localement. |
| Radiosondages | `meteofrance-upperair-cyclone-api-doc.md` | Candidate specialisee, non testee localement. |
| Longues Series Homogeneisees | `meteofrance-climatology-api-doc.md` | Candidate, non testee localement. |
| Series Quotidiennes de Reference | `meteofrance-climatology-api-doc.md` | Candidate, non testee localement. |
| Fiches climatologiques | `meteofrance-climatology-api-doc.md` | Candidate, non testee localement. |
| Fiches/postes/stations Meteo-France | `meteofrance-climatology-api-doc.md` | Candidate, non testee localement. |
| Bulletins Meteorologiques Speciaux maritimes archives | `meteofrance-marine-coastal-api-doc.md` | Candidate specialisee, non testee localement. |
| Archives cycloniques Sud-Ouest ocean Indien | `meteofrance-upperair-cyclone-api-doc.md` | Candidate specialisee, non testee localement. |
| Vigilance Outre-mer V5 | `meteofrance-vigilance-api-doc.md` | Compatibilite historique candidate, non testee localement. |

## Points non confirmes

Pour toutes les sources candidates non consommees par le Worker:

- Endpoint officiel exact: Non confirmé dans les sources disponibles.
- Methode HTTP: Non confirmé dans les sources disponibles.
- Headers requis: Non confirmé dans les sources disponibles.
- Query parameters: Non confirmé dans les sources disponibles.
- Format reel de reponse observe par Weather Garden: Non confirmé dans les sources disponibles.
- Quotas et frequence officielle: Non confirmé dans les sources disponibles.
