# Weather Garden

Mini app météo-jardin personnelle pour Louvigné-du-Désert.

## Sources intégrées

- Open-Meteo Météo-France AROME : prévision immédiate 15 min + horizons 30/60/120 min.
- MET Norway Locationforecast : confirmation indépendante.
- Météo-France radar : catalogue DPRadar via API Key JWT ou OAuth2.
- RainViewer : fallback visuel radar, activé par défaut.
- Ecowitt : station locale via l’API Cloud officielle `/api/v3/device/real_time`, avec normalisation métrique et contrôle de fraîcheur.
- ntfy : notifications gratuites, optionnelles.

## Installation

```bash
npm create cloudflare@latest weather-garden -- --type=hello-world
cd weather-garden
```

Remplace le contenu généré par les fichiers de ce dossier.

Crée les namespaces KV :

```bash
npx wrangler kv namespace create WEATHER_KV
npx wrangler kv namespace create WEATHER_KV --preview
```

Copie les deux IDs dans `wrangler.toml`.

Modifie aussi :

```toml
METNO_USER_AGENT = "weather-garden/0.1 ton.email@example.com"
```

MET Norway demande un User-Agent identifiable avec contact.

## Développement local

```bash
npx wrangler dev --test-scheduled
```

Ouvre ensuite l'URL locale affichée par Wrangler.

Tester le cron local :

```bash
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

## Déploiement

```bash
npx wrangler deploy
```

## ntfy

Choisis un topic difficile à deviner, par exemple :

```bash
npx wrangler secret put NTFY_TOPIC
```

Tu peux aussi utiliser un serveur ntfy personnel :

```bash
npx wrangler secret put NTFY_SERVER
npx wrangler secret put NTFY_TOKEN
```

Dans l'app, active ntfy dans les réglages.

## Unités d’affichage

Les données météo restent normalisées en unités métriques dans le Worker (`temperatureC`, `windKmh`, `pressureHpa`, `rainRateMmPerHour`) afin de garder les alertes et diagnostics cohérents. L’interface peut afficher ces valeurs en métrique ou en non-métrique via le réglage `unitSystem` :

- `metric` : °C, km/h, hPa, mm ;
- `imperial` : °F, mph, inHg, in.

Les seuils d’alertes restent stockés en unités métriques.

## Météo-France radar

Crée un compte sur le portail API Météo-France, puis souscris à l'API Données Radar.

Mode recommandé sur Cloudflare Worker : API Key JWT.

```bash
npx wrangler secret put METEOFRANCE_API_KEY
```

La valeur à saisir est le token API Key JWT généré sur le portail Météo-France. Le Worker l'envoie avec le header `apikey: <METEOFRANCE_API_KEY>` pour appeler directement le catalogue DPRadar. Ce mode évite l'appel à `/token`, qui peut être rejeté par l'infrastructure Météo-France depuis Cloudflare Worker.

Mode OAuth2 optionnel :

```bash
npx wrangler secret put METEOFRANCE_APPLICATION_ID
```

La valeur à saisir est la partie située après `Authorization: Basic` dans le cURL OAuth2 fourni par le portail Météo-France. Le Worker appelle alors `/token` pour obtenir un access token, puis appelle DPRadar avec `Authorization: Bearer <accessToken>`. Ce mode fonctionne en local, mais peut recevoir une page HTML `Request Rejected` depuis Cloudflare Worker.

Produit radar prioritaire :

- zone : `METROPOLE` ;
- observation : `LAME_D_EAU` ;
- maille : `500` ;
- format : HDF5 ;
- produit : lame d'eau radar nationale 500 m, produite toutes les 5 minutes.

Objectif d'animation : conserver jusqu'à 24 frames dérivées, soit environ 2 heures lorsque les données sont espacées de 5 minutes.

Le produit `maille=1000 / BUFR` reste uniquement un fallback de diagnostic si le HDF5 500 m n'est pas présent. Il n'est pas parsé dans l'application.

RainViewer reste le fallback visuel de la carte tant que le HDF5 Météo-France n'est pas décodé avec une grille, une projection et des bounds fiables. Aucun rendu radar natif fictif n'est affiché.

COMEPHORE est une réanalyse historique horaire ; ce n'est pas le produit temps réel utilisé pour l'animation radar.

## Ecowitt

Le module Ecowitt utilise l’API Cloud officielle `/api/v3/device/real_time`.

Secrets obligatoires :

```bash
npx wrangler secret put ECOWITT_APPLICATION_KEY
npx wrangler secret put ECOWITT_API_KEY
```

Il faut aussi configurer au moins un identifiant de dispositif :

```bash
npx wrangler secret put ECOWITT_DEVICE_MAC
```

Fallbacks compatibles :

```bash
npx wrangler secret put ECOWITT_MAC
npx wrangler secret put ECOWITT_DEVICE_IMEI
```

Optionnel :

```bash
ECOWITT_STATION_LABEL="Station locale"
ECOWITT_STALE_MINUTES="20"
```

Le Worker force les unités métriques dans la requête, puis relit quand même l’unité retournée par chaque mesure avant normalisation. Les clés, MAC complet, IMEI complet et URLs avec query string ne doivent jamais apparaître dans les réponses publiques ou debug.
