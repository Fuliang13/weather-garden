const AUTO_REFRESH_MS = 5 * 60 * 1000;

const state = {
  status: null,
  gardenState: null,
  gardenLoadError: null,
  selectedGardenEntityId: null,
  gardenDirty: false,
  gardenMap: null,
  gardenBaseLayer: null,
  gardenLayers: null,
  gardenLayerById: new Map(),
  radarMap: null,
  radarBaseLayer: null,
  radarRainLayer: null,
  radarNativeLayer: null,
  radarMarker: null,
  refreshTimer: null,
  countdownTimer: null,
  nextRefreshAt: null,
  isLoading: false
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
  gardenCard: document.querySelector("#gardenCard"),
  gardenBadge: document.querySelector("#gardenBadge"),
  gardenSummary: document.querySelector("#gardenSummary"),
  gardenDetails: document.querySelector("#gardenDetails"),
  gardenWorkspaceStatus: document.querySelector("#gardenWorkspaceStatus"),
  gardenKmlMessage: document.querySelector("#gardenKmlMessage"),
  gardenMap: document.querySelector("#gardenMap"),
  gardenMapMessage: document.querySelector("#gardenMapMessage"),
  gardenEntitiesCount: document.querySelector("#gardenEntitiesCount"),
  gardenEntitiesList: document.querySelector("#gardenEntitiesList"),
  gardenEntityDetail: document.querySelector("#gardenEntityDetail"),
  gardenEntityForm: document.querySelector("#gardenEntityForm"),
  gardenFormState: document.querySelector("#gardenFormState"),
  gardenEntityMessage: document.querySelector("#gardenEntityMessage"),
  resetGardenButton: document.querySelector("#resetGardenButton"),
  clearGardenFormButton: document.querySelector("#clearGardenFormButton"),
  deleteGardenEntityButton: document.querySelector("#deleteGardenEntityButton"),
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
els.deleteGardenEntityButton?.addEventListener("click", () => {
  if (state.selectedGardenEntityId) {
    deleteGardenEntity(state.selectedGardenEntityId);
  }
});
els.importKmlButton?.addEventListener("click", showKmlUnavailable);
els.exportKmlButton?.addEventListener("click", showKmlUnavailable);
els.debugRefreshButton?.addEventListener("click", () => loadDebugJson("/api/debug/status"));
els.ntfyTestButton?.addEventListener("click", sendTestNotification);

els.navButtons.forEach((button) => {
  button.addEventListener("click", () => activatePanel(button.dataset.panelTarget));
});

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
    state.gardenState = await fetchGardenState();
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

async function saveSettings(event) {
  event.preventDefault();
  const formData = new FormData(els.settingsForm);
  const settings = {
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

  const response = await fetch("/api/garden/entities", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(entity)
  });

  if (!response.ok) {
    els.gardenEntityMessage.textContent = "Erreur lors de l'enregistrement.";
    return;
  }

  const savedState = await response.json();
  const savedEntity = savedState.entities.find((item) => item.id === entity.id || item.name === entity.name) || entity;
  state.gardenState = savedState;
  state.selectedGardenEntityId = savedEntity.id;
  state.gardenDirty = false;
  fillGardenForm(savedEntity);
  els.gardenEntityMessage.textContent = "Entité enregistrée.";
  await loadStatus(true);
}

async function deleteGardenEntity(id) {
  const response = await fetch(`/api/garden/entities/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    els.gardenEntityMessage.textContent = "Suppression impossible.";
    return;
  }

  state.selectedGardenEntityId = null;
  state.gardenDirty = false;
  els.gardenEntityForm.reset();
  els.gardenEntityMessage.textContent = "Entité supprimée.";
  await loadStatus(true);
}

async function resetGarden() {
  const response = await fetch("/api/garden/reset", {
    method: "POST"
  });

  if (!response.ok) {
    els.gardenEntityMessage.textContent = "Réinitialisation impossible.";
    return;
  }

  state.selectedGardenEntityId = null;
  state.gardenDirty = false;
  els.gardenEntityForm.reset();
  els.gardenEntityMessage.textContent = "Jardin réinitialisé.";
  await loadStatus(true);
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
    { label: "Intensité", value: `${rain.intensityLabel} · ${formatValue(rain.intensityMmPerHour, "mm/h")}` },
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
  els.stationTemperature.textContent = formatValue(current.temperatureC, "°C");
  els.stationHumidity.textContent = formatValue(current.humidityPct, "%");
  els.stationWind.textContent = formatValue(current.windKmh, "km/h");
  els.stationGust.textContent = formatValue(current.gustKmh, "km/h");
  els.stationPressure.textContent = formatValue(current.pressureHpa, "hPa");
  els.stationRain.textContent = `${formatValue(current.rainRateMmPerHour, "mm/h")} · jour ${formatValue(current.dailyRainMm, "mm")}`;
  els.stationUv.textContent = `${formatValue(current.uvIndex, "")} · ${formatValue(current.solarWm2, "W/m²")}`;
}

function renderCurrentForecast(current) {
  els.currentSource.textContent = current?.sourceLabel || "Prévision immédiate · Open-Meteo AROME / MET Norway";
  els.temperature.textContent = formatValue(current?.temperatureC, "°C");
  els.humidity.textContent = formatValue(current?.humidityPct, "%");
  els.wind.textContent = formatValue(current?.windKmh, "km/h");
  els.gust.textContent = formatValue(current?.gustKmh, "km/h");
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

function renderGardenWorkspace(entities, location) {
  if (els.gardenEntitiesCount) {
    els.gardenEntitiesCount.textContent = String(entities.length);
  }

  if (els.gardenWorkspaceStatus) {
    els.gardenWorkspaceStatus.textContent = buildGardenWorkspaceStatus(entities);
  }

  renderGardenEntities(entities);
  renderGardenEntityDetail(entities);
  renderGardenMap(entities, location);
  updateGardenFormState();
}

function renderGardenEntities(entities) {
  els.gardenEntitiesList.innerHTML = "";
  renderGardenEntityRows(entities);
}

function renderGardenEntityRows(entities) {
  if (state.gardenLoadError) {
    appendGardenEmptyRow(state.gardenLoadError.message);
    return;
  }

  if (!entities.length) {
    appendGardenEmptyRow("Aucune entité jardin enregistrée.");
    return;
  }

  entities.forEach((entity) => {
    const item = document.createElement("li");
    const button = document.createElement("button");

    item.className = "garden-entity-row";
    item.dataset.selected = String(entity.id === state.selectedGardenEntityId);
    button.type = "button";
    button.className = "garden-entity-select";
    button.innerHTML = `
      <strong>${escapeHtml(entity.name)}</strong>
      <span>${escapeHtml(formatGardenEntityMeta(entity))}</span>
    `;
    button.addEventListener("click", () => selectGardenEntity(entity.id));

    item.append(button);
    els.gardenEntitiesList.append(item);
  });
}

function appendGardenEmptyRow(message) {
  const item = document.createElement("li");
  item.className = "empty-row";
  item.textContent = message;
  els.gardenEntitiesList.append(item);
}

function renderGardenEntityDetail(entities) {
  const selected = getSelectedGardenEntity(entities);

  if (!els.gardenEntityDetail) {
    return;
  }

  if (!selected) {
    els.gardenEntityDetail.innerHTML = `
      <p class="muted">${entities.length ? "Sélectionne une entité dans la liste ou sur la carte." : "Le jardin est vide pour le moment."}</p>
    `;
    els.deleteGardenEntityButton.disabled = true;
    return;
  }

  els.gardenEntityDetail.innerHTML = `
    <h3>${escapeHtml(selected.name)}</h3>
    <dl>
      <div><dt>Type</dt><dd>${escapeHtml(selected.type || "other")}</dd></div>
      <div><dt>Tags</dt><dd>${escapeHtml(selected.tags?.length ? selected.tags.join(", ") : "Aucun tag")}</dd></div>
      <div><dt>Position</dt><dd>${escapeHtml(formatGardenPosition(selected))}</dd></div>
      <div><dt>Notes</dt><dd>${escapeHtml(selected.notes || "Aucune note")}</dd></div>
    </dl>
  `;
  els.deleteGardenEntityButton.disabled = false;
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
    selectedLayer.setStyle({ weight: 4, color: "#1b4332" });
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

  if (geometry?.type === "Point") {
    return window.L.marker([geometry.coordinates[1], geometry.coordinates[0]]).bindPopup(entity.name);
  }

  if (geometry?.type === "LineString") {
    return window.L.polyline(geometry.coordinates.map(toLatLng), getGardenVectorStyle(entity)).bindPopup(entity.name);
  }

  if (geometry?.type === "Polygon") {
    return window.L.polygon(geometry.coordinates.map((ring) => ring.map(toLatLng)), getGardenVectorStyle(entity)).bindPopup(entity.name);
  }

  if (Number.isFinite(entity.position?.latitude) && Number.isFinite(entity.position?.longitude)) {
    return window.L.marker([entity.position.latitude, entity.position.longitude]).bindPopup(entity.name);
  }

  return null;
}

function selectGardenEntity(id) {
  const entities = getGardenEntities(state.status);
  const entity = entities.find((item) => item.id === id);

  if (!entity) {
    return;
  }

  state.selectedGardenEntityId = id;
  state.gardenDirty = false;
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
  els.gardenEntityForm.reset();
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

  if (state.gardenDirty) {
    els.gardenFormState.textContent = "Modifications non enregistrées.";
  } else if (state.selectedGardenEntityId) {
    els.gardenFormState.textContent = "Entité sélectionnée synchronisée avec la liste et la carte.";
  } else {
    els.gardenFormState.textContent = "Aucune modification en cours.";
  }
}

function showKmlUnavailable() {
  els.gardenKmlMessage.textContent = "Import/export KML bientôt disponible après intégration du module et de l'API KML.";
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
    return "Aucune entité GardenState enregistrée.";
  }

  const count = entities.length;
  return `${count} ${count > 1 ? "entités GardenState" : "entité GardenState"} chargée${count > 1 ? "s" : ""}.`;
}

function formatGardenEntityMeta(entity) {
  const parts = [entity.type || "other"];

  if (entity.tags?.length) {
    parts.push(entity.tags.join(", "));
  }

  if (entity.position?.label) {
    parts.push(entity.position.label);
  }

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
    return entity.position.geometry.type;
  }

  return "Non renseignée";
}

function getGardenVectorStyle(entity) {
  return {
    color: entity.id === state.selectedGardenEntityId ? "#1b4332" : "#2d6a4f",
    fillColor: "#74c69d",
    fillOpacity: 0.22,
    opacity: 0.9,
    weight: entity.id === state.selectedGardenEntityId ? 4 : 2
  };
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

function formatValue(value, unit) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const suffix = unit ? ` ${unit}` : "";
  return `${Math.round(value * 10) / 10}${suffix}`;
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
