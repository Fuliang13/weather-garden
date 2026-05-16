# Weather Garden — Socle historique météo

## Objectif

Le socle historique conserve un échantillon météo public-safe après les refresh réussis. Il sert de base simple pour comparer progressivement prévisions, observation locale, radar et synthèse WGF, sans introduire SQL ni stockage lourd.

## Stockage KV

Clé utilisée en Patch 1 :

- `weather_history_recent`

Format stocké :

```json
{
  "version": 1,
  "updatedAt": "2026-05-16T12:00:00.000Z",
  "samples": []
}
```

La liste est bornée à 72 échantillons récents par défaut. Un nouvel échantillon n’est pas ajouté si le dernier date de moins de 10 minutes, pour éviter une écriture KV à chaque refresh rapproché.

## WeatherHistorySample v1

Chaque entrée de `samples` suit cette structure :

```json
{
  "version": 1,
  "type": "weather-history-sample",
  "generatedAt": "2026-05-16T12:00:00.000Z",
  "statusUpdatedAt": "2026-05-16T12:00:00.000Z",
  "source": "weather-garden",
  "confidence": "medium",
  "freshness": {
    "state": "fresh",
    "sources": []
  },
  "observation": {},
  "forecastImmediate": {},
  "rainHorizons": [],
  "radarSummary": {},
  "wgfSummary": {},
  "sources": [],
  "errors": []
}
```

### Champs principaux

- `observation` : observation locale si Ecowitt est disponible et fraîche, sinon valeurs courantes issues du statut.
- `forecastImmediate` : synthèse pluie immédiate déjà calculée par le statut.
- `rainHorizons` : horizons pluie existants, avec métriques simples et sources contributrices.
- `radarSummary` : résumé léger du radar Météo-France et du fallback RainViewer, sans image ni blob.
- `wgfSummary` : synthèse des valeurs WGF déjà calculées dans `forecastComparison`, sans scoring opaque nouveau.
- `sources` : état public-safe des sources.
- `errors` : erreurs nettoyées, sans clé API ni token.

## Données explicitement exclues

- secrets, tokens, headers d’authentification ;
- MAC/IMEI complets ;
- URLs RainViewer ou Météo-France potentiellement signées ;
- HDF5 complet ;
- blobs radar bruts ;
- KML brut ;
- mesures météo courantes dans `GardenState`.

## Comportement dégradé

- KV absent : l’écriture historique est ignorée et le refresh continue.
- Historique corrompu : l’historique récent est recréé avec le nouvel échantillon.
- Échec d’écriture : erreur loggée, pas d’échec global de `/api/refresh`.
- Source météo manquante : champ partiel ou `null`, sans exception.

## Limites Patch 1

- Pas d’historique long quotidien.
- Pas de D1 / SQL.
- Pas de modèle ML.
- Pas de graphique historique.
- Pas de stockage radar métier lourd.

## Patch 2 — Endpoint debug historique

Endpoint ajouté :

- `GET /api/debug/weather-history`

Cet endpoint retourne un diagnostic compact du stockage `weather_history_recent`. Il ne retourne jamais les samples complets, les payloads météo bruts, les URLs radar, les secrets, les tokens, les headers d’authentification, les MAC complets ou les IMEI complets.

Réponse type :

```json
{
  "ok": true,
  "storage": {
    "key": "weather_history_recent",
    "exists": true,
    "corrupted": false
  },
  "history": {
    "version": 1,
    "sampleCount": 2,
    "maxSamples": 72,
    "firstSampleAt": "2026-05-16T12:00:00.000Z",
    "lastSampleAt": "2026-05-16T13:00:00.000Z",
    "lastUpdatedAt": "2026-05-16T13:00:00.000Z",
    "retentionHoursApprox": 1
  },
  "sources": {
    "openMeteo": 2,
    "ecowitt": 2,
    "meteofranceRadar": 2,
    "rainViewer": 2
  },
  "confidence": {
    "low": 0,
    "medium": 2,
    "high": 0,
    "unknown": 0
  },
  "freshness": {
    "fresh": 2,
    "stale": 0,
    "unavailable": 0,
    "unknown": 0
  },
  "diagnostics": {
    "kvReadable": true,
    "lastSampleTooRecentSkips": 0
  }
}
```

### États gérés

- Clé absente : `ok: true`, `storage.exists: false`, `sampleCount: 0`.
- Historique vide : `ok: true`, `storage.exists: true`, `sampleCount: 0`, timestamps de samples à `null`.
- JSON corrompu : `ok: false`, `storage.corrupted: true`, message explicite, aucun contenu brut renvoyé.
- KV indisponible : `ok: false`, `diagnostics.kvReadable: false`, sans exception Worker.

### Limites Patch 2

- Pas d’API utilisateur publique d’historique.
- Pas d’affichage frontend.
- Pas d’export des samples.
- Pas de compteur persistant des skips récents : `lastSampleTooRecentSkips` reste à `0` tant qu’aucun stockage de métrique dédiée n’est ajouté.

## Correctif Patch 2A — sanitation URL

Le diagnostic historique et les samples continuent de ne pas retourner de payload brut. Les messages d’erreur nettoyés masquent désormais les URLs complètes sous la forme `<redacted-url>`, afin d’éviter de conserver ou d’exposer une URL signée, un token encodé dans le chemin, un hôte de requête sensible ou les noms de paramètres d’authentification.

Les nouveaux fichiers du socle historique sont normalisés en LF, avec une règle Git dédiée pour éviter le retour de CRLF dans les prochains patchs.
