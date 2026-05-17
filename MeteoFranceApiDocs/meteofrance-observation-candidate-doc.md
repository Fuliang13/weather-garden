# Meteo-France Observation And Climatology APIs Candidate

Date de documentation: 2026-05-17.

Sources projet: `src/worker.js`, `src/scoring.js`, `src/sources/ecowitt.js`, `README.md`.

Documentation officielle consultee: pages officielles Meteo-France observations in situ et donnees climatologiques de base.

## 1. Role de la source dans Weather Garden

Les observations in situ et donnees climatologiques Meteo-France sont candidates pour completer:

- l'observation locale Ecowitt;
- les alertes pluie;
- les alertes jardin;
- les historiques pluie/temperature;
- les diagnostics de fiabilite des sources.

Statut: candidate, non integree directement.

## 2. Endpoint officiel utilise

Aucun endpoint Meteo-France observations ou climatologie n'est utilise dans le Worker actuel.

Non confirmé dans les sources disponibles.

## 3. Methode HTTP

Non confirmé dans les sources disponibles.

## 4. Mode d'authentification

Non confirmé dans les sources disponibles.

## 5. Headers requis

Non confirmé dans les sources disponibles.

## 6. Query parameters connus

Non confirmé dans les sources disponibles.

Parametres a verifier avant integration:

- identifiant station;
- periode ou date;
- pas de temps;
- liste de variables;
- zone geographique ou proximite.

## 7. Exemple de requete anonymise

Aucun exemple de requete Meteo-France observations/climatologie n'est present dans le projet.

Non confirmé dans les sources disponibles.

## 8. Format reel de reponse observe

Aucune vraie reponse API Meteo-France observations/climatologie n'a ete observee dans les tests locaux du projet.

Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

Champs candidats a confirmer:

- temperature sous abri;
- humidite;
- precipitations recentes et cumuls;
- vent moyen et rafales;
- pression;
- rayonnement;
- temperature du sol;
- ETP;
- indicateurs d'humidite du sol ou secheresse si disponibles par API;
- metadata station: nom, altitude, latitude, longitude, type, disponibilite.

Ces champs ne sont pas mappes actuellement depuis une API Meteo-France native.

## 10. Champs ignores pour l'instant

Tous les champs Meteo-France observations/climatologie sont ignores actuellement.

Weather Garden utilise pour l'instant:

- Ecowitt pour station locale;
- Open-Meteo/MET Norway pour prevision;
- Meteo-France seulement pour radar.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur Meteo-France observations/climatologie observee dans Weather Garden.

Non confirmé dans les sources disponibles.

## 13. Cas de fallback

Fallbacks actuels:

- si observation locale Ecowitt echoue, `/api/status` reste fonctionnel avec previsions et radar;
- les sources manquantes sont marquees indisponibles dans `status.sources`;
- les alertes ne doivent pas inventer de donnees station ou climatologie.

## 14. Risques ou limites techniques

- Ne pas melanger observations station et previsions.
- Ne pas stocker de payload brut comme source de verite.
- Verifier les unites avant mapping vers `temperatureC`, `windKmh`, `pressureHpa`, `rainRateMmPerHour` ou cumuls mm.
- Verifier la fraicheur station avant utilisation pour les alertes jardin.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint Worker dedie actuellement.

Endpoints indirectement concernes si une future integration est ajoutee:

- `GET /api/refresh`
- `GET /api/status`
- `GET /api/public-status`
- `GET /api/debug/sources`
- `GET /api/debug/rain`
- `GET /api/debug/weather-history`

## 16. Tests effectues

Aucun test local Meteo-France observations/climatologie.

Tests existants pertinents seulement par analogie:

- tests Ecowitt pour normalisation station locale et non-fuite de secrets;
- tests weather history pour stockage public-safe.

## 17. Points non confirmes

- Endpoint officiel exact.
- Methode HTTP.
- Authentification.
- Headers.
- Query parameters.
- Format de reponse.
- Liste de variables disponibles.
- Frequence de mise a jour.
- Quotas.
- Couverture des stations proches de la localisation Weather Garden.

Non confirmé dans les sources disponibles.
