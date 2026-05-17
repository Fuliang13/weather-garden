# Meteo-France Vigilance Candidate APIs

Date de documentation: 2026-05-17.

Sources couvertes: Vigilance Metropole temps reel, archives Vigilance Metropole, Vigilance Outre-mer V6, Vigilance Outre-mer V5.

## 1. Role de la source dans Weather Garden

Candidate pour alertes de phenomenes dangereux: fortes pluies, orages, vent, canicule, neige/verglas et risques similaires selon disponibilite. Non integree actuellement.

## 2. Endpoint officiel utilise

Aucun endpoint vigilance n'est utilise par le Worker actuel.

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

Aucune reponse observee localement. Les formats JSON/PDF/PNG mentionnes precedemment n'ont pas ete testes dans Weather Garden.

Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

- couleur/niveau de vigilance;
- phenomene;
- zone/departement;
- debut/fin de validite;
- bulletin texte si disponible.

## 10. Champs ignores pour l'instant

Tous les champs vigilance sont ignores actuellement.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur observee: source non appelee.

## 13. Cas de fallback

Si ajoutee plus tard, une indisponibilite vigilance ne doit pas bloquer `/api/status`; les alertes pluie/jardin existantes doivent continuer sans inventer de vigilance.

## 14. Risques ou limites techniques

- Ne pas confondre vigilance departementale et observation locale.
- Bien separer vigilance temps reel et archives.
- V5 Outre-mer doit etre traitee comme compatibilite historique si V6 est disponible.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint actuel.

## 16. Tests effectues

Aucun test local effectue.

## 17. Points non confirmes

Endpoint, methode, auth, schema, zones, quotas, frequence.

Non confirmé dans les sources disponibles.
