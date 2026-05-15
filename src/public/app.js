const AUTO_REFRESH_MS = 5 * 60 * 1000;

const GARDEN_ENTITY_COLORS = {
  zone: "#588157",
  vegetable_bed: "#4f8f45",
  vine: "#7d4e8a",
  tree: "#386641",
  plant: "#74a57f",
  greenhouse: "#d99027",
  weather_station: "#277da1",
  sensor: "#5a7d8a",
  water_tank: "#3a86a8",
  compost: "#8d6e4f",
  other: "#7c8a80"
};

const FORECAST_EXTERNAL_SOURCE_ORDER = ["arome", "metNorway"];

const FORECAST_SOURCE_LABELS = {
  arome: "AROME",
  metNorway: "MET Norway",
  wgf: "WGF"
};

const WEATHER_ICON_FILES = {
  sun: "weather-sun.svg",
  partlyCloudy: "weather-partly-cloudy.svg",
  cloud: "weather-cloud.svg",
  lightRain: "weather-light-rain.svg",
  moderateRain: "weather-moderate-rain.svg",
  heavyRain: "weather-heavy-rain.svg",
  wind: "weather-wind.svg",
  gust: "weather-gust.svg",
  frost: "weather-frost.svg",
  fog: "weather-fog.svg",
  storm: "weather-storm.svg",
  uncertain: "weather-uncertain.svg",
  unavailable: "weather-unavailable.svg"
};

const state = {
  status: null,
  gardenState: null,
  gardenLoadError: null,
  ecowittDiagnostics: null,
  ecowittLoadError: null,
  selectedGardenEntityId: null,
  gardenDirty: false,
  gardenMap: null,
  gardenBaseLayer: null,
  gardenLayers: null,
  gardenLayerById: new Map(),
  gardenSearchQuery: "",
  gardenTypeFilter: "all",
  gardenDetailTab: "info",
  gardenSaveError: null,
  gardenSaving: false,
  radarMap: null,
  radarBaseLayer: null,
  radarRainLayer: null,
  radarNativeLayer: null,
  radarMarker: null,
  refreshTimer: null,
  countdownTimer: null,
  nextRefreshAt: null,
  isLoading: false,
  unitSystem: "metric"
};

const els = {
  location: document.querySelector("#location"),
  refreshStatus: document.querySelector("#refreshStatus"),
  navButtons: document.querySelectorAll("[data-panel-target]"),
  panels: document.querySelectorAll("[data-panel]"),
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
  stationPressure: document.querySelector("#stationPressure"),
  stationRain: document.querySelector("#stationRain"),
  stationUv: document.querySelector("#stationUv"),
  currentSource: document.querySelector("#currentSource"),
  temperature: document.querySelector("#temperature"),
  humidity: document.querySelector("#humidity"),
  wind: document.querySelector("#wind"),
  gust: document.querySelector("#gust"),
  horizonsCard: document.querySelector("#horizonsCard"),
  horizons: document.querySelector("#horizons"),
  forecastComparisonCard: document.querySelector("#forecastComparisonCard"),
  forecastComparisonGeneratedAt: document.querySelector("#forecastComparisonGeneratedAt"),
  forecastComparisonBody: document.querySelector("#forecastComparisonBody"),
  gardenCard: document.querySelector("#gardenCard"),
  gardenBadge: document.querySelector("#gardenBadge"),
  gardenSummary: document.querySelector("#gardenSummary"),
  gardenDetails: document.querySelector("#gardenDetails"),
  gardenWorkspaceStatus: document.querySelector("#gardenWorkspaceStatus"),
  gardenKmlMessage: document.querySelector("#gardenKmlMessage"),
  gardenStatusBadge: document.querySelector("#gardenStatusBadge"),
  gardenDetailCard: document.querySelector("#gardenDetailCard"),
  gardenDetailTabs: document.querySelector("#gardenDetailTabs"),
  gardenDetailSecondary: document.querySelector("#gardenDetailSecondary"),
  gardenMap: document.querySelector("#gardenMap"),
  gardenMapMessage: document.querySelector("#gardenMapMessage"),
  gardenEntitiesCount: document.querySelector("#gardenEntitiesCount"),
  gardenEntitiesList: document.querySelector("#gardenEntitiesList"),
  gardenEntitySearch: document.querySelector("#gardenEntitySearch"),
  gardenEntityTypeFilter: document.querySelector("#gardenEntityTypeFilter"),
  gardenEntityDetail: document.querySelector("#gardenEntityDetail"),
  gardenEntityForm: document.querySelector("#gardenEntityForm"),
  gardenFormState: document.querySelector("#gardenFormState"),
  gardenEntityMessage: document.querySelector("#gardenEntityMessage"),
  gardenAddButton: document.querySelector("#gardenAddButton"),
  gardenSidebarAddButton: document.querySelector("#gardenSidebarAddButton"),
  resetGardenButton: document.querySelector("#resetGardenButton"),
  clearGardenFormButton: document.querySelector("#clearGardenFormButton"),
  deleteGardenEntityButton: document.querySelector("#deleteGardenEntityButton"),
  duplicateGardenEntityButton: document.querySelector("#duplicateGardenEntityButton"),
  importKmlButton: document.querySelector("#importKmlButton"),
  exportKmlButton: document.querySelector("#exportKmlButton"),
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
  publicJsonLink: document.querySelector("#publicJsonLink"),
  debugStatusLink: document.querySelector("#debugStatusLink"),
  debugSourcesLink: document.querySelector("#debugSourcesLink"),
  debugEcowittLink: document.querySelector("#debugEcowittLink"),
  debugRainLink: document.querySelector("#debugRainLink"),
  debugOutput: document.querySelector("#debugOutput"),
  debugRefreshButton: document.querySelector("#debugRefreshButton"),
  ntfyTestButton: document.querySelector("#ntfyTestButton"),
  settingsForm: document.querySelector("#settingsForm"),
  settingsMessage: document.querySelector("#settingsMessage")
};

els.settingsForm?.addEventListener("submit", saveSettings);
els.gardenEntityForm?.addEventListener("submit", saveGardenEntity);
els.gardenEntityForm?.addEventListener("input", markGardenDirty);
els.resetGardenButton?.addEventListener("click", resetGarden);
els.clearGardenFormButton?.addEventListener("click", clearGardenSelection);
els.gardenAddButton?.addEventListener("click", startCreateGardenEntity);
els.gardenSidebarAddButton?.addEventListener("click", startCreateGardenEntity);
els.gardenEntitySearch?.addEventListener("input", () => {
  state.gardenSearchQuery = els.gardenEntitySearch.value;
  renderGardenWorkspace(getGardenEntities(state.status), state.status?.location);
});
els.gardenEntityTypeFilter?.addEventListener("change", () => {
  state.gardenTypeFilter = els.gardenEntityTypeFilter.value;
  renderGardenWorkspace(getGardenEntities(state.status), state.status?.location);
});
els.gardenDetailTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-garden-detail-tab]");

  if (button) {
    state.gardenDetailTab = button.dataset.gardenDetailTab;
    renderGardenWorkspace(getGardenEntities(state.status), state.status?.location);
  }
});
els.gardenDetailCard?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-garden-action]");

  if (button) {
    handleGardenAction({ currentTarget: button });
  }
});
els.deleteGardenEntityButton?.addEventListener("click", () => {
  if (state.selectedGardenEntityId) {
    confirmAndDeleteGardenEntity(state.selectedGardenEntityId);
  }
});
els.duplicateGardenEntityButton?.addEventListener("click", duplicateSelectedGardenEntity);
els.importKmlButton?.addEventListener("click", showKmlUnavailable);
els.exportKmlButton?.addEventListener("click", showKmlUnavailable);
document.querySelectorAll("[data-garden-action]").forEach((button) => {
  button.addEventListener("click", handleGardenAction);
});
els.debugRefreshButton?.addEventListener("click", () => loadDebugJson("/api/debug/status"));
els.ntfyTestButton?.addEventListener("click", sendTestNotification);

els.navButtons.forEach((button) => {
  button.addEventListener("click", () => activatePanel(button.dataset.panelTarget));
});

document.body.dataset.activePanel = "dashboard";
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

    const [gardenState, ecowittDiagnostics] = await Promise.all([
      fetchGardenState(),
      fetchEcowittDiagnostics()
    ]);

    state.status = status;
    state.gardenState = gardenState;
    state.ecowittDiagnostics = ecowittDiagnostics;
    renderStatus(status);
    scheduleNextRefresh();
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
  window.clearInterval(state.countdownTimer);
  state.refreshTimer = window.setInterval(() => loadStatus(false), AUTO_REFRESH_MS);
  state.countdownTimer = window.setInterval(updateRefreshCountdown, 1000);
  scheduleNextRefresh();
}

function scheduleNextRefresh() {
  state.nextRefreshAt = Date.now() + AUTO_REFRESH_MS;
  updateRefreshCountdown();
}

async function fetchGardenState() {
  try {
    const response = await fetch("/api/garden");

    if (!response.ok) {
      throw new Error("Chargement du jardin impossible.");
    }

    state.gardenLoadError = null;
    return response.json();
  } catch (error) {
    state.gardenLoadError = error;
    return null;
  }
}

async function fetchEcowittDiagnostics() {
  try {
    const response = await fetch("/api/debug/ecowitt");
    const diagnostics = await readJsonResponse(response);

    if (!response.ok || diagnostics.ok === false) {
      throw new Error(diagnostics.error || diagnostics.message || "Historique Ecowitt indisponible.");
    }

    state.ecowittLoadError = null;
    return diagnostics;
  } catch (error) {
    state.ecowittLoadError = error;
    return null;
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const formData = new FormData(els.settingsForm);
  const settings = {
    unitSystem: normalizeUnitSystem(formData.get("unitSystem")),
    rainThresholdMm: Number(formData.get("rainThresholdMm")),
    rainAlertMinutes: Number(formData.get("rainAlertMinutes")),
    minConfidence: Number(formData.get("minConfidence")),
    quietMinutes: Number(formData.get("quietMinutes")),
    enableRainAlerts: formData.has("enableRainAlerts"),
    enableGardenAlerts: formData.has("enableGardenAlerts"),
    enableNtfy: formData.has("enableNtfy"),
    frostWatchTempC: Number(formData.get("frostWatchTempC")),
    windGustRiskKmh: Number(formData.get("windGustRiskKmh")),
    heavyRain2hMm: Number(formData.get("heavyRain2hMm")),
    diseaseHumidityPct: Number(formData.get("diseaseHumidityPct"))
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

async function saveGardenEntity(event) {
  event.preventDefault();
  const formData = new FormData(els.gardenEntityForm);
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    els.gardenEntityMessage.textContent = "Nom obligatoire.";
    return;
  }

  state.gardenSaving = true;
  state.gardenSaveError = null;
  updateGardenFormState();

  const entity = {
    id: String(formData.get("id") || name),
    type: formData.get("type"),
    name,
    tags: String(formData.get("tags") || ""),
    notes: String(formData.get("notes") || ""),
    position: {
      label: String(formData.get("positionLabel") || "")
    }
  };

  try {
    const response = await fetch("/api/garden/entities", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(entity)
    });

    if (!response.ok) {
      throw new Error("Erreur lors de l'enregistrement.");
    }

    const savedState = await response.json();
    const savedEntity = savedState.entities.find((item) => item.id === entity.id || item.name === entity.name) || entity;
    state.gardenState = savedState;
    state.selectedGardenEntityId = savedEntity.id;
    state.gardenDirty = false;
    fillGardenForm(savedEntity);
    els.gardenEntityMessage.textContent = "Entité enregistrée.";
    await loadStatus(true);
  } catch (error) {
    state.gardenSaveError = error;
    els.gardenEntityMessage.textContent = error.message;
  } finally {
    state.gardenSaving = false;
    updateGardenFormState();
  }
}

async function deleteGardenEntity(id) {
  state.gardenSaving = true;
  state.gardenSaveError = null;
  updateGardenFormState();

  try {
    const response = await fetch(`/api/garden/entities/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      throw new Error("Suppression impossible.");
    }

    state.selectedGardenEntityId = null;
    state.gardenDirty = false;
    state.gardenDetailTab = "info";
    els.gardenEntityForm.reset();
    els.gardenEntityMessage.textContent = "Entité supprimée.";
    await loadStatus(true);
  } catch (error) {
    state.gardenSaveError = error;
    els.gardenEntityMessage.textContent = error.message;
  } finally {
    state.gardenSaving = false;
    updateGardenFormState();
  }
}

function confirmAndDeleteGardenEntity(id) {
  const entity = getGardenEntities(state.status).find((item) => item.id === id);
  const label = entity?.name || id;
  const confirmed = window.confirm(`Supprimer l'entité sélectionnée "${label}" ? Cette action retirera l'entité du GardenState.`);

  if (!confirmed) {
    return;
  }

  deleteGardenEntity(id);
}

async function resetGarden() {
  const confirmed = window.confirm("Réinitialiser le jardin ? Tout le GardenState sera remis à zéro et les entités actuelles seront remplacées par l'état par défaut.");

  if (!confirmed) {
    return;
  }

  state.gardenSaving = true;
  state.gardenSaveError = null;
  updateGardenFormState();

  try {
    const response = await fetch("/api/garden/reset", {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error("Réinitialisation impossible.");
    }

    state.selectedGardenEntityId = null;
    state.gardenDirty = false;
    state.gardenDetailTab = "info";
    els.gardenEntityForm.reset();
    els.gardenEntityMessage.textContent = "Jardin réinitialisé.";
    await loadStatus(true);
  } catch (error) {
    state.gardenSaveError = error;
    els.gardenEntityMessage.textContent = error.message;
  } finally {
    state.gardenSaving = false;
    updateGardenFormState();
  }
}

async function sendTestNotification() {
  els.settingsMessage.textContent = "Envoi du test…";

  try {
    const response = await fetch("/api/alerts/test", {
      method: "POST"
    });
    const data = await readJsonResponse(response);

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "Notification de test impossible.");
    }

    els.settingsMessage.textContent = "Notification de test envoyée.";
  } catch (error) {
    els.settingsMessage.textContent = error.message;
  }
}

async function loadDebugJson(path) {
  els.debugOutput.textContent = "Chargement…";

  try {
    const response = await fetch(path);
    const data = await readJsonResponse(response);
    els.debugOutput.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    els.debugOutput.textContent = JSON.stringify({ ok: false, error: error.message }, null, 2);
  }
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: text
    };
  }
}

function renderStatus(status) {
  state.unitSystem = normalizeUnitSystem(status.settings?.unitSystem);
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
  renderHorizons(rain.horizons || [], noSignificantRain);
  renderForecastComparison(status.forecastComparison);
  renderGarden(rain.garden, status.garden);
  renderGardenWorkspace(getGardenEntities(status), status.location);
  renderGardenAlerts(status.garden?.alerts);
  renderRadar(status.radar, status.location);
  renderSources(status.sources || []);
  renderSettings(status.settings || {});
  renderDebugLinks();
  els.updatedAt.textContent = `Dernière mise à jour : ${formatDate(status.updatedAt)}`;
}

function renderRainMeta(rain) {
  els.rainMeta.innerHTML = "";

  if (isNoSignificantRain(rain)) {
    els.rainMeta.hidden = true;
    return;
  }

  els.rainMeta.hidden = false;

  [
    { label: "Intensité", value: `${rain.intensityLabel} · ${formatRainRate(rain.intensityMmPerHour)}` },
    { label: "Risque", value: `${rain.riskLabel} · ${rain.horizons?.[0] ? Math.round(rain.horizons[0].score * 100) : 0} % à 30 min` },
    { label: "Durée", value: rain.expectedDurationMinutes ? formatDuration(rain.expectedDurationMinutes) : "non déterminée" },
    { label: "Source", value: rain.observation?.source === "station" ? "station locale" : "prévision" }
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
  els.stationCard.dataset.stale = String(!!station.stale);
  els.stationSource.textContent = `${station.label || uiText("@{%Station météo%}")}${station.updatedAt ? ` · ${formatDate(station.updatedAt)}` : ""}${station.stale ? " · données anciennes" : ""}`;
  els.stationTemperature.textContent = formatTemperature(current.temperatureC);
  els.stationHumidity.textContent = formatValue(current.humidityPct, "%");
  els.stationWind.textContent = formatWind(current.windKmh);
  els.stationGust.textContent = formatWind(current.gustKmh);
  els.stationPressure.textContent = formatPressure(current.pressureHpa);
  els.stationRain.textContent = `${formatRainRate(current.rainRateMmPerHour)} · jour ${formatRain(current.dailyRainMm)}`;
  els.stationUv.textContent = `${formatValue(current.uvIndex, "")} · ${formatValue(current.solarWm2, "W/m²")}`;
}

function renderCurrentForecast(current) {
  els.currentSource.textContent = current?.sourceLabel || "Prévision immédiate · Open-Meteo AROME / MET Norway";
  els.temperature.textContent = formatTemperature(current?.temperatureC);
  els.humidity.textContent = formatValue(current?.humidityPct, "%");
  els.wind.textContent = formatWind(current?.windKmh);
  els.gust.textContent = formatWind(current?.gustKmh);
}

function renderHorizons(horizons, noSignificantRain) {
  els.horizons.innerHTML = "";
  els.horizonsCard.hidden = noSignificantRain;

  if (noSignificantRain) {
    return;
  }

  horizons.forEach((item) => {
    const row = document.createElement("div");
    row.className = "horizon-row";
    row.dataset.level = item.alertLevel;
    row.innerHTML = `
      <strong>${formatDuration(item.minutes)}</strong>
      <span>${item.intensityLabel}</span>
      <span>${formatRainRate(item.intensityMmPerHour)}</span>
      <span>${formatRain(item.precipitationMm)}</span>
    `;
    els.horizons.append(row);
  });
}

function renderForecastComparison(comparison) {
  if (!els.forecastComparisonBody) {
    return;
  }

  const horizons = Array.isArray(comparison?.horizons) ? comparison.horizons : [];
  const columns = getForecastComparisonColumns(horizons);

  els.forecastComparisonCard.hidden = false;
  els.forecastComparisonGeneratedAt.textContent = comparison?.generatedAt
    ? `Weather Garden Forecast · généré le ${formatDate(comparison.generatedAt)}`
    : "Weather Garden Forecast · comparatif indisponible";
  els.forecastComparisonBody.innerHTML = "";
  els.forecastComparisonBody.style.setProperty("--forecast-source-columns", String(columns.length || 3));

  if (!horizons.length) {
    const empty = document.createElement("p");
    empty.className = "forecast-comparison-empty";
    empty.textContent = comparison ? "Aucun horizon de comparaison disponible." : "Comparatif des prévisions indisponible.";
    els.forecastComparisonBody.append(empty);
    return;
  }

  const header = document.createElement("div");
  const horizonHeader = document.createElement("span");

  header.className = "forecast-comparison-header";
  horizonHeader.textContent = "Horizon";
  header.append(horizonHeader);

  columns.forEach((column) => {
    const item = document.createElement("span");
    item.textContent = column.label;
    header.append(item);
  });
  els.forecastComparisonBody.append(header);

  horizons.forEach((horizon) => {
    const row = document.createElement("article");
    const horizonLabel = document.createElement("strong");

    row.className = "forecast-comparison-row";
    horizonLabel.className = "forecast-comparison-horizon";
    horizonLabel.textContent = horizon.label || formatDuration(horizon.minutes);
    row.append(horizonLabel);

    columns.forEach((column) => {
      row.append(buildForecastSourceCell(column.label, horizon.sources?.[column.key], column.isWgf));
    });

    els.forecastComparisonBody.append(row);
  });
}

function getForecastComparisonColumns(horizons) {
  const availableKeys = new Set();

  horizons.forEach((horizon) => {
    Object.keys(horizon.sources || {}).forEach((key) => availableKeys.add(key));
  });

  const externalKeys = [
    ...FORECAST_EXTERNAL_SOURCE_ORDER.filter((key) => availableKeys.has(key)),
    ...Array.from(availableKeys)
      .filter((key) => key !== "wgf" && !FORECAST_EXTERNAL_SOURCE_ORDER.includes(key))
      .sort()
  ];
  const columns = externalKeys.map((key) => ({
    key,
    label: formatForecastSourceLabel(key),
    isWgf: false
  }));

  if (availableKeys.has("wgf")) {
    columns.push({ key: "wgf", label: formatForecastSourceLabel("wgf"), isWgf: true });
  }

  return columns.length
    ? columns
    : [
      { key: "arome", label: "AROME", isWgf: false },
      { key: "metNorway", label: "MET Norway", isWgf: false },
      { key: "wgf", label: "WGF", isWgf: true }
    ];
}

function formatForecastSourceLabel(key) {
  if (FORECAST_SOURCE_LABELS[key]) {
    return FORECAST_SOURCE_LABELS[key];
  }

  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function buildForecastSourceCell(label, source, isWgf = false) {
  const cell = document.createElement("div");
  const heading = document.createElement("span");
  const icon = document.createElement("img");
  const headingText = document.createElement("span");
  const cellLabel = document.createElement("span");
  const status = document.createElement("span");
  const body = document.createElement("span");
  const reason = document.createElement("small");

  cell.className = `forecast-source-cell${isWgf ? " forecast-source-wgf" : ""}`;
  cell.dataset.state = source?.state || "unavailable";
  heading.className = "forecast-source-heading";
  icon.className = "forecast-source-icon";
  icon.src = buildForecastWeatherIconPath(source, isWgf);
  icon.alt = "";
  icon.loading = "lazy";
  icon.setAttribute("aria-hidden", "true");
  headingText.className = "forecast-source-heading-text";
  cellLabel.className = "forecast-cell-label";
  cellLabel.textContent = label;
  status.className = "forecast-source-state";
  status.textContent = formatForecastState(source);
  body.className = "forecast-source-main";
  body.textContent = formatForecastSourceMain(source, isWgf);
  reason.className = "forecast-source-reason";

  headingText.append(cellLabel, status);
  heading.append(icon, headingText);
  cell.append(heading, body);

  if (isWgf) {
    appendWgfReason(reason, source);
  } else {
    reason.textContent = formatFreshness(source);
  }

  if (reason.textContent || reason.children.length) {
    cell.append(reason);
  }

  return cell;
}

function buildForecastWeatherIconPath(source, isWgf) {
  const family = isWgf ? "wgf" : "source";
  return `assets/weather-icons/${family}/${getForecastWeatherIconName(source)}`;
}

function getForecastWeatherIconName(source) {
  if (!source?.available || source.state === "unavailable") {
    return WEATHER_ICON_FILES.unavailable;
  }

  const textIcon = getForecastWeatherIconFromText(source);

  if (textIcon) {
    return textIcon;
  }

  const codeIcon = getForecastWeatherIconFromCode(source.weatherCode ?? source.weather_code ?? source.code);

  if (codeIcon) {
    return codeIcon;
  }

  if (source.confidence === "low" || source.summary === "Signal incomplet.") {
    return WEATHER_ICON_FILES.uncertain;
  }

  if (Number.isFinite(source.temperatureC) && source.temperatureC <= 1) {
    return WEATHER_ICON_FILES.frost;
  }

  if (
    Number.isFinite(source.gustKmh)
    && source.gustKmh >= 70
    && Number.isFinite(source.precipitationMm)
    && source.precipitationMm >= 5
  ) {
    return WEATHER_ICON_FILES.storm;
  }

  if (Number.isFinite(source.precipitationMm)) {
    if (source.precipitationMm >= 8) {
      return WEATHER_ICON_FILES.heavyRain;
    }

    if (source.precipitationMm >= 2) {
      return WEATHER_ICON_FILES.moderateRain;
    }

    if (source.precipitationMm >= 0.05) {
      return WEATHER_ICON_FILES.lightRain;
    }
  }

  if (Number.isFinite(source.gustKmh) && source.gustKmh >= 50) {
    return WEATHER_ICON_FILES.gust;
  }

  if (Number.isFinite(source.windKmh) && source.windKmh >= 35) {
    return WEATHER_ICON_FILES.wind;
  }

  if (Number.isFinite(source.precipitationMm)) {
    return WEATHER_ICON_FILES.partlyCloudy;
  }

  return WEATHER_ICON_FILES.uncertain;
}

function getForecastWeatherIconFromText(source) {
  const text = [source.summary, source.reason, source.weather, source.weatherLabel, source.symbolCode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!text) {
    return null;
  }

  if (text.includes("orage") || text.includes("storm") || text.includes("thunder")) {
    return WEATHER_ICON_FILES.storm;
  }

  if (text.includes("brouillard") || text.includes("brume") || text.includes("fog")) {
    return WEATHER_ICON_FILES.fog;
  }

  if (text.includes("gel") || text.includes("frost")) {
    return WEATHER_ICON_FILES.frost;
  }

  if (text.includes("rafale") || text.includes("gust")) {
    return WEATHER_ICON_FILES.gust;
  }

  if (text.includes("vent") || text.includes("wind")) {
    return WEATHER_ICON_FILES.wind;
  }

  if (text.includes("pas de pluie") || text.includes("no significant rain")) {
    return WEATHER_ICON_FILES.partlyCloudy;
  }

  if (text.includes("pluie marquee") || text.includes("pluie forte") || text.includes("heavy rain")) {
    return WEATHER_ICON_FILES.heavyRain;
  }

  if (text.includes("pluie moderee") || text.includes("moderate rain")) {
    return WEATHER_ICON_FILES.moderateRain;
  }

  if (text.includes("pluie") || text.includes("rain")) {
    return WEATHER_ICON_FILES.lightRain;
  }

  if (text.includes("nuage") || text.includes("cloud")) {
    return WEATHER_ICON_FILES.cloud;
  }

  if (text.includes("soleil") || text.includes("sun")) {
    return WEATHER_ICON_FILES.sun;
  }

  return null;
}

function getForecastWeatherIconFromCode(value) {
  const code = Number(value);

  if (!Number.isFinite(code)) {
    return null;
  }

  if (code === 0) {
    return WEATHER_ICON_FILES.sun;
  }

  if (code === 1 || code === 2) {
    return WEATHER_ICON_FILES.partlyCloudy;
  }

  if (code === 3) {
    return WEATHER_ICON_FILES.cloud;
  }

  if (code === 45 || code === 48) {
    return WEATHER_ICON_FILES.fog;
  }

  if ((code >= 51 && code <= 57) || (code >= 80 && code <= 81)) {
    return WEATHER_ICON_FILES.lightRain;
  }

  if ((code >= 61 && code <= 67) || code === 82) {
    return WEATHER_ICON_FILES.moderateRain;
  }

  if (code >= 71 && code <= 77) {
    return WEATHER_ICON_FILES.frost;
  }

  if (code >= 95 && code <= 99) {
    return WEATHER_ICON_FILES.storm;
  }

  return WEATHER_ICON_FILES.uncertain;
}

function formatForecastSourceMain(source, isWgf) {
  if (!source?.available) {
    return "Indisponible";
  }

  if (isWgf) {
    const confidence = formatWgfConfidence(source.confidence);
    return [source.summary || "Signal WGF disponible", confidence ? `confiance ${confidence}` : ""]
      .filter(Boolean)
      .join(" · ");
  }

  return [
    formatForecastRain(source.precipitationMm),
    formatTemperature(source.temperatureC),
    `vent ${formatWind(source.windKmh)}`,
    Number.isFinite(source.gustKmh) ? `rafales ${formatWind(source.gustKmh)}` : ""
  ].filter(Boolean).join(" · ");
}

function formatForecastRain(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value < 0.05 ? "sec" : formatRain(value);
}

function formatForecastState(source) {
  if (!source?.available || source.state === "unavailable") {
    return "Indisponible";
  }

  if (source.state === "stale") {
    return "Ancien";
  }

  if (source.state === "fresh") {
    return "OK";
  }

  return "OK";
}

function formatFreshness(source) {
  if (!Number.isFinite(source?.freshnessMinutes)) {
    return "";
  }

  return `âge ${formatDuration(source.freshnessMinutes)}`;
}

function formatWgfConfidence(value) {
  return {
    high: "forte",
    medium: "moyenne",
    low: "faible",
    unavailable: "indisponible"
  }[value] || "";
}

function appendWgfReason(container, source) {
  const label = document.createElement("span");
  const detail = document.createElement("span");

  label.className = "forecast-reason-label";
  label.textContent = formatWgfReasonLabel(source);
  detail.className = "forecast-reason-detail";
  detail.textContent = formatWgfReason(source);
  container.append(label);

  if (detail.textContent && detail.textContent !== label.textContent) {
    container.append(detail);
  }
}

function formatWgfReasonLabel(source) {
  const reason = String(source?.reason || "").toLowerCase();

  if (!source?.available) {
    return "WGF indisponible";
  }

  if (reason.includes("diverg")) {
    return "Modèles divergents";
  }

  if (reason.includes("ancienne") || reason.includes("partielle")) {
    return "Sources partielles";
  }

  if (reason.includes("coherent")) {
    return "Sources cohérentes";
  }

  if (reason.includes("arome disponible")) {
    return "AROME prioritaire";
  }

  if (reason.includes("met norway disponible")) {
    return "MET Norway seul";
  }

  if (reason.includes("observation locale")) {
    return "Observation locale incluse";
  }

  return "Signal consolidé";
}

function formatWgfReason(source) {
  if (!source?.available) {
    return source?.reason || "Aucune prévision locale consolidée disponible.";
  }

  return source.reason || "";
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

function renderGardenWorkspace(entities, location) {
  const filteredEntities = filterGardenEntities(entities);

  if (els.gardenEntitiesCount) {
    els.gardenEntitiesCount.textContent = formatGardenEntityCount(entities.length);
  }

  if (els.gardenWorkspaceStatus) {
    els.gardenWorkspaceStatus.textContent = "Cartographiez vos zones, plantes, capteurs et stations météo.";
  }

  renderGardenStatusBadge();
  renderGardenEntities(filteredEntities, entities);
  renderGardenEntityDetail(entities);
  renderGardenMap(entities, location);
  updateGardenFormState();
}

function renderGardenEntities(entities, allEntities) {
  els.gardenEntitiesList.innerHTML = "";
  renderGardenEntityRows(entities, allEntities);
}

function renderGardenEntityRows(entities, allEntities) {
  if (state.gardenLoadError) {
    appendGardenEmptyRow(state.gardenLoadError.message);
    return;
  }

  if (!allEntities.length) {
    appendGardenEmptyRow("Aucune entité jardin enregistrée.", true);
    return;
  }

  if (!entities.length) {
    appendGardenEmptyRow("Aucune entité ne correspond à la recherche.");
    return;
  }

  entities.forEach((entity) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const actions = document.createElement("div");
    const centerButton = document.createElement("button");

    item.className = `garden-entity-row${entity.id === state.selectedGardenEntityId ? " garden-entity-row--selected" : ""}${hasGardenMapPosition(entity) ? "" : " garden-entity-row--no-position"}`;
    item.dataset.selected = String(entity.id === state.selectedGardenEntityId);
    item.dataset.entityType = entity.type || "other";
    button.type = "button";
    button.className = "garden-entity-select";
    button.innerHTML = `
      <span class="garden-entity-type-badge" aria-hidden="true"></span>
      <span class="garden-entity-row-main">
        <strong>${escapeHtml(entity.name || "Entité sans nom")}</strong>
        <span>${escapeHtml(formatGardenTypeLabel(entity.type))}</span>
        ${entity.tags?.length ? `<span>${escapeHtml(entity.tags.join(", "))}</span>` : ""}
      </span>
      <span class="garden-entity-geometry-badge">${escapeHtml(formatGardenGeometryLabel(entity))}</span>
    `;
    button.addEventListener("click", () => selectGardenEntity(entity.id));

    actions.className = "garden-entity-row-actions";

    centerButton.type = "button";
    centerButton.className = "garden-entity-center-button secondary";
    centerButton.textContent = "Centrer";
    centerButton.disabled = !hasGardenMapPosition(entity);
    centerButton.addEventListener("click", () => centerGardenEntity(entity.id));
    actions.append(centerButton);

    item.append(button, actions);
    els.gardenEntitiesList.append(item);
  });
}

function appendGardenEmptyRow(message, withActions = false) {
  const item = document.createElement("li");
  item.className = "empty-row garden-empty-state";
  item.innerHTML = `<strong>${escapeHtml(message)}</strong>`;

  if (withActions) {
    const actions = document.createElement("div");
    const addButton = document.createElement("button");
    const importButton = document.createElement("button");

    actions.className = "button-row";
    addButton.type = "button";
    addButton.textContent = "Ajouter une entité";
    addButton.addEventListener("click", startCreateGardenEntity);
    importButton.type = "button";
    importButton.className = "secondary";
    importButton.textContent = "Importer un KML";
    importButton.addEventListener("click", showKmlUnavailable);
    actions.append(addButton, importButton);
    item.append(actions);
  }

  els.gardenEntitiesList.append(item);
}

function renderGardenEntityDetail(entities) {
  const selected = getSelectedGardenEntity(entities);

  if (!els.gardenEntityDetail) {
    return;
  }

  if (!selected) {
    if (state.gardenDirty) {
      els.gardenDetailCard.className = "garden-detail-card";
      els.gardenDetailTabs.innerHTML = "";
      els.gardenEntityForm.hidden = false;
      els.gardenDetailSecondary.innerHTML = `<p class="garden-state-note">Nouvelle entité en cours de création.</p>`;
      els.gardenEntityDetail.innerHTML = `
        <h3>Ajouter une entité</h3>
        <p class="muted">Renseignez les informations utiles, puis enregistrez l'entité.</p>
      `;
      els.deleteGardenEntityButton.disabled = true;
      els.duplicateGardenEntityButton.disabled = true;
      return;
    }

    els.gardenDetailCard.className = "garden-detail-card garden-detail-card--empty";
    els.gardenDetailTabs.innerHTML = "";
    els.gardenDetailSecondary.innerHTML = `
      <div class="garden-empty-state">
        <h3>Sélectionnez une entité</h3>
        <p>Choisissez une entité dans la liste ou ajoutez une zone sur la carte.</p>
        <div class="button-row">
          <button type="button" data-garden-action="add">Ajouter une entité</button>
          <button type="button" class="secondary" data-garden-action="import">Importer un KML</button>
        </div>
      </div>
    `;
    els.gardenEntityDetail.innerHTML = `
      <h3>Sélectionnez une entité</h3>
      <p class="muted">Choisissez une entité dans la liste ou ajoutez une zone sur la carte.</p>
    `;
    els.gardenEntityForm.hidden = true;
    els.deleteGardenEntityButton.disabled = true;
    els.duplicateGardenEntityButton.disabled = true;
    return;
  }

  const isStation = isLocalStationEntity(selected);
  els.gardenDetailCard.className = `garden-detail-card${isStation ? " garden-detail-card--station" : ""}`;
  els.gardenEntityForm.hidden = state.gardenDetailTab !== "info";
  els.deleteGardenEntityButton.disabled = false;
  els.duplicateGardenEntityButton.disabled = false;
  els.gardenEntityDetail.innerHTML = `
    <h3>${escapeHtml(selected.name)}</h3>
    <p class="muted">${escapeHtml(formatGardenTypeLabel(selected.type))} · ${escapeHtml(formatGardenGeometryLabel(selected))}</p>
  `;
  renderGardenDetailTabs();
  renderGardenDetailSecondary(selected);
}

function renderGardenDetailTabs() {
  const tabs = [
    { key: "info", label: "Informations" },
    { key: "sensors", label: "Capteurs" },
    { key: "alerts", label: "Alertes" },
    { key: "history", label: "Historique" }
  ];

  els.gardenDetailTabs.innerHTML = "";

  tabs.forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `garden-detail-tab${state.gardenDetailTab === tab.key ? " garden-detail-tab--active" : ""}`;
    button.dataset.gardenDetailTab = tab.key;
    button.textContent = tab.label;
    els.gardenDetailTabs.append(button);
  });
}

function renderGardenDetailSecondary(entity) {
  els.gardenDetailSecondary.innerHTML = "";

  if (state.gardenDetailTab === "info") {
    els.gardenDetailSecondary.innerHTML = hasGardenMapPosition(entity)
      ? `<button type="button" class="secondary" data-garden-action="center-selected">Modifier sur la carte</button>`
      : `<p class="garden-state-note">Position non renseignée pour cette entité.</p>`;
    return;
  }

  if (state.gardenDetailTab === "sensors") {
    els.gardenDetailSecondary.innerHTML = isLocalStationEntity(entity)
      ? buildLocalStationPanel(entity)
      : buildGardenSensorsEmpty(entity);
    return;
  }

  if (state.gardenDetailTab === "alerts") {
    els.gardenDetailSecondary.innerHTML = buildGardenAlertsDetail(entity);
    return;
  }

  els.gardenDetailSecondary.innerHTML = `
    <div class="garden-empty-state">
      <h4>Historique</h4>
      <p>L’historique des interventions sera disponible dans une prochaine version.</p>
    </div>
  `;
}

function renderGardenMap(entities, location) {
  if (!els.gardenMap) {
    return;
  }

  if (!window.L) {
    els.gardenMap.innerHTML = "<div class=\"radar-empty\">Carte indisponible : Leaflet n'a pas été chargé.</div>";
    return;
  }

  const center = getGardenMapCenter(entities, location);

  if (!center) {
    els.gardenMap.innerHTML = '<div class="radar-empty">Position jardin indisponible.</div>';
    return;
  }

  ensureGardenMap(center);
  updateGardenLayers(entities);

  window.setTimeout(() => {
    state.gardenMap.invalidateSize();
  }, 0);
}

function ensureGardenMap(center) {
  if (!state.gardenMap) {
    state.gardenMap = window.L.map(els.gardenMap, {
      zoomControl: true,
      scrollWheelZoom: false
    }).setView(center, 16);

    state.gardenBaseLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap"
    }).addTo(state.gardenMap);

    state.gardenLayers = window.L.layerGroup().addTo(state.gardenMap);
  } else {
    state.gardenMap.setView(center, state.gardenMap.getZoom() || 16);
  }
}

function updateGardenLayers(entities) {
  const bounds = [];
  state.gardenLayers.clearLayers();
  state.gardenLayerById.clear();

  entities.forEach((entity) => {
    const layer = createGardenEntityLayer(entity);

    if (!layer) {
      return;
    }

    layer.addTo(state.gardenLayers);
    layer.on("click", () => selectGardenEntity(entity.id));
    state.gardenLayerById.set(entity.id, layer);

    const layerBounds = getLayerBounds(layer);
    if (layerBounds) {
      bounds.push(layerBounds);
    }
  });

  const selectedLayer = state.gardenLayerById.get(state.selectedGardenEntityId);
  if (selectedLayer?.setStyle) {
    selectedLayer.setStyle({ fillOpacity: 0.42, opacity: 1, weight: 4 });
  }

  if (bounds.length) {
    const groupBounds = bounds.reduce((acc, item) => acc.extend(item), bounds[0]);
    state.gardenMap.fitBounds(groupBounds.pad(0.2), { maxZoom: 17 });
    els.gardenMapMessage.textContent = "Carte Jardin dédiée, sans couche radar.";
  } else {
    els.gardenMapMessage.textContent = "Aucune position ou géométrie exploitable dans les entités actuelles.";
  }
}

function createGardenEntityLayer(entity) {
  const geometry = entity.position?.geometry;
  const popupLabel = isLocalStationEntity(entity)
    ? `Station météo locale · ${formatLocalStationStateLabel(entity)}`
    : entity.name;

  if (geometry?.type === "Point") {
    return window.L.marker([geometry.coordinates[1], geometry.coordinates[0]], getGardenMarkerOptions(entity)).bindPopup(popupLabel);
  }

  if (geometry?.type === "LineString") {
    return window.L.polyline(geometry.coordinates.map(toLatLng), getGardenVectorStyle(entity)).bindPopup(popupLabel);
  }

  if (geometry?.type === "Polygon") {
    return window.L.polygon(geometry.coordinates.map((ring) => ring.map(toLatLng)), getGardenVectorStyle(entity)).bindPopup(popupLabel);
  }

  if (Number.isFinite(entity.position?.latitude) && Number.isFinite(entity.position?.longitude)) {
    return window.L.marker([entity.position.latitude, entity.position.longitude], getGardenMarkerOptions(entity)).bindPopup(popupLabel);
  }

  return null;
}

function centerGardenEntity(id) {
  const layer = state.gardenLayerById.get(id);

  if (!layer || !state.gardenMap) {
    return;
  }

  selectGardenEntity(id);

  const bounds = getLayerBounds(layer);
  if (bounds) {
    state.gardenMap.fitBounds(bounds.pad(0.35), { maxZoom: 18 });
  }
}

function centerGardenMap() {
  updateGardenLayers(getGardenEntities(state.status));
}

function selectGardenEntity(id) {
  const entities = getGardenEntities(state.status);
  const entity = entities.find((item) => item.id === id);

  if (!entity) {
    return;
  }

  state.selectedGardenEntityId = id;
  state.gardenDirty = false;
  state.gardenDetailTab = isLocalStationEntity(entity) ? "sensors" : "info";
  fillGardenForm(entity);
  renderGardenWorkspace(entities, state.status?.location);

  const layer = state.gardenLayerById.get(id);
  if (layer?.openPopup) {
    layer.openPopup();
  }
}

function clearGardenSelection() {
  state.selectedGardenEntityId = null;
  state.gardenDirty = false;
  state.gardenDetailTab = "info";
  els.gardenEntityForm.reset();
  els.gardenEntityForm.hidden = false;
  els.deleteGardenEntityButton.disabled = true;
  els.duplicateGardenEntityButton.disabled = true;
  renderGardenWorkspace(getGardenEntities(state.status), state.status?.location);
}

function fillGardenForm(entity) {
  setGardenFormValue("id", entity.id || "");
  setGardenFormValue("type", entity.type || "other");
  setGardenFormValue("name", entity.name || "");
  setGardenFormValue("tags", entity.tags?.join(", ") || "");
  setGardenFormValue("positionLabel", entity.position?.label || "");
  setGardenFormValue("notes", entity.notes || "");
}

function setGardenFormValue(name, value) {
  const field = els.gardenEntityForm?.elements.namedItem(name);

  if (field) {
    field.value = value;
  }
}

function markGardenDirty() {
  state.gardenDirty = true;
  updateGardenFormState();
}

function updateGardenFormState() {
  if (!els.gardenFormState) {
    return;
  }

  const label = getGardenStatusLabel();
  els.gardenFormState.textContent = label;
  els.gardenFormState.dataset.state = getGardenStatusState();
  renderGardenStatusBadge();
}

function renderGardenStatusBadge() {
  if (!els.gardenStatusBadge) {
    return;
  }

  els.gardenStatusBadge.textContent = getGardenStatusLabel();
  els.gardenStatusBadge.dataset.state = getGardenStatusState();
}

function getGardenStatusLabel() {
  if (state.gardenSaving) {
    return "Sauvegarde en cours";
  }

  if (state.gardenSaveError || state.gardenLoadError) {
    return "Erreur de sauvegarde";
  }

  if (state.gardenDirty) {
    return "Modifications non enregistrées";
  }

  return "Enregistré";
}

function getGardenStatusState() {
  if (state.gardenSaving) {
    return "saving";
  }

  if (state.gardenSaveError || state.gardenLoadError) {
    return "error";
  }

  if (state.gardenDirty) {
    return "dirty";
  }

  return "saved";
}

function handleGardenAction(event) {
  const action = event.currentTarget.dataset.gardenAction;

  if (action === "import") {
    showKmlUnavailable();
  } else if (action === "export") {
    showKmlUnavailable();
  } else if (action === "add") {
    startCreateGardenEntity();
  } else if (action === "center-map") {
    centerGardenMap();
  } else if (action === "center-selected") {
    centerGardenEntity(state.selectedGardenEntityId);
  } else {
    els.gardenKmlMessage.textContent = `${event.currentTarget.textContent} sera disponible dans une prochaine passe.`;
  }
}

function duplicateSelectedGardenEntity() {
  const entity = getSelectedGardenEntity(getGardenEntities(state.status));

  if (!entity) {
    return;
  }

  state.selectedGardenEntityId = null;
  state.gardenDirty = true;
  state.gardenDetailTab = "info";
  setGardenFormValue("id", `${entity.id || "entite"}-copie`);
  setGardenFormValue("type", entity.type || "other");
  setGardenFormValue("name", `${entity.name || "Entité"} copie`);
  setGardenFormValue("tags", entity.tags?.join(", ") || "");
  setGardenFormValue("positionLabel", entity.position?.label || "");
  setGardenFormValue("notes", entity.notes || "");
  renderGardenEntityDetail(getGardenEntities(state.status));
  updateGardenFormState();
}

function startCreateGardenEntity() {
  state.selectedGardenEntityId = null;
  state.gardenDirty = true;
  state.gardenDetailTab = "info";
  els.gardenEntityForm.reset();
  els.gardenEntityForm.hidden = false;
  renderGardenWorkspace(getGardenEntities(state.status), state.status?.location);
}

function showKmlUnavailable() {
  els.gardenKmlMessage.textContent = "Import/export KML bientôt disponible après intégration du module et de l'API KML.";
}

function filterGardenEntities(entities) {
  const query = normalizeSearchText(state.gardenSearchQuery);
  const typeFilter = state.gardenTypeFilter || "all";

  return entities.filter((entity) => {
    const matchesQuery = !query || normalizeSearchText([
      entity.name,
      entity.type,
      formatGardenTypeLabel(entity.type),
      ...(entity.tags || [])
    ].join(" ")).includes(query);
    const matchesType = typeFilter === "all" || getGardenTypeFilterKey(entity) === typeFilter;

    return matchesQuery && matchesType;
  });
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getGardenTypeFilterKey(entity) {
  if (entity.type === "zone") {
    return "zones";
  }

  if (entity.type === "greenhouse") {
    return "greenhouse";
  }

  if (entity.type === "weather_station") {
    return "weather_station";
  }

  if (entity.type === "sensor") {
    return "sensor";
  }

  if (entity.type === "vegetable_bed") {
    return "vegetable_bed";
  }

  if (entity.type === "vine") {
    return "vine";
  }

  return "other";
}

function getGardenEntities(status) {
  return state.gardenState?.entities || status?.garden?.entities || [];
}

function getSelectedGardenEntity(entities) {
  return entities.find((entity) => entity.id === state.selectedGardenEntityId) || null;
}

function buildGardenWorkspaceStatus(entities) {
  if (state.gardenLoadError) {
    return state.gardenLoadError.message;
  }

  if (!entities.length) {
    return "Aucune entité jardin enregistrée.";
  }

  const count = entities.length;
  return `${count} ${count > 1 ? "entités" : "entité"} chargée${count > 1 ? "s" : ""}.`;
}

function formatGardenEntityMeta(entity) {
  const parts = [formatGardenTypeLabel(entity.type)];

  if (entity.tags?.length) {
    parts.push(entity.tags.join(", "));
  }

  if (entity.position?.label) {
    parts.push(entity.position.label);
  }

  parts.push(formatGardenGeometryLabel(entity));
  return parts.join(" - ");
}

function formatGardenPosition(entity) {
  if (entity.position?.label) {
    return entity.position.label;
  }

  if (Number.isFinite(entity.position?.latitude) && Number.isFinite(entity.position?.longitude)) {
    return `${formatCoord(entity.position.latitude)}, ${formatCoord(entity.position.longitude)}`;
  }

  if (entity.position?.geometry?.type) {
    return formatGardenGeometryLabel(entity);
  }

  return "Non renseignée";
}

function formatGardenEntityCount(count) {
  return `${count} ${count > 1 ? "entités" : "entité"}`;
}

function formatGardenTypeLabel(type) {
  return {
    vine: "Vigne",
    vegetable_bed: "Potager",
    zone: "Zone",
    plant: "Plante",
    tree: "Arbre",
    greenhouse: "Serre",
    sensor: "Capteur",
    weather_station: "Station météo",
    compost: "Compost",
    water_tank: "Réserve d'eau",
    other: "Autre"
  }[type] || "Autre";
}

function formatGardenGeometryLabel(entity) {
  const geometry = entity.position?.geometry;

  if (Number.isFinite(entity.position?.latitude) && Number.isFinite(entity.position?.longitude) || geometry?.type === "Point") {
    return "Point";
  }

  if (geometry?.type === "Polygon") {
    return "Zone";
  }

  if (geometry?.type === "LineString") {
    return "Ligne";
  }

  return "Sans position";
}

function getGardenVectorStyle(entity) {
  const color = getGardenEntityColor(entity);
  const selected = entity.id === state.selectedGardenEntityId;

  return {
    color,
    fillColor: color,
    fillOpacity: selected ? 0.42 : 0.24,
    opacity: 1,
    weight: selected ? 4 : 2
  };
}

function getGardenMarkerOptions(entity) {
  const color = getGardenEntityColor(entity);
  const selected = entity.id === state.selectedGardenEntityId;

  return {
    icon: window.L.divIcon({
      className: `garden-entity-marker${isLocalStationEntity(entity) ? " garden-station-marker" : ""}`,
      html: `<span aria-hidden="true" style="--garden-entity-color: ${color}"></span>`,
      iconSize: selected ? [32, 32] : [28, 28],
      iconAnchor: selected ? [16, 16] : [14, 14],
      popupAnchor: [0, -14]
    })
  };
}

function getGardenEntityColor(entity) {
  return GARDEN_ENTITY_COLORS[entity?.type] || GARDEN_ENTITY_COLORS.other;
}

function getGardenMapCenter(entities, location) {
  const firstPosition = entities.map((entity) => entity.position).find((position) => Number.isFinite(position?.latitude) && Number.isFinite(position?.longitude));

  if (firstPosition) {
    return [firstPosition.latitude, firstPosition.longitude];
  }

  const geometryPoint = entities.map((entity) => getFirstGeometryCoordinate(entity.position?.geometry)).find(Boolean);

  if (geometryPoint) {
    return geometryPoint;
  }

  if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
    return [Number(location.latitude), Number(location.longitude)];
  }

  return null;
}

function getFirstGeometryCoordinate(geometry) {
  if (geometry?.type === "Point") {
    return toLatLng(geometry.coordinates);
  }

  if (geometry?.type === "LineString") {
    return toLatLng(geometry.coordinates?.[0]);
  }

  if (geometry?.type === "Polygon") {
    return toLatLng(geometry.coordinates?.[0]?.[0]);
  }

  return null;
}

function getLayerBounds(layer) {
  if (layer.getBounds) {
    return layer.getBounds();
  }

  if (layer.getLatLng) {
    return window.L.latLngBounds([layer.getLatLng()]);
  }

  return null;
}

function toLatLng(coordinates) {
  return Array.isArray(coordinates) && coordinates.length >= 2
    ? [Number(coordinates[1]), Number(coordinates[0])]
    : null;
}

function isLocalStationEntity(entity) {
  return entity?.id === "station-locale" || entity?.type === "weather_station" && entity?.tags?.includes("ecowitt");
}

function hasGardenMapPosition(entity) {
  const geometry = entity?.position?.geometry;
  return Number.isFinite(entity?.position?.latitude) && Number.isFinite(entity?.position?.longitude)
    || geometry?.type === "Point"
    || geometry?.type === "LineString"
    || geometry?.type === "Polygon";
}

function getLocalStationObservation() {
  return state.status?.stationObservation || state.status?.observation?.station || state.ecowittDiagnostics?.current || null;
}

function getLocalStationSourceStatus() {
  return state.status?.sources?.find((source) => source.id === "ecowitt") || null;
}

function getLocalStationState() {
  const observation = getLocalStationObservation();
  const source = getLocalStationSourceStatus();

  if (observation?.state) {
    return observation.state;
  }

  if (source?.state) {
    return source.state;
  }

  if (state.ecowittLoadError) {
    return "unavailable";
  }

  return "unavailable";
}

function formatLocalStationStateLabel(entity) {
  if (!hasGardenMapPosition(entity)) {
    return "Sans position";
  }

  const stateLabel = getLocalStationState();

  if (stateLabel === "fresh") {
    return "Fraîche";
  }

  if (stateLabel === "stale") {
    return "Ancienne";
  }

  return "Indisponible";
}

function getLocalStationBadgeState(entity) {
  return hasGardenMapPosition(entity) ? getLocalStationState() : "no-position";
}

function buildGardenSensorsEmpty(entity) {
  const references = entity.sensorRefs || entity.sensors || [];

  if (references.length) {
    return `
      <div class="garden-sensor-summary">
        <h4>Capteurs associés</h4>
        <ul>${references.map((item) => `<li>${escapeHtml(item.name || item.id || item)}</li>`).join("")}</ul>
      </div>
    `;
  }

  return `
    <div class="garden-empty-state">
      <h4>Capteurs</h4>
      <p>Aucun capteur associé à cette entité.</p>
    </div>
  `;
}

function buildGardenAlertsDetail(entity) {
  const alerts = state.status?.garden?.alerts?.active || [];
  const relatedAlerts = alerts.filter((alert) => alert.entityId === entity.id);

  if (!relatedAlerts.length) {
    return `
      <div class="garden-empty-state">
        <h4>Alertes</h4>
        <p>Aucune alerte spécifique configurée.</p>
      </div>
    `;
  }

  return `
    <div class="garden-sensor-summary">
      <h4>Alertes</h4>
      <ul>${relatedAlerts.map((alert) => `<li>${escapeHtml(alert.headline || alert.type)}</li>`).join("")}</ul>
    </div>
  `;
}

function buildLocalStationPanel(entity) {
  const observation = getLocalStationObservation();
  const current = observation?.current || {};
  const stateLabel = formatLocalStationDataStateLabel();
  const historyWindow = state.ecowittDiagnostics?.history?.windows?.last24h || observation?.history?.windows?.last24h || null;
  const charts = buildLocalStationCharts(historyWindow);
  const historyMessage = getLocalStationHistoryMessage(historyWindow);
  const metrics = buildLocalStationMetricItems(current);

  return `
    <section class="garden-station-panel garden-sensor-summary" aria-label="Station météo locale">
      <div class="garden-station-heading">
        <strong>Station locale</strong>
        <span class="garden-mini-badge" data-state="${escapeHtml(getLocalStationBadgeState(entity))}">${escapeHtml(stateLabel)}</span>
      </div>
      ${metrics || `<p class="garden-state-note">Données station indisponibles.</p>`}
      <div class="garden-station-history">
        <h4>Historique Ecowitt</h4>
        ${charts || `<p class="garden-state-note">${escapeHtml(historyMessage)}</p>`}
      </div>
    </section>
  `;
}

function formatLocalStationDataStateLabel() {
  const stateLabel = getLocalStationState();

  if (stateLabel === "fresh") {
    return "Données fraîches";
  }

  if (stateLabel === "stale") {
    return "Données anciennes";
  }

  return "Indisponible";
}

function buildLocalStationMetricItems(current) {
  const items = [
    { label: "Température", value: formatTemperature(current.temperatureC), available: Number.isFinite(current.temperatureC) },
    { label: "Humidité", value: formatValue(current.humidityPct, "%"), available: Number.isFinite(current.humidityPct) },
    { label: "Vent", value: formatWind(current.windKmh), available: Number.isFinite(current.windKmh) },
    { label: "Rafales", value: formatWind(current.gustKmh), available: Number.isFinite(current.gustKmh) },
    { label: "Pluie", value: formatRainRate(current.rainRateMmPerHour), available: Number.isFinite(current.rainRateMmPerHour) },
    { label: "Pression", value: formatPressure(current.pressureHpa), available: Number.isFinite(current.pressureHpa) }
  ].filter((item) => item.available);

  if (!items.length) {
    return "";
  }

  return `
    <dl class="garden-station-metrics">
      ${items.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join("")}
    </dl>
  `;
}

function buildLocalStationCharts(historyWindow) {
  if (!historyWindow?.ok || !historyWindow.series) {
    return "";
  }

  const charts = [
    buildSparklineChart("Température 24 h", historyWindow.series.temperatureC, "°C", "line"),
    buildSparklineChart("Humidité 24 h", historyWindow.series.humidityPct, "%", "line"),
    buildSparklineChart("Pluie 24 h", historyWindow.series.rainMm, "mm", "bar"),
    buildSparklineChart("Vent 24 h", historyWindow.series.windKmh, "km/h", "line"),
    buildFirstChannelChart("Humidité sol", historyWindow.series.soilMoisture, "%"),
    buildFirstChannelChart("Leaf wetness", historyWindow.series.leafWetness, "%")
  ].filter(Boolean);

  return charts.length ? `<div class="garden-station-charts">${charts.join("")}</div>` : "";
}

function buildFirstChannelChart(title, channels, unit) {
  const channelKey = Object.keys(channels || {}).find((key) => hasUsableSeries(channels[key]));

  if (!channelKey) {
    return "";
  }

  return buildSparklineChart(`${title} ${channelKey}`, channels[channelKey], unit, "line");
}

function buildSparklineChart(title, series, unit, type = "line") {
  const values = normalizeChartSeries(series);

  if (!values.length) {
    return "";
  }

  const numericValues = values.map((point) => point.value).filter(Number.isFinite);
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const latest = numericValues[numericValues.length - 1];
  const svg = type === "bar" ? renderBarChart(values, min, max) : renderLineChart(values, min, max);

  return `
    <article class="garden-station-chart">
      <div class="garden-chart-header">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(formatValue(latest, unit))}</span>
      </div>
      ${svg}
    </article>
  `;
}

function normalizeChartSeries(series) {
  return (Array.isArray(series) ? series : [])
    .map((point, index) => ({
      index,
      time: point?.time || null,
      value: Number(point?.value)
    }))
    .filter((point) => Number.isFinite(point.value));
}

function hasUsableSeries(series) {
  return normalizeChartSeries(series).length > 0;
}

function renderLineChart(values, min, max) {
  const points = values.map((point, index) => `${chartX(index, values.length)},${chartY(point.value, min, max)}`).join(" ");
  return `
    <svg class="garden-chart-svg" viewBox="0 0 120 42" role="img" aria-label="Graphique simple">
      <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function renderBarChart(values, min, max) {
  const width = Math.max(2, 96 / values.length);
  const bars = values.map((point, index) => {
    const height = Math.max(1, 38 - chartY(point.value, min, max));
    return `<rect x="${chartX(index, values.length) - width / 2}" y="${40 - height}" width="${width}" height="${height}" rx="1"></rect>`;
  }).join("");

  return `
    <svg class="garden-chart-svg garden-chart-bars" viewBox="0 0 120 42" role="img" aria-label="Graphique pluie simple">
      ${bars}
    </svg>
  `;
}

function chartX(index, length) {
  return length <= 1 ? 60 : 10 + index * (100 / (length - 1));
}

function chartY(value, min, max) {
  if (max === min) {
    return 21;
  }

  return 38 - ((value - min) / (max - min)) * 34;
}

function getLocalStationHistoryMessage(historyWindow) {
  if (state.ecowittLoadError) {
    return "Historique Ecowitt non chargé.";
  }

  if (!state.ecowittDiagnostics) {
    return "Ecowitt non configuré ou indisponible.";
  }

  if (!historyWindow) {
    return "Historique 24 h absent.";
  }

  if (!historyWindow.ok) {
    return historyWindow.message || "Historique 24 h indisponible.";
  }

  return "Aucune série exploitable dans l'historique 24 h.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
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
    const headline = document.createElement("strong");
    const details = document.createElement("span");
    headline.textContent = alert.entityId ? `${alert.headline || alert.type} · ${alert.entityId}` : alert.headline || alert.type;
    details.textContent = (alert.details || []).join(" · ");
    item.dataset.level = alert.level;
    item.append(headline, details);
    els.gardenAlertsList.append(item);
  });
}

function renderRadar(radar, location) {
  const rainViewer = radar?.rainViewer;
  const meteoFrance = radar?.meteoFrance;
  const nativeLayer = meteoFrance?.nativeLayer?.ok ? meteoFrance.nativeLayer : null;
  const tileUrlTemplate = nativeLayer ? null : getRainViewerTileUrl(rainViewer);

  if (nativeLayer) {
    els.radarStatus.textContent = `${uiText("@{%Radar Météo-France natif affiché%}")}${meteoFrance.validityTime ? ` · ${uiText("@{%donnée radar du%}")} ${formatDate(meteoFrance.validityTime)}` : ""}.`;
  } else if (rainViewer?.ok) {
    els.radarStatus.textContent = buildRainViewerFallbackText(meteoFrance, rainViewer);
  } else if (meteoFrance?.ok) {
    els.radarStatus.textContent = `${uiText("@{%Radar Météo-France disponible, mais couche native non exploitable%}")}${meteoFrance.diagnostics?.fallbackReason ? ` · ${meteoFrance.diagnostics.fallbackReason}` : ""}.`;
  } else {
    els.radarStatus.textContent = uiText("@{%Aucun radar disponible pour le moment.%}");
  }

  renderRadarMap(location, { nativeLayer, rainViewerTileUrl: tileUrlTemplate });

  els.radarLegend.hidden = !nativeLayer && !tileUrlTemplate;
  els.radarAttribution.textContent = nativeLayer ? uiText("@{%Météo-France · OpenStreetMap%}") : (tileUrlTemplate ? "RainViewer · OpenStreetMap" : "");
}

function renderRadarMap(location, { nativeLayer, rainViewerTileUrl }) {
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
  updateNativeRadarLayer(nativeLayer);
  updateRainLayer(rainViewerTileUrl);

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

function updateNativeRadarLayer(nativeLayer) {
  if (state.radarNativeLayer) {
    state.radarMap.removeLayer(state.radarNativeLayer);
    state.radarNativeLayer = null;
  }

  if (!nativeLayer?.imageDataUrl || !Array.isArray(nativeLayer.bounds) || nativeLayer.bounds.length !== 2) {
    return;
  }

  state.radarNativeLayer = window.L.imageOverlay(nativeLayer.imageDataUrl, nativeLayer.bounds, {
    opacity: 0.68,
    zIndex: 20,
    attribution: uiText("@{%Météo-France%}")
  }).addTo(state.radarMap);
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

function renderSettings(settings) {
  setFieldValue("unitSystem", normalizeUnitSystem(settings.unitSystem));
  setFieldValue("rainThresholdMm", settings.rainThresholdMm);
  setFieldValue("rainAlertMinutes", settings.rainAlertMinutes);
  setFieldValue("minConfidence", settings.minConfidence);
  setFieldValue("quietMinutes", settings.quietMinutes);
  setFieldChecked("enableRainAlerts", settings.enableRainAlerts);
  setFieldChecked("enableGardenAlerts", settings.enableGardenAlerts);
  setFieldChecked("enableNtfy", settings.enableNtfy);
  setFieldValue("frostWatchTempC", settings.frostWatchTempC);
  setFieldValue("windGustRiskKmh", settings.windGustRiskKmh);
  setFieldValue("heavyRain2hMm", settings.heavyRain2hMm);
  setFieldValue("diseaseHumidityPct", settings.diseaseHumidityPct);
}

function renderDebugLinks() {
  els.publicJsonLink.href = "/api/public-status";
  els.debugStatusLink.href = "/api/debug/status";
  els.debugSourcesLink.href = "/api/debug/sources";
  els.debugEcowittLink.href = "/api/debug/ecowitt";
  els.debugRainLink.href = "/api/debug/rain";
}

function activatePanel(name) {
  document.body.dataset.activePanel = name;

  els.navButtons.forEach((button) => {
    button.dataset.active = String(button.dataset.panelTarget === name);
  });
  els.panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });

  if (name === "diagnostic") {
    loadDebugJson("/api/debug/status");
  }

  if (name === "garden" && state.gardenMap) {
    window.setTimeout(() => state.gardenMap.invalidateSize(), 0);
  }
}

function setFieldValue(name, value) {
  if (els.settingsForm?.[name] && value !== undefined && value !== null) {
    els.settingsForm[name].value = value;
  }
}

function setFieldChecked(name, value) {
  if (els.settingsForm?.[name]) {
    els.settingsForm[name].checked = !!value;
  }
}

function buildRainViewerFallbackText(meteoFrance, rainViewer) {
  const frameTime = formatDate(rainViewer.frameTime || rainViewer.generatedAt);

  if (!meteoFrance?.ok) {
    return `${uiText("@{%Fallback RainViewer affiché%}")} · ${uiText("@{%image radar du%}")} ${frameTime}`;
  }

  const reason = meteoFrance.diagnostics?.fallbackReason || meteoFrance.nativeLayer?.reason || meteoFrance.message;
  return `${uiText("@{%Fallback RainViewer affiché%}")} · ${reason} · ${uiText("@{%image radar du%}")} ${frameTime}`;
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

function updateRefreshCountdown() {
  if (state.isLoading) {
    return;
  }

  if (!state.nextRefreshAt) {
    els.refreshStatus.textContent = "Mise à jour automatique.";
    return;
  }

  const remainingMs = Math.max(0, state.nextRefreshAt - Date.now());
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  els.refreshStatus.textContent = `Prochaine mise à jour dans ${formatCountdown(remainingSeconds)}.`;
}

function formatTemperature(valueC) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertCelsiusToFahrenheit(valueC), "°F");
  }

  return formatValue(valueC, "°C");
}

function formatWind(valueKmh) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertKmhToMph(valueKmh), "mph");
  }

  return formatValue(valueKmh, "km/h");
}

function formatPressure(valueHpa) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertHpaToInHg(valueHpa), "inHg", 2);
  }

  return formatValue(valueHpa, "hPa");
}

function formatRain(valueMm) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertMmToInches(valueMm), "in", 2);
  }

  return formatValue(valueMm, "mm");
}

function formatRainRate(valueMmPerHour) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertMmToInches(valueMmPerHour), "in/h", 2);
  }

  return formatValue(valueMmPerHour, "mm/h");
}

function normalizeUnitSystem(value) {
  return value === "imperial" ? "imperial" : "metric";
}

function convertCelsiusToFahrenheit(value) {
  return Number.isFinite(value) ? value * 9 / 5 + 32 : null;
}

function convertKmhToMph(value) {
  return Number.isFinite(value) ? value / 1.609344 : null;
}

function convertHpaToInHg(value) {
  return Number.isFinite(value) ? value / 33.8638866667 : null;
}

function convertMmToInches(value) {
  return Number.isFinite(value) ? value / 25.4 : null;
}

function formatValue(value, unit, digits = 1) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const factor = 10 ** digits;
  const suffix = unit ? ` ${unit}` : "";
  return `${Math.round(value * factor) / factor}${suffix}`;
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

function formatCountdown(seconds) {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds ? `${minutes} min ${remainingSeconds} s` : `${minutes} min`;
  }

  return `${seconds} s`;
}

function formatCoord(value) {
  return Number(value).toFixed(6);
}
