# Meteo-France Token And API Key Auth

Date de documentation: 2026-05-17.

Sources projet: `src/sources/meteofrance.js`, `README.md`, `test/meteofrance.spec.js`.

Documentation officielle consultee: portail API Meteo-France donnees publiques et espace Open Data Meteo-France.

## 1. Role de la source dans Weather Garden

Cette couche choisit le mode d'authentification pour les appels Meteo-France utilises par `meteofrance-radar`.

Le code selectionne:

- `api-key` si `METEOFRANCE_API_KEY` existe;
- `oauth2` si `METEOFRANCE_APPLICATION_ID` existe et qu'aucune API key directe n'est configuree;
- aucune source active si aucun des deux secrets n'existe.

## 2. Endpoint officiel utilise

- Token OAuth2: `https://portail-api.meteofrance.fr/token`.
- API Key directe: pas d'endpoint auth separe; le header `apikey` est envoye sur les endpoints DPRadar.

## 3. Methode HTTP

- Token OAuth2: `POST`.
- API Key directe: meme methode que l'endpoint Meteo-France appele; dans le code actuel, `GET` pour DPRadar.

## 4. Mode d'authentification

- Mode recommande par le README pour Cloudflare Worker: API Key JWT via header `apikey`.
- Mode optionnel: OAuth2 client credentials via `Authorization: Basic <METEOFRANCE_APPLICATION_ID>`, puis `Authorization: Bearer <ACCESS_TOKEN>`.

## 5. Headers requis

Mode API Key:

```http
accept: application/json
apikey: <METEOFRANCE_API_KEY>
```

Mode OAuth2 token:

```http
accept: application/json
authorization: Basic <METEOFRANCE_APPLICATION_ID>
cache-control: no-cache
content-type: application/x-www-form-urlencoded
user-agent: weather-garden/0.1
```

Mode OAuth2 appel API:

```http
accept: application/json
authorization: Bearer <ACCESS_TOKEN>
```

Pour le binaire HDF5:

```http
accept: application/x-hdf5, application/octet-stream, */*
apikey: <METEOFRANCE_API_KEY>
```

ou:

```http
accept: application/x-hdf5, application/octet-stream, */*
authorization: Bearer <ACCESS_TOKEN>
```

## 6. Query parameters connus

Pour `/token`: aucun query parameter confirme; le body est `grant_type=client_credentials`.

Pour l'API Key directe: aucun query parameter d'auth confirme dans le code. Les query params appartiennent aux endpoints metier, par exemple `maille=500` pour le produit radar.

## 7. Exemple de requete anonymise

OAuth2:

```bash
curl -X POST "https://portail-api.meteofrance.fr/token" \
  -H "accept: application/json" \
  -H "authorization: Basic <METEOFRANCE_APPLICATION_ID>" \
  -H "cache-control: no-cache" \
  -H "content-type: application/x-www-form-urlencoded" \
  -H "user-agent: weather-garden/0.1" \
  --data "grant_type=client_credentials"
```

API Key directe sur le catalogue radar:

```bash
curl "https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques" \
  -H "accept: application/json" \
  -H "apikey: <METEOFRANCE_API_KEY>"
```

## 8. Format reel de reponse observe

Test local Vitest mocke le 2026-05-17:

```json
{
  "access_token": "<ACCESS_TOKEN>"
}
```

Le code exige la presence de `access_token`. Les champs `expires_in`, `token_type` ou scopes ne sont pas confirmes dans les sources disponibles.

Non confirmé dans les sources disponibles.

## 9. Champs utiles pour Weather Garden

- `access_token`: utilise comme Bearer token pour les appels DPRadar OAuth2.
- `authMode`: expose dans les diagnostics sous forme `api-key`, `oauth2` ou `null`.
- `tokenOk`: expose dans les diagnostics debug pour distinguer echec token et echec catalogue.

## 10. Champs ignores pour l'instant

- Tout champ token autre que `access_token`.
- Expiration du token: le code ne lit pas de TTL; il redemande un token si un appel retourne `401` avec `Invalid JWT token`.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Non confirmé dans les sources disponibles.

Le code ne documente pas de quota officiel. Il met seulement en cache les diagnostics HDF5 jusqu'a 6 heures dans KV quand `WEATHER_KV` est disponible.

## 12. Erreurs observees

Tests locaux mockes:

- reponse HTML `Request Rejected` au lieu de JSON sur `/token`;
- reponse non JSON sur un endpoint radar;
- `401` contenant `Invalid JWT token`, suivi d'un renouvellement de token;
- absence de secret: source desactivee sans bloquer `/api/status`.

Les messages sont nettoyes par `sanitizeMeteoFranceMessage`.

## 13. Cas de fallback

- Si `METEOFRANCE_API_KEY` existe, le Worker utilise l'API Key et ne demande pas de token.
- Si aucun secret n'existe, `meteofrance-radar` est desactive et `RainViewer` peut rester disponible comme fallback visuel radar.
- Si OAuth2 retourne `401 Invalid JWT token`, le Worker redemande un token une fois.

## 14. Risques ou limites techniques

- OAuth2 peut echouer depuis Cloudflare Worker avec une page HTML `Request Rejected`, d'apres le README et les tests.
- Les credentials ne doivent jamais apparaitre dans les payloads publics ou debug.
- Le header `user-agent` est normalise en ASCII par le Worker.

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

- `test/meteofrance.spec.js`: API Key directe sans appel `/token`;
- `test/meteofrance.spec.js`: OAuth2 `/token` puis Bearer;
- `test/meteofrance.spec.js`: renouvellement token apres `Invalid JWT token`;
- `test/meteofrance.spec.js`: sanitisation des secrets.

Date de reference des fixtures/mocks: tests executes avec horloge simulee `2026-05-06T18:00:00.000Z`.

## 17. Points non confirmes

- Format complet reel de la reponse `/token` hors `access_token`.
- Duree de vie officielle du token.
- Quotas exacts et limites de frequence.
- Liste officielle exhaustive des headers requis par produit.

Non confirmé dans les sources disponibles.
