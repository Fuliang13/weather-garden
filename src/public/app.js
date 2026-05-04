const state = {
  status: null,
  radarMap: null,
  radarBaseLayer: null,
  radarRainLayer: null,
  radarMarker: null
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  location: document.querySelector("#location"),
  alertCard: document.querySelector("#alertCard"),
  rainSummary: document.querySelector("#rainSummary"),
  rainEta: document.querySelector("#rainEta"),
  rainDetail: document.querySelector("#rainDetail"),
  rainMeta: document.querySelector("#rainMeta"),
  temperature: document.querySelector("#temperature"),
  humidity: document.querySelector("#humidity"),
  wind: document.querySelector("#wind"),
  gust: document.querySelector("#gust"),
  horizons: document.querySelector("#horizons"),
  gardenCard: document.querySelector("#gardenCard"),
  gardenSummary: document.querySelector("#gardenSummary"),
  gardenDetails: document.querySelector("#gardenDetails"),
  radarStatus: document.querySelector("#radarStatus"),
  radarMap: document.querySelector("#radarMap"),
  radarLegend: document.querySelector("#radarLegend"),
  radarAttribution: document.querySelector("#radarAttribution"),
  sources: document.querySelector("#sources"),
  updatedAt: document.querySelector("#updatedAt"),
  settingsForm: document.querySelector("#settingsForm"),
  settingsMessage: document.querySelector("#settingsMessage")
};

els.refreshButton.addEventListener("click", () => loadStatus(true));
els.settingsForm.addEventListener("submit", saveSettings);

loadStatus(false);

async function loadStatus(forceRefresh) {
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
  } finally {
    setLoading(false);
  }
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
  els.location.textContent = `${status.location.name} · ${formatCoord(status.location.latitude)}, ${formatCoord(status.location.longitude)}`;
  els.alertCard.dataset.level = status.rain.presentationLevel || status.rain.alertLevel;
  els.rainSummary.textContent = status.rain.headline || status.rain.alertLabel;
  els.rainEta.textContent = buildRainEtaText(status.rain);
  els.rainDetail.textContent = status.rain.detail || "";
  renderRainMeta(status.rain);

  els.temperature.textContent = formatValue(status.current.temperatureC, "°C");
  els.humidity.textContent = formatValue(status.current.humidityPct, "%");
  els.wind.textContent = formatValue(status.current.windKmh, "km/h");
  els.gust.textContent = formatValue(status.current.gustKmh, "km/h");

  renderHorizons(status.rain.horizons);
  renderGarden(status.rain.garden);
  renderRadar(status.radar, status.location);
  renderSources(status.sources);
  renderSettings(status.settings);
  els.updatedAt.textContent = `Dernière mise à jour : ${formatDate(status.updatedAt)}`;
}

function renderRainMeta(rain) {
  els.rainMeta.innerHTML = "";

  [
    { label: "Intensité", value: `${rain.intensityLabel} · ${formatValue(rain.intensityMmPerHour, "mm/h")}` },
    { label: "Risque", value: `${rain.riskLabel} · ${rain.horizons?.[0] ? Math.round(rain.horizons[0].score * 100) : 0} % à 30 min` },
    { label: "Durée", value: rain.expectedDurationMinutes ? `au moins ${formatDuration(rain.expectedDurationMinutes)}` : "non déterminée" }
  ].forEach((item) => {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.innerHTML = `<strong>${item.label}</strong>${item.value}`;
    els.rainMeta.append(pill);
  });
}

function buildRainEtaText(rain) {
  if (rain.activeNow) {
    return "Pluie détectée maintenant.";
  }

  if (rain.etaMinutes === null) {
    return "Aucune arrivée de pluie significative détectée dans les données immédiates.";
  }

  return `Arrivée estimée : ${rain.etaMinutes} min.`;
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

function renderGarden(garden) {
  if (!garden) {
    els.gardenCard.hidden = true;
    return;
  }

  els.gardenCard.hidden = false;
  els.gardenCard.dataset.level = garden.level;
  els.gardenSummary.textContent = garden.headline;
  els.gardenDetails.innerHTML = "";

  garden.details.forEach((detail) => {
    const item = document.createElement("li");
    item.textContent = detail;
    els.gardenDetails.append(item);
  });
}

function renderRadar(radar, location) {
  const rainViewer = radar?.rainViewer;
  const meteoFrance = radar?.meteoFrance;

  if (meteoFrance?.ok) {
    els.radarStatus.textContent = "Radar Météo-France actif.";
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
    item.className = source.ok ? "source-ok" : "source-ko";
    item.textContent = `${source.ok ? "OK" : "KO"} · ${source.label}${source.message ? ` · ${source.message}` : ""}`;
    els.sources.append(item);
  });
}

function renderSettings(settings) {
  els.settingsForm.rainThresholdMm.value = settings.rainThresholdMm;
  els.settingsForm.rainAlertMinutes.value = settings.rainAlertMinutes;
  els.settingsForm.minConfidence.value = settings.minConfidence;
  els.settingsForm.quietMinutes.value = settings.quietMinutes;
  els.settingsForm.enableRainAlerts.checked = settings.enableRainAlerts;
  els.settingsForm.enableNtfy.checked = settings.enableNtfy;
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.textContent = isLoading ? "Chargement…" : "Actualiser";
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
