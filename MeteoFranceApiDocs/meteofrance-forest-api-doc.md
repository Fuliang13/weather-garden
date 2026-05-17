# Meteo-France Forest Weather Candidate APIs

Date de documentation: 2026-05-17.

Sources couvertes: Meteo des forets temps reel, archives Meteo des forets.

## 1. Role de la source dans Weather Garden

Candidate pour alertes secheresse/feu et contexte jardin en saison a risque. Non integree actuellement.

## 2. Endpoint officiel utilise

Aucun endpoint Meteo des forets n'est utilise par le Worker actuel.

Non confirmé dans les sources disponibles.

## 3. Methode HTTP

Non confirmé dans les sources disponibles.

## 4. Mode d'authentification

Non confirmé dans les sources disponibles.

## 5. Headers requis

Non confirmé dans les sources disponibles.

## 6. Query parameters connus

Non confirmé dans les sources disponibles.

## 7. Exemple de requete anonymise

Non confirmé dans les sources disponibles.

## 8. Format reel de reponse observe

Aucune reponse observee localement.

Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

- niveau de danger feu;
- departement ou zone;
- date de validite;
- horizon J+1/J+2 si confirme;
- source archive annuelle si disponible.

## 10. Champs ignores pour l'instant

Tous les champs Meteo des forets sont ignores actuellement.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur observee: source non appelee.

## 13. Cas de fallback

Fallback actuel: pas de risque feu Meteo-France affiche; alertes jardin restent basees sur sources existantes.

## 14. Risques ou limites techniques

- Niveau departemental potentiellement trop large pour une parcelle.
- Saison et zones couvertes a verifier avant affichage.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint actuel.

## 16. Tests effectues

Aucun test local effectue.

## 17. Points non confirmes

Endpoint, format, auth, saison, zones, quotas, frequence.

Non confirmé dans les sources disponibles.
