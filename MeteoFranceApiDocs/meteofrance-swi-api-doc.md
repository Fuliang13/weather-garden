# Meteo-France SWI / Soil Wetness Index Candidate API

Date de documentation: 2026-05-17.

Source couverte: SWI / indice d'humidite des sols CatNat.

## 1. Role de la source dans Weather Garden

Candidate pour les alertes jardin, secheresse, stress hydrique, arrosage et contexte de sol. Non integree actuellement.

## 2. Endpoint officiel utilise

Aucun endpoint utilise par le Worker actuel.

Non confirmé dans les sources disponibles.

## 3. Methode HTTP

Non confirmé dans les sources disponibles.

## 4. Mode d'authentification

Non confirmé dans les sources disponibles.

## 5. Headers requis

Non confirmé dans les sources disponibles.

## 6. Query parameters connus

Non confirmé dans les sources disponibles.

Parametres a confirmer: zone, maille, date, periode, format.

## 7. Exemple de requete anonymise

Non confirmé dans les sources disponibles.

## 8. Format reel de reponse observe

Aucune reponse SWI observee localement.

Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

- indice d'humidite des sols;
- date de validite;
- maille ou zone;
- indicateur de secheresse ou anomalie si fourni.

## 10. Champs ignores pour l'instant

Tous les champs SWI sont ignores actuellement.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Aucune erreur observee: source non appelee.

## 13. Cas de fallback

Fallback actuel: utiliser pluie previsionnelle, radar, Ecowitt et historique Weather Garden sans inventer d'humidite du sol Meteo-France.

## 14. Risques ou limites techniques

- Resolution spatiale et temporalite a verifier avant alertes par parcelle.
- Ne pas confondre humidite modele grande maille et humidite capteur locale.

## 15. Endpoints Worker Weather Garden lies

Aucun endpoint actuel.

## 16. Tests effectues

Aucun test local effectue.

## 17. Points non confirmes

Endpoint, format, resolution, unites, frequence, quotas, auth.

Non confirmé dans les sources disponibles.
