import { fetchOpenMeteoArome } from "./sources/openMeteo.js";
import { fetchMetNorway } from "./sources/metNorway.js";
import { fetchMeteoFranceRadar, fetchRainViewerRadar } from "./sources/meteofrance.js";
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, buildWeatherStatus, mergeSettings } from "./scoring.js";

const KV_KEYS = {
  settings: "settings",
  latestStatus: "latest_status",
  lastRainAlert: "last_alert_rain"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/status") {
        return json(await getLatestStatus(env));
      }

      if (url.pathname === "/api/refresh") {
        const status = await computeAndStoreStatus(env);
        return json(status);
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        return json(await loadSettings(env));
      }

      if (url.pathname === "/api/settings" && request.method === "POST") {
        const body = await request.json();
        const settings = mergeSettings(body);
        await env.WEATHER_KV.put(KV_KEYS.settings, JSON.stringify(settings));
        ctx.waitUntil(computeAndStoreStatus(env));
        return json(settings);
      }

      if (url.pathname === "/api/alerts/test" && request.method === "POST") {
        const settings = await loadSettings(env);
        await sendNtfy({
          env,
          settings,
          title: "Test météo-jardin",
          message: "Notification ntfy OK pour Weather Garden."
        });
        return json({ ok: true });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ ok: false, error: error.message }, 500);
    }
  },

	async scheduled(event, env, ctx) {
		try {
			await runScheduledCheck(env);
		} catch (error) {
			console.error("Scheduled check failed:", error);
			throw error;
		}
	}
};

async function runScheduledCheck(env) {
  const status = await computeAndStoreStatus(env);
  await maybeSendRainAlert(env, status);
}

async function getLatestStatus(env) {
  const cached = await env.WEATHER_KV.get(KV_KEYS.latestStatus, "json");

  if (cached && !isStale(cached.updatedAt, 10)) {
    return cached;
  }

  return computeAndStoreStatus(env);
}

async function computeAndStoreStatus(env) {
  const settings = await loadSettings(env);
  const location = loadLocation(env);
  const errors = [];

  const [openMeteo, metNorway, meteoFranceRadar, rainViewer] = await Promise.all([
    settleSource("open-meteo-arome", () => fetchOpenMeteoArome(location), errors),
    settleSource("met-norway", () => fetchMetNorway({
      ...location,
      userAgent: env.METNO_USER_AGENT
    }), errors),
    settleSource("meteofrance-radar", () => fetchMeteoFranceRadar({ env }), errors),
    settleSource("rainviewer", () => fetchRainViewerRadar({
      ...location,
      enabled: settings.rainViewerEnabled
    }), errors)
  ]);

  const status = buildWeatherStatus({
    location,
    settings,
    openMeteo,
    metNorway,
    meteoFranceRadar,
    rainViewer,
    errors
  });

  await env.WEATHER_KV.put(KV_KEYS.latestStatus, JSON.stringify(status));
  return status;
}

async function settleSource(source, fn, errors) {
  try {
    return await fn();
  } catch (error) {
    errors.push({ source, message: error.message });
    return null;
  }
}

async function loadSettings(env) {
  const stored = await env.WEATHER_KV.get(KV_KEYS.settings, "json");
  const envDefaults = {
    ...DEFAULT_SETTINGS,
    ntfyTopic: env.NTFY_TOPIC || "",
    ntfyServer: env.NTFY_SERVER || DEFAULT_SETTINGS.ntfyServer,
    enableNtfy: !!env.NTFY_TOPIC
  };

  return mergeSettings({
    ...envDefaults,
    ...(stored || {})
  });
}

function loadLocation(env) {
  return {
    name: env.APP_LOCATION_NAME || DEFAULT_LOCATION.name,
    latitude: Number(env.APP_LATITUDE || DEFAULT_LOCATION.latitude),
    longitude: Number(env.APP_LONGITUDE || DEFAULT_LOCATION.longitude),
    timezone: env.APP_TIMEZONE || DEFAULT_LOCATION.timezone
  };
}

async function maybeSendRainAlert(env, status) {
  if (!status.rain.shouldAlert || !status.settings.enableNtfy) {
    return;
  }

  const horizon = status.rain.horizons.find((item) => item.minutes === status.settings.rainAlertMinutes) || status.rain.horizons[0];
  const lastAlert = await env.WEATHER_KV.get(KV_KEYS.lastRainAlert, "json");

  if (lastAlert && !isStale(lastAlert.sentAt, status.settings.quietMinutes)) {
    return;
  }

  const eta = status.rain.etaMinutes === null ? "bientôt" : `dans ${status.rain.etaMinutes} min`;
  const message = `Pluie probable ${eta} à ${status.location.name}. Score ${Math.round(horizon.score * 100)} %, cumul estimé ${horizon.precipitationMm ?? "?"} mm sur ${horizon.minutes} min.`;

  await sendNtfy({
    env,
    settings: status.settings,
    title: "Alerte pluie",
    message
  });

  await env.WEATHER_KV.put(KV_KEYS.lastRainAlert, JSON.stringify({
    sentAt: new Date().toISOString(),
    horizon
  }));
}

async function sendNtfy({ env, settings, title, message }) {
  const topic = settings.ntfyTopic || env.NTFY_TOPIC;

  if (!topic) {
    throw new Error("NTFY_TOPIC is not configured.");
  }

  const server = (settings.ntfyServer || env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const headers = {
    "title": title,
    "priority": "default"
  };

  if (env.NTFY_TOKEN) {
    headers.authorization = `Bearer ${env.NTFY_TOKEN}`;
  }

  const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers,
    body: message
  });

  if (!response.ok) {
    throw new Error(`ntfy HTTP ${response.status}`);
  }
}

function isStale(isoDate, minutes) {
  if (!isoDate) {
    return true;
  }

  return Date.now() - Date.parse(isoDate) > minutes * 60_000;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
