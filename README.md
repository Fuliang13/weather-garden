# Weather Garden

Mini app météo-jardin personnelle pour Louvigné-du-Désert.

## Sources intégrées

- Open-Meteo Météo-France AROME : prévision immédiate 15 min + horizons 30/60/120 min.
- MET Norway Locationforecast : confirmation indépendante.
- Météo-France radar : module prêt à brancher via `METEOFRANCE_RADAR_API_URL` + `METEOFRANCE_API_TOKEN`.
- RainViewer : fallback visuel radar, activé par défaut.
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

## Météo-France radar

Crée un compte sur le portail API Météo-France, récupère ton accès à l'API radar, puis configure :

```bash
npx wrangler secret put METEOFRANCE_API_TOKEN
npx wrangler secret put METEOFRANCE_RADAR_API_URL
```

Le module accepte actuellement un endpoint JSON déjà exploitable. Si l'API renvoie un format brut radar, il faudra ajouter un petit parseur ou un endpoint de prétraitement.
