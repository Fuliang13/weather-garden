# Meteo-France Climatology Candidate APIs

Date de documentation: 2026-05-17.

Sources documentaires: portail API Meteo-France donnees publiques, documentation Open Data Meteo-France, fichiers actuels du projet.

Sources couvertes: DPClimatologie, donnees agrometeorologiques decadaires, ETP, Longues Series Homogeneisees, Series Quotidiennes de Reference, fiches climatologiques, fiches/postes/stations Meteo-France.

## 1. Role de la source dans Weather Garden

Candidate pour alimenter l'historique jardin/meteo: cumuls de pluie, gel, canicule, normales locales, ETP et contexte climatique station. Aucune de ces sources n'est consommee actuellement par le Worker.

## 2. Endpoint officiel utilise

Aucun endpoint n'est utilise dans le projet actuel.

Non confirmé dans les sources disponibles.

## 3. Methode HTTP

Non confirmé dans les sources disponibles.

## 4. Mode d'authentification

Non confirmé dans les sources disponibles.

## 5. Headers requis

Non confirmé dans les sources disponibles.

## 6. Query parameters connus

Non confirmé dans les sources disponibles.

Parametres a confirmer avant integration: station, zone, periode, pas de temps, type de produit, variables, format.

## 7. Exemple de requete anonymise

Aucun exemple confirme dans les fichiers actuels du projet.

Non confirmé dans les sources disponibles.

## 8. Format reel de reponse observe

Aucune vraie reponse API climatologie n'a ete observee dans Weather Garden.

Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

Champs candidats:

- pluie 6 min, horaire, quotidienne, decadaire, mensuelle;
- temperature minimale, maximale, moyenne;
- vent moyen et rafales;
- humidite, tension de vapeur;
- rayonnement global et insolation;
- ETP Penman/FAO-56 si disponible;
- metadata station: nom, identifiant, latitude, longitude, altitude, periode disponible.

## 10. Champs ignores pour l'instant

Tous les champs de ces APIs sont ignores actuellement.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur observee localement: source non appelee.

## 13. Cas de fallback

Fallback actuel: Weather Garden reste sur Ecowitt, Open-Meteo, MET Norway, radar Meteo-France et RainViewer. Aucune donnee climatologique ne doit etre inventee si cette source manque.

## 14. Risques ou limites techniques

- Ne pas stocker les payloads bruts comme verite durable.
- Verifier les unites et periodes avant mapping.
- Ne pas melanger climatologie historique et observation temps reel.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint dedie actuellement. Futurs endpoints indirects possibles: `/api/status`, `/api/debug/weather-history`, `/api/debug/sources`.

## 16. Tests effectues

Aucun test local effectue pour ces APIs.

## 17. Points non confirmes

Endpoint exact, methode, auth, headers, query parameters, format de reponse, quotas, frequence, disponibilite par station.

Non confirmé dans les sources disponibles.
