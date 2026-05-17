# Meteo-France DPRadar Catalog API

Date de documentation: 2026-05-17.

Sources projet: `src/sources/meteofrance.js`, `src/worker.js`, `src/scoring.js`, `src/radarSynthesis.js`, `README.md`, `test/meteofrance.spec.js`.

Documentation officielle consultee: portail API Meteo-France donnees publiques et page officielle des donnees radar Meteo-France.

## 1. Role de la source dans Weather Garden

`meteofrance-radar` est la source radar native prioritaire de Weather Garden. Elle sert a trouver le produit national de lame d'eau radar, puis a fournir:

- un diagnostic public-safe;
- un etat de source dans `status.sources`;
- une sequence WGR normalisee;
- eventuellement une couche Leaflet native si le produit HDF5 est decode et georeference.

RainViewer reste le fallback visuel quand le radar Meteo-France natif n'est pas exploitable.

## 2. Endpoint officiel utilise

Endpoint racine utilise par le code:

```text
https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques
```

Le code suit ensuite les liens fournis par l'API vers:

```text
https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE
https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations
https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU
```

Les liens exacts sont recuperes depuis les champs `links[].href`; ils ne sont pas reconstruits comme source de verite.

## 3. Methode HTTP

`GET`.

## 4. Mode d'authentification

- API Key JWT via header `apikey`, si `METEOFRANCE_API_KEY` existe.
- OAuth2 Bearer, si `METEOFRANCE_APPLICATION_ID` existe et si aucun `METEOFRANCE_API_KEY` n'est configure.

## 5. Headers requis

JSON:

```http
accept: application/json
apikey: <METEOFRANCE_API_KEY>
```

ou:

```http
accept: application/json
authorization: Bearer <ACCESS_TOKEN>
```

## 6. Query parameters connus

Sur les endpoints catalogue, zone et observation, aucun query parameter n'est ajoute par le Worker.

Sur les liens produit, le code detecte:

- `maille=500`: produit primaire HDF5;
- `maille=1000`: produit fallback BUFR.

Tout autre query parameter dans les liens produit est considere potentiellement sensible et ne doit pas etre conserve dans les reponses publiques.

## 7. Exemple de requete anonymise

```bash
curl "https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques" \
  -H "accept: application/json" \
  -H "apikey: <METEOFRANCE_API_KEY>"
```

## 8. Format reel de reponse observe

Test local Vitest mocke le 2026-05-17:

Catalogue:

```json
{
  "links": [
    {
      "href": "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE"
    }
  ]
}
```

Observation `LAME_D_EAU`:

```json
{
  "validity_time": "2026-05-06T16:35:00Z",
  "links": [
    {
      "href": "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500&token=<REDACTED>"
    },
    {
      "href": "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000"
    }
  ]
}
```

Les tests utilisent des mocks, pas une reponse API live.

## 9. Champs utiles pour Weather Garden

- `links[].href`: navigation HATEOAS vers zone, observations, observation et produit.
- `validity_time` ou `validityTime`: horodatage de validite radar.
- lien produit avec `maille=500`: produit HDF5 prioritaire.
- lien produit avec `maille=1000`: fallback de diagnostic BUFR.

Mapping interne:

- `source`: `meteofrance-radar`;
- `zone`: `METROPOLE`;
- `observation`: `LAME_D_EAU`;
- `mesh`: `500` ou `1000`;
- `format`: `hdf5` ou `gzip-bufr`;
- `frameLimit`: `24`;
- `score`, `precipitationMm`, `probability`: `null` pour l'instant.

## 10. Champs ignores pour l'instant

- Les champs catalogue autres que les URLs collectees recursivement.
- Les produits autres que `maille=500` et `maille=1000`.
- Les observations radar autres que `LAME_D_EAU`.
- Les zones autres que `METROPOLE`.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Le README projet indique que le produit de lame d'eau radar nationale 500 m est produit toutes les 5 minutes.

Le code limite l'objectif d'animation a `24` frames derivees.

Quotas officiels: Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Tests locaux mockes:

- lien `METROPOLE` absent;
- lien `observations` absent;
- lien `LAME_D_EAU` absent;
- reponse non JSON;
- HTTP non OK;
- produit HDF5 absent, avec fallback BUFR 1000 m;
- lien produit contenant un token, qui ne doit pas fuir.

## 13. Cas de fallback

- Si produit `maille=500` absent mais `maille=1000` present: la source reste `ok: true`, `mesh: 1000`, `format: gzip-bufr`, mais le BUFR n'est pas parse.
- Si le radar Meteo-France ne peut pas construire une couche native, RainViewer peut etre utilise comme fallback visuel.
- Si aucun secret Meteo-France n'est configure: source desactivee, non bloquante.

## 14. Risques ou limites techniques

- L'API fournit des liens produit qui peuvent contenir des tokens; ils doivent etre nettoyes.
- Le code collecte les URLs recursivement dans les payloads; un changement de structure peut casser la detection si les liens attendus disparaissent.
- Le fallback BUFR 1000 m n'est pas parse dans Weather Garden.
- Le radar natif ne doit jamais etre affiche si grille, dataset, projection, bounds et valeurs ne sont pas verifies.

## 15. Endpoints Worker Weather Garden lies

- `GET /api/debug/meteofrance`
- `GET /api/debug/meteofrance/hdf5`
- `GET /api/refresh`
- `GET /api/status`
- `GET /api/public-status`
- `GET /api/debug/sources`
- `GET /api/debug/rain`

## 16. Tests effectues

Tests locaux Vitest mockes:

- parcours API Key jusqu'au produit HDF5 500 m;
- parcours OAuth2 jusqu'au produit HDF5 500 m;
- fallback BUFR 1000 m quand le HDF5 500 m est absent;
- sanitisation des tokens dans les URLs;
- diagnostic catalogue sans suivre les endpoints enfants pour `/api/debug/meteofrance`.

## 17. Points non confirmes

- Liste officielle exhaustive des zones disponibles.
- Liste officielle exhaustive des observations disponibles.
- Schema complet des payloads DPRadar reels.
- Quotas et rate limits.
- Garantie officielle que `validity_time` reste le nom de champ stable.

Non confirmé dans les sources disponibles.
