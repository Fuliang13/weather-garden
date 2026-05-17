# Meteo-France Nowcasting Candidate APIs

Date de documentation: 2026-05-17.

Sources couvertes: AROME-PI / prevision immediate, PIAF / AROME prevision immediate agregee fusionnee.

## 1. Role de la source dans Weather Garden

Candidate pour les alertes pluie imminente et la synthese radar/prevision court terme. Non integree actuellement.

## 2. Endpoint officiel utilise

Aucun endpoint nowcasting Meteo-France n'est utilise par le Worker actuel.

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

- precipitation a tres court terme;
- echeances 15, 30, 60, 120 minutes si disponibles;
- probabilite ou confiance si disponible;
- run ou heure de validite.

## 10. Champs ignores pour l'instant

Tous les champs AROME-PI/PIAF sont ignores actuellement.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur observee: source non appelee.

## 13. Cas de fallback

Fallback actuel: scoring WGF combine Open-Meteo AROME, MET Norway, radar et Ecowitt selon disponibilite.

## 14. Risques ou limites techniques

- Ne pas surponderer une prevision immediate sans diagnostic de fraicheur.
- Verifier que les echeances correspondent aux horizons d'alerte Weather Garden.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint actuel.

## 16. Tests effectues

Aucun test local effectue.

## 17. Points non confirmes

Endpoint, schema, variables, frequence, quotas, auth.

Non confirmé dans les sources disponibles.
