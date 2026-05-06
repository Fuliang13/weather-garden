const AUTO_REFRESH_MS = 5 * 60 * 1000;

const state = {
  status: null,
  radarMap: null,
  radarBaseLayer: null,
  radarRainLayer: null,
  radarMarker: null,
  refreshTimer: null,
  isLoading: false
};

const els = {
  location: document.querySelector("#location"),
  refreshStatus: document.querySelector("#refreshStatus"),
  alertCard: document.querySelector("#alertCard"),
  rainSummary: document.querySelector("#rainSummary"),
  rainEta: document.querySelector("#rainEta"),
  rainDetail: document.querySelector("#rainDetail"),
  rainMeta: document.querySelector("#rainMeta"),
  stationCard: document.querySelector("#stationCard"),
  stationSource: document.querySelector("#stationSource"),
  stationTemperature: document.querySelector("#stationTemperature"),
  stationHumidity: document.querySelector("#stationHumidity"),
  stationWind: document.querySelector("#stationWind"),
  stationGust: document.querySelector("#stationGust"),
  currentSource: document.querySelector("#currentSource"),
  temperature: document.querySelector("#temperature"),
  humidity: document.querySelector("#humidity"),
  wind: document.querySelector("#wind"),
  gust: document.querySelector("#gust"),
  horizons: document.querySelector("#horizons"),
  gardenCard: document.querySelector("#gardenCard"),
  gardenBadge: document.querySelector("#gardenBadge"),
  gardenSummary: document.querySelector("#gardenSummary"),
  gardenDetails: document.querySelector("#gardenDetails"),
  gardenAlertsCard: document.querySelector("#gardenAlertsCard"),
  gardenAlertsTitle: document.querySelector("#gardenAlertsTitle"),
  gardenAlertsSummary: document.querySelector("#gardenAlertsSummary"),
  gardenAlertsList: document.querySelector("#gardenAlertsList"),
  radarStatus: document.querySelector("#radarStatus"),
  radarMap: document.querySelector("#radarMap"),
  radarLegend: document.querySelector("#radarLegend"),
  radarAttribution: document.querySelector("#radarAttribution"),
  sources: document.querySelector("#sources"),
  updatedAt: document.querySelector("#updatedAt"),
  settingsForm: document.querySelector("#settingsForm"),
  settingsMessage: document.querySelector("#settingsMessage")
};

els.settingsForm.addEventListener("submit", saveSettings);

loadStatus(false);
startAutoRefresh();

async function loadStatus(forceRefresh) {
  if (state.isLoading) {
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(forceRefresh ? "/api/refresh" : "/api/status");
    const status = await response.json();

    if (!response.ok || status.ok === false) {
      throw new Error(status.error || "Erreur météo");
    }

    state.status = status;
    renderStatus(status);
  } catch (error) {
    els.rainSummary.textContent = error.message;
    els.alertCard.dataset.level = "high";
    els.refreshStatus.textContent = "Mise à jour impossible.";
  } finally {
    setLoading(false);
  }
}

function startAutoRefresh() {
  window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => loadStatus(false), AUTO_REFRESH_MS);
}

async function saveSettings(event) {
  event.preventDefault();
  const formData = new FormData(els.settingsForm);
  const settings = {
    rainThresholdMm: Number(formData.get("rainThresholdMm")),
    rainAlertMinutes: Number(formData.get("rainAlertMinutes")),
    minConfidence: Number(formData.get("minConfidence")),
    quietMinutes: Number(formData.get("quietMinutes")),
    enableRainAlerts: formData.has("enableRainAlerts"),
    enableNtfy: formData.has("enableNtfy")
  };

  const response = await fetch("/api/settings", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(settings)
  });

  if (!response.ok) {
    els.settingsMessage.textContent = "Erreur lors de l'enregistrement.";
    return;
  }

  els.settingsMessage.textContent = "Réglages enregistrés.";
  await loadStatus(true);
}

function renderStatus(status) {
  const rain = status.rain || {};
  const noSignificantRain = isNoSignificantRain(rain);
  els.location.textContent = `${status.location.name} · ${formatCoord(status.location.latitude)}, ${formatCoord(status.location.longitude)}`;
  els.alertCard.dataset.level = noSignificantRain ? "none" : rain.presentationLevel || rain.alertLevel;
  els.alertCard.dataset.quiet = String(noSignificantRain);
  els.rainSummary.textContent = rain.headline || rain.alertLabel;
  els.rainEta.textContent = noSignificantRain ? "" : buildRainEtaText(rain);
  els.rainEta.hidden = noSignificantRain || !els.rainEta.textContent;
  els.rainDetail.textContent = noSignificantRain ? "" : rain.detail || "";
  els.rainDetail.hidden = noSignificantRain || !els.rainDetail.textContent;
  renderRainMeta(rain);
  renderStationObservation(status.stationObservation || status.observation?.station || null);
  renderCurrentForecast(status.current);
  renderHorizons(rain.horizons || []);
  renderGarden(rain.garden, status.garden);
  renderGardenAlerts(status.garden?.alerts);
  renderRadar(status.radar, status.location);
  renderSources(status.sources);
  renderSettings(status.settings);
  els.updatedAt.textContent = `Dernière mise à jour : ${formatDate(status.updatedAt)}`;
  els.refreshStatus.textContent = `Mise à jour automatique · toutes les ${formatDuration(AUTO_REFRESH_MS / 60_000)}.`;
}

function renderRainMeta(rain) {
  els.rainMeta.innerHTML = "";

  if (isNoSignificantRain(rain)) {
    els.rainMeta.hidden = true;
    return;
  }

  els.rainMeta.hidden = false;

  [
    { label: "Intensité", value: `${rain.intensityLabel} · ${formatValue(rain.intensityMmPerHour, "mm/h")}` },
    { label: "Risque", value: `${rain.riskLabel} · ${rain.horizons?.[0] ? Math.round(rain.horizons[0].score * 100) : 0} % à 30 min` },
    { label: "Durée", value: rain.expectedDurationMinutes ? formatDuration(rain.expectedDurationMinutes) : "non déterminée" }
  ].forEach((item) => {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.innerHTML = `<strong>${item.label}</strong>${item.value}`;
    els.rainMeta.append(pill);
  });
}

function buildRainEtaText(rain) {
  if (isNoSignificantRain(rain)) {
    return "";
  }

  if (rain.activeNow) {
    return rain.expectedDurationMinutes ? `Poursuite possible sur ${formatDuration(rain.expectedDurationMinutes)}.` : "Poursuite possible.";
  }

  if (rain.etaMinutes === null) {
    return "Aucune arrivée de pluie significative détectée dans les données immédiates.";
  }

  return `Arrivée estimée : ${rain.etaMinutes} min.`;
}

function renderStationObservation(station) {
  if (!station?.current) {
    els.stationCard.hidden = true;
    return;
  }

  const current = station.current;
  els.stationCard.hidden = false;
  els.stationSource.textContent = `${station.label || uiText("@{%Station météo%}")}${station.updatedAt ? ` · ${formatDate(station.updatedAt)}` : ""}`;
  els.stationTemperature.textContent = formatValue(current.temperatureC, "°C");
  els.stationHumidity.textContent = formatValue(current.humidityPct, "%");
  els.stationWind.textContent = formatValue(current.windKmh, "km/h");
  els.stationGust.textContent = formatValue(current.gustKmh, "km/h");
}

function renderCurrentForecast(current) {
  els.currentSource.textContent = current?.sourceLabel || "Prévision immédiate · Open-Meteo AROME / MET Norway";
  els.temperature.textContent = formatValue(current?.temperatureC, "°C");
  els.humidity.textContent = formatValue(current?.humidityPct, "%");
  els.wind.textContent = formatValue(current?.windKmh, "km/h");
  els.gust.textContent = formatValue(current?.gustKmh, "km/h");
}

function renderHorizons(horizons) {
  els.horizons.innerHTML = "";

  horizons.forEach((item) => {
    const row = document.createElement("div");
    row.className = "horizon-row";
    row.dataset.level = item.alertLevel;
    row.innerHTML = `
      <strong>${item.minutes} min</strong>
      <span>${item.intensityLabel}</span>
      <span>${formatValue(item.intensityMmPerHour, "mm/h")}</span>
      <span>${formatValue(item.precipitationMm, "mm")}</span>
    `;
    els.horizons.append(row);
  });
}

function renderGarden(garden, gardenState) {
  if (!garden) {
    els.gardenCard.hidden = true;
    return;
  }

  els.gardenCard.hidden = false;
  els.gardenCard.dataset.level = garden.level;
  els.gardenBadge.textContent = buildGardenBadge(gardenState);
  els.gardenSummary.textContent = garden.headline;
  els.gardenDetails.innerHTML = "";

  (garden.details || []).forEach((detail) => {
    const item = document.createElement("li");
    item.textContent = detail;
    els.gardenDetails.append(item);
  });
}

function renderGardenAlerts(alerts) {
  const activeAlerts = alerts?.active || [];

  if (!activeAlerts.length) {
    els.gardenAlertsCard.hidden = true;
    return;
  }

  const highestLevel = getHighestGardenAlertLevel(activeAlerts);
  els.gardenAlertsCard.hidden = false;
  els.gardenAlertsCard.dataset.level = highestLevel;
  els.gardenAlertsTitle.textContent = uiText("@{%Alertes jardin%}");
  els.gardenAlertsSummary.textContent = `${activeAlerts.length} ${activeAlerts.length > 1 ? uiText("@{%alertes actives%}") : uiText("@{%alerte active%}")}`;
  els.gardenAlertsList.innerHTML = "";

  activeAlerts.forEach((alert) => {
    const item = document.createElement("li");
    item.textContent = alert.entityId ? `${alert.headline || alert.type} · ${alert.entityId}` : alert.headline || alert.type;
    els.gardenAlertsList.append(item);
  });
}

function renderRadar(radar, location) {
  const rainViewer = radar?.rainViewer;
  const meteoFrance = radar?.meteoFrance;

  if (meteoFrance?.ok) {
    els.radarStatus.textContent = `Radar Météo-France actif${meteoFrance.fetchedAt ? ` · ${formatDate(meteoFrance.fetchedAt)}` : ""}.`;
  } else if (rainViewer?.ok) {
    els.radarStatus.textContent = `Fallback RainViewer · image ${formatDate(rainViewer.frameTime || rainViewer.generatedAt)}`;
  } else {
    els.radarStatus.textContent = "Aucun radar disponible pour le moment.";
  }

  const tileUrlTemplate = getRainViewerTileUrl(rainViewer);
  renderRadarMap(location, tileUrlTemplate);

  els.radarLegend.hidden = !tileUrlTemplate;
  els.radarAttribution.textContent = tileUrlTemplate ? "RainViewer · OpenStreetMap" : "";
}

function renderRadarMap(location, tileUrlTemplate) {
  if (!els.radarMap) {
    return;
  }

  if (!window.L) {
    els.radarMap.innerHTML = '<div class="radar-empty">Carte indisponible : Leaflet n\'a pas été chargé.</div>';
    return;
  }

  const center = [
    Number(location?.latitude),
    Number(location?.longitude)
  ];

  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
    els.radarMap.innerHTML = '<div class="radar-empty">Position indisponible.</div>';
    return;
  }

  ensureRadarMap(center, location);
  updateRainLayer(tileUrlTemplate);

  window.setTimeout(() => {
    state.radarMap.invalidateSize();
  }, 0);
}

function ensureRadarMap(center, location) {
  if (!state.radarMap) {
    state.radarMap = window.L.map(els.radarMap, {
      zoomControl: true,
      scrollWheelZoom: false
    }).setView(center, 10);

    state.radarBaseLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(state.radarMap);

    state.radarMarker = window.L.marker(center).addTo(state.radarMap);
  } else {
    state.radarMap.setView(center, state.radarMap.getZoom() || 10);
    state.radarMarker.setLatLng(center);
  }

  const markerContent = document.createElement("strong");
  markerContent.textContent = location?.name || "Position météo";
  state.radarMarker.bindPopup(markerContent);
}

function updateRainLayer(tileUrlTemplate) {
  if (state.radarRainLayer) {
    state.radarMap.removeLayer(state.radarRainLayer);
    state.radarRainLayer = null;
  }

  if (!tileUrlTemplate) {
    return;
  }

  state.radarRainLayer = window.L.tileLayer(tileUrlTemplate, {
    opacity: 0.68,
    zIndex: 20,
    maxNativeZoom: 7,
    maxZoom: 19,
    attribution: "RainViewer"
  }).addTo(state.radarMap);
}

function getRainViewerTileUrl(rainViewer) {
  return rainViewer?.tileUrlTemplate || deriveRainViewerTileUrl(rainViewer?.imageUrl);
}

function deriveRainViewerTileUrl(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  const match = imageUrl.match(/^(https:\/\/[^/]+\/v2\/radar\/[^/]+)\/(?:256|512)\/\d+\/[^/]+\/[^/]+\/(.+)$/);

  if (!match) {
    return null;
  }

  return `${match[1]}/512/{z}/{x}/{y}/${match[2]}`;
}

function renderSources(sources) {
  els.sources.innerHTML = "";

  sources.forEach((source) => {
    const item = document.createElement("li");
    const status = getSourceStatus(source);
    const badge = document.createElement("span");
    const body = document.createElement("span");
    const label = document.createElement("strong");
    const meta = document.createElement("span");

    item.className = `source-row source-${status.level}`;
    badge.className = "source-badge";
    badge.textContent = status.label;
    body.className = "source-body";
    label.textContent = source.label;
    meta.textContent = buildSourceMeta(source, status);

    body.append(label, meta);
    item.append(badge, body);
    els.sources.append(item);
  });
}

function getSourceStatus(source) {
  if (source.enabled === false) {
    return { label: "OFF", level: "off" };
  }

  return source.ok ? { label: "OK", level: "ok" } : { label: "KO", level: "ko" };
}

function buildSourceMeta(source, status) {
  const errors = source.errors?.length ? source.errors.join(" · ") : "";

  if (source.message) {
    return source.message;
  }

  if (errors) {
    return errors;
  }

  if (source.updatedAt) {
    return `Dernière donnée : ${formatDate(source.updatedAt)}`;
  }

  if (status.level === "off") {
    return "Source désactivée ou non configurée.";
  }

  return "Aucune donnée récente.";
}

function renderSettings(settings) {
  els.settingsForm.rainThresholdMm.value = settings.rainThresholdMm;
  els.settingsForm.rainAlertMinutes.value = settings.rainAlertMinutes;
  els.settingsForm.minConfidence.value = settings.minConfidence;
  els.settingsForm.quietMinutes.value = settings.quietMinutes;
  els.settingsForm.enableRainAlerts.checked = settings.enableRainAlerts;
  els.settingsForm.enableNtfy.checked = settings.enableNtfy;
}

function isNoSignificantRain(rain) {
  return !!rain?.noSignificantRain || (!rain?.activeNow && rain?.etaMinutes === null && rain?.alertLevel === "none");
}

function buildGardenBadge(gardenState) {
  const count = gardenState?.summary?.entityCount || 0;

  if (!count) {
    return uiText("@{%Jardin%}");
  }

  return `${count} ${count > 1 ? uiText("@{%entités%}") : uiText("@{%entité%}")}`;
}

function getHighestGardenAlertLevel(alerts) {
  const levels = ["urgent", "risk", "watch", "info"];
  return levels.find((level) => alerts.some((alert) => alert.level === level)) || "info";
}

function uiText(value) {
  const match = String(value).match(/^@\{%(.+)%\}$/);
  return match ? match[1] : value;
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  document.body.setAttribute("aria-busy", String(isLoading));

  if (isLoading) {
    els.refreshStatus.textContent = "Mise à jour en cours…";
  }
}

function formatValue(value, unit) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${Math.round(value * 10) / 10} ${unit}`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) {
    return "—";
  }

  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const remainingHours = Math.floor((minutes % 1440) / 60);
    const dayText = `${days} jour${days > 1 ? "s" : ""}`;
    return remainingHours ? `${dayText} ${remainingHours} h` : dayText;
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  }

  return `${minutes} min`;
}

function formatCoord(value) {
  return Number(value).toFixed(6);
}
