# Meteo-France Extended Radar Products

Date de documentation: 2026-05-17.

Sources couvertes: lame d'eau 1 km BUFR, reflectivite 1 km BUFR, COMEPHORE, radars individuels reflectivite BUFR, PAM multipolarise, PAG, archive radar sur demande FTP.

## 1. Role de la source dans Weather Garden

Sources radar candidates pour enrichir ou diagnostiquer `meteofrance-radar`. Le projet detecte seulement le produit lame d'eau `maille=1000` comme fallback de diagnostic; il ne parse pas le BUFR.

## 2. Endpoint officiel utilise

Pour le fallback detecte:

```text
https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000
```

Autres endpoints: Non confirmé dans les sources disponibles.

## 3. Methode HTTP

`GET` pour le produit `maille=1000` detecte par le code. Autres produits: Non confirmé dans les sources disponibles.

## 4. Mode d'authentification

Meme mode que DPRadar actuel: `apikey` ou OAuth2 Bearer pour le produit `maille=1000` detecte.

Autres produits: Non confirmé dans les sources disponibles.

## 5. Headers requis

Pour le fallback BUFR detecte, le code utiliserait les headers binaires:

```http
accept: application/x-hdf5, application/octet-stream, */*
apikey: <METEOFRANCE_API_KEY>
```

Le `accept` n'est pas specialise BUFR dans le code actuel.

## 6. Query parameters connus

- `maille=1000` pour le fallback lame d'eau BUFR detecte.

Autres query params: Non confirmé dans les sources disponibles.

## 7. Exemple de requete anonymise

```bash
curl "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000" \
  -H "apikey: <METEOFRANCE_API_KEY>" \
  --output radar-lame-1000.gz
```

## 8. Format reel de reponse observe

Test local mocke: seul le lien `maille=1000` est observe dans la metadata.

Fichier local `radar-lame-1000.gz`: 645 690 octets, non parse par le projet.

Pour reflectivite, COMEPHORE, PAM/PAG, archives FTP: Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

- cumul radar 1 km si BUFR parse un jour;
- reflectivite pour intensite instantanee si format confirme;
- COMEPHORE pour validation historique pluie;
- metadata radar pour diagnostic qualite.

## 10. Champs ignores pour l'instant

Tous les produits et champs hors HDF5 500 m sont ignores ou seulement signales comme fallback.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Le README projet indique que le radar temps reel est produit toutes les 5 minutes. Pour les produits etendus, quotas et frequences exacts: Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Fallback BUFR non parse: `Only the 1 km BUFR fallback product is available; BUFR parsing is out of scope.`

Autres erreurs: Non confirmé dans les sources disponibles.

## 13. Cas de fallback

- Si HDF5 500 m absent et BUFR 1000 m present: source `ok`, mais pas de rendu natif.
- RainViewer reste fallback visuel.

## 14. Risques ou limites techniques

- BUFR et produits radar specialises demandent un parser fiable.
- COMEPHORE est historique, pas un radar temps reel.
- Ne jamais afficher de radar natif approximatif.

## 15. Endpoints Worker Weather Garden lies

- `GET /api/debug/meteofrance/hdf5`
- `GET /api/status`
- `GET /api/refresh`
- `GET /api/debug/rain`

## 16. Tests effectues

Test local Vitest mocke: detection du lien `maille=1000` quand `maille=500` est absent.

## 17. Points non confirmes

Schema BUFR, reflectivite, COMEPHORE, PAM/PAG, archive FTP, endpoints, quotas, formats.

Non confirmé dans les sources disponibles.
