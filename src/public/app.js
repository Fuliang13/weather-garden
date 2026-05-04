const state = {
  status: null
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  location: document.querySelector("#location"),
  alertCard: document.querySelector("#alertCard"),
  rainSummary: document.querySelector("#rainSummary"),
  rainEta: document.querySelector("#rainEta"),
  temperature: document.querySelector("#temperature"),
  humidity: document.querySelector("#humidity"),
  wind: document.querySelector("#wind"),
  gust: document.querySelector("#gust"),
  horizons: document.querySelector("#horizons"),
  radarStatus: document.querySelector("#radarStatus"),
  radarImage: document.querySelector("#radarImage"),
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
  els.alertCard.dataset.level = status.rain.alertLevel;
  els.rainSummary.textContent = status.rain.alertLabel;
  els.rainEta.textContent = status.rain.etaMinutes === null
    ? "Aucune arrivée de pluie détectée dans les données immédiates."
    : `Arrivée estimée : ${status.rain.etaMinutes} min.`;

  els.temperature.textContent = formatValue(status.current.temperatureC, "°C");
  els.humidity.textContent = formatValue(status.current.humidityPct, "%");
  els.wind.textContent = formatValue(status.current.windKmh, "km/h");
  els.gust.textContent = formatValue(status.current.gustKmh, "km/h");

  renderHorizons(status.rain.horizons);
  renderRadar(status.radar);
  renderSources(status.sources);
  renderSettings(status.settings);
  els.updatedAt.textContent = `Dernière mise à jour : ${formatDate(status.updatedAt)}`;
}

function renderHorizons(horizons) {
  els.horizons.innerHTML = "";

  horizons.forEach((item) => {
    const row = document.createElement("div");
    row.className = "horizon-row";
    row.dataset.level = item.alertLevel;
    row.innerHTML = `
      <strong>${item.minutes} min</strong>
      <span>${Math.round(item.score * 100)} %</span>
      <span>${item.confidence}</span>
      <span>${formatValue(item.precipitationMm, "mm")}</span>
    `;
    els.horizons.append(row);
  });
}

function renderRadar(radar) {
  const rainViewer = radar?.rainViewer;
  const meteoFrance = radar?.meteoFrance;

  if (meteoFrance?.ok) {
    els.radarStatus.textContent = "Radar Météo-France actif.";
  } else if (rainViewer?.ok) {
    els.radarStatus.textContent = `Fallback RainViewer · image ${formatDate(rainViewer.frameTime || rainViewer.generatedAt)}`;
  } else {
    els.radarStatus.textContent = "Aucun radar disponible pour le moment.";
  }

  if (rainViewer?.imageUrl) {
    els.radarImage.src = rainViewer.imageUrl;
    els.radarImage.hidden = false;
    return;
  }

  els.radarImage.hidden = true;
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

function formatCoord(value) {
  return Number(value).toFixed(6);
}
