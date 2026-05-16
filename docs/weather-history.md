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
