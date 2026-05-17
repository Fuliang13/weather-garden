# Meteo-France AROME Native Candidate APIs

Date de documentation: 2026-05-17.

Sources couvertes: AROME Meteo-France natif, AROME Outre-mer, AROME IFS 0.025 degre.

## 1. Role de la source dans Weather Garden

Candidate pour remplacer ou confirmer Open-Meteo AROME avec une source Meteo-France directe. Le projet actuel utilise `src/sources/openMeteo.js`, pas un endpoint Meteo-France natif.

## 2. Endpoint officiel utilise

Aucun endpoint Meteo-France AROME natif n'est utilise par le Worker actuel.

Non confirmé dans les sources disponibles.

## 3. Methode HTTP

Non confirmé dans les sources disponibles.

## 4. Mode d'authentification

Non confirmé dans les sources disponibles.

## 5. Headers requis

Non confirmé dans les sources disponibles.

## 6. Query parameters connus

Non confirmé dans les sources disponibles.

Parametres a confirmer: modele, domaine, variable, echeance, latitude/longitude ou bbox, format, niveau.

## 7. Exemple de requete anonymise

Non confirmé dans les sources disponibles.

## 8. Format reel de reponse observe

Aucune reponse Meteo-France AROME native observee localement.

Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

- precipitation;
- temperature;
- humidite;
- vent et rafales;
- rayonnement;
- echeance;
- run modele;
- resolution et domaine.

## 10. Champs ignores pour l'instant

Tous les champs AROME natifs Meteo-France sont ignores. Les champs Open-Meteo AROME restent geres par `open-meteo-arome`.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur observee: source non appelee.

## 13. Cas de fallback

Fallback actuel: Open-Meteo AROME et MET Norway restent les sources previsionnelles.

## 14. Risques ou limites techniques

- Eviter de dupliquer Open-Meteo sans gain clair.
- Verifier format grille/point avant mapping local.
- Ne pas inventer de probabilites si le champ n'existe pas.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint actuel. Futurs endpoints indirects: `/api/refresh`, `/api/status`, `/api/debug/sources`, `/api/debug/rain`.

## 16. Tests effectues

Aucun test local effectue pour AROME Meteo-France natif.

## 17. Points non confirmes

Endpoint, methode, auth, headers, params, format, variables, quotas.

Non confirmé dans les sources disponibles.
