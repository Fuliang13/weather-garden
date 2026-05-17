# Meteo-France ARPEGE And Ensemble Candidate APIs

Date de documentation: 2026-05-17.

Sources couvertes: ARPEGE deterministe, ARPEGE ensemble, champs statistiques ARPEGE ensemble, AROME ensemble metropole, AROME ensemble Outre-mer.

## 1. Role de la source dans Weather Garden

Candidate pour horizon plus long, probabilites, incertitude et confiance des alertes. Non integree actuellement.

## 2. Endpoint officiel utilise

Aucun endpoint ARPEGE/ensemble n'est utilise par le Worker actuel.

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

- precipitation moyenne et probabilites de depassement;
- temperature min/max;
- vent/rafales;
- ecart-type ou quantiles;
- echeance et run modele.

## 10. Champs ignores pour l'instant

Tous les champs ARPEGE/ensemble sont ignores actuellement.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur observee: source non appelee.

## 13. Cas de fallback

Fallback actuel: Open-Meteo AROME + MET Norway; confiance reduite quand les sources divergent.

## 14. Risques ou limites techniques

- Ne pas confondre statistique d'ensemble et observation.
- Verifier l'unite des probabilites et seuils.
- Eviter un cout Worker trop eleve si donnees grille lourdes.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint actuel.

## 16. Tests effectues

Aucun test local effectue.

## 17. Points non confirmes

Endpoint, methode, auth, variables, formats, quotas, frequence.

Non confirmé dans les sources disponibles.
