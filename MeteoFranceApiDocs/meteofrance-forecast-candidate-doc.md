# Meteo-France Forecast APIs Candidate

Date de documentation: 2026-05-17.

Sources projet: `src/sources/openMeteo.js`, `src/worker.js`, `README.md`.

Documentation officielle consultee: page officielle Meteo-France des modeles et donnees de prevision.

## 1. Role de la source dans Weather Garden

Les previsions Meteo-France natives sont candidates pour completer ou remplacer partiellement la source actuelle `open-meteo-arome`.

Aujourd'hui, Weather Garden utilise `fetchOpenMeteoArome` depuis `src/sources/openMeteo.js`. Cette source exploite Open-Meteo et non une API Meteo-France directe.

Statut: candidate, non integree directement.

## 2. Endpoint officiel utilise

Aucun endpoint Meteo-France de prevision natif n'est utilise par le Worker actuel.

La documentation officielle mentionne des donnees de prevision et modeles, notamment AROME/ARPEGE, mais l'endpoint exact a appeler depuis Weather Garden n'est pas confirme localement.

Non confirmé dans les sources disponibles.

## 3. Methode HTTP

Non confirmé dans les sources disponibles.

## 4. Mode d'authentification

Non confirmé dans les sources disponibles.

Hypothese a verifier avant integration: authentification via le portail API Meteo-France, probablement similaire aux autres APIs donnees publiques. Cette hypothese n'est pas confirmee par un test local du projet.

## 5. Headers requis

Non confirmé dans les sources disponibles.

## 6. Query parameters connus

Non confirmé dans les sources disponibles.

Les parametres utiles attendus pour Weather Garden seraient latitude, longitude, echeance, pas de temps, variables meteo et modele, mais aucun mapping officiel n'est confirme dans le code actuel.

## 7. Exemple de requete anonymise

Aucun exemple de requete Meteo-France native n'est present dans le projet.

Non confirmé dans les sources disponibles.

## 8. Format reel de reponse observe

Aucune vraie reponse API Meteo-France prevision n'a ete observee dans les tests locaux du projet.

Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

Champs utiles a confirmer avant integration:

- precipitation horaire ou infra-horaire;
- probabilite de precipitation si disponible;
- temperature;
- vent moyen et rafales;
- humidite;
- pression;
- rayonnement;
- echeance et date de run;
- modele et resolution.

Non confirmé dans les sources disponibles.

## 10. Champs ignores pour l'instant

Tout champ Meteo-France natif de prevision est ignore pour l'instant, car aucun adaptateur Worker direct n'existe.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur Meteo-France prevision native observee dans Weather Garden.

Non confirmé dans les sources disponibles.

## 13. Cas de fallback

Fallback actuel pour les previsions:

- `Open-Meteo AROME` reste la source principale de prevision court terme;
- `MET Norway` reste la confirmation independante.

Une future integration Meteo-France native ne doit pas casser `/api/status` si elle echoue.

## 14. Risques ou limites techniques

- Risque de doublon fonctionnel avec Open-Meteo AROME.
- Necessite de verifier le format, l'echelle spatiale, l'echeance et les quotas avant tout patch applicatif.
- Ne pas inventer de mapping pluie, probabilite ou confiance sans champ confirme.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint Worker dedie actuellement.

Endpoints indirectement concernes si une future integration est ajoutee:

- `GET /api/refresh`
- `GET /api/status`
- `GET /api/public-status`
- `GET /api/debug/sources`
- `GET /api/debug/rain`

## 16. Tests effectues

Aucun test local Meteo-France prevision native.

Tests existants concernent seulement la source Open-Meteo AROME et la comparaison avec MET Norway.

## 17. Points non confirmes

- Endpoint officiel exact.
- Methode HTTP.
- Authentification.
- Headers.
- Query parameters.
- Format de reponse.
- Variables disponibles.
- Quotas.
- Frequence de mise a jour.

Non confirmé dans les sources disponibles.
