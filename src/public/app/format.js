import { state } from "./state.js";

export function formatRainEta(minutes) {
  if (!Number.isFinite(minutes)) {
    return "";
  }

  const rounded = Math.max(0, Math.round(minutes));

  if (rounded <= 120) {
    return `dans ${rounded} min`;
  }

  return `vers ${formatTimeFromNow(rounded)}`;
}

export function formatTimeFromNow(minutes) {
  const etaDate = new Date(Date.now() + minutes * 60_000);
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: minutes % 60 ? "2-digit" : undefined
  }).format(etaDate).replace(":", "h");
}

export function formatTemperature(valueC) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertCelsiusToFahrenheit(valueC), "°F");
  }

  return formatValue(valueC, "°C");
}

export function formatWind(valueKmh) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertKmhToMph(valueKmh), "mph");
  }

  return formatValue(valueKmh, "km/h");
}

export function formatPressure(valueHpa) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertHpaToInHg(valueHpa), "inHg", 2);
  }

  return formatValue(valueHpa, "hPa");
}

export function formatRain(valueMm) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertMmToInches(valueMm), "in", 2);
  }

  return formatValue(valueMm, "mm");
}

export function formatRainRate(valueMmPerHour) {
  if (state.unitSystem === "imperial") {
    return formatValue(convertMmToInches(valueMmPerHour), "in/h", 2);
  }

  return formatValue(valueMmPerHour, "mm/h");
}

export function normalizeUnitSystem(value) {
  return value === "imperial" ? "imperial" : "metric";
}

export function convertCelsiusToFahrenheit(value) {
  return Number.isFinite(value) ? value * 9 / 5 + 32 : null;
}

export function convertKmhToMph(value) {
  return Number.isFinite(value) ? value / 1.609344 : null;
}

export function convertHpaToInHg(value) {
  return Number.isFinite(value) ? value / 33.8638866667 : null;
}

export function convertMmToInches(value) {
  return Number.isFinite(value) ? value / 25.4 : null;
}

export function formatValue(value, unit, digits = 1) {
  if (!Number.isFinite(value)) {
    return "?";
  }

  const factor = 10 ** digits;
  const suffix = unit ? ` ${unit}` : "";
  return `${Math.round(value * factor) / factor}${suffix}`;
}

export function formatDate(value) {
  if (!value) {
    return "?";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatHorizonLabel(minutes) {
  const rounded = Math.max(0, Math.round(minutes));

  if (!Number.isFinite(rounded)) {
    return "";
  }

  return rounded > 120 ? `vers ${formatTimeFromNow(rounded)}` : `a ${rounded} min`;
}

export function formatHumanDuration(minutes) {
  const rounded = Math.max(0, Math.round(minutes));

  if (!Number.isFinite(rounded)) {
    return "?";
  }

  if (rounded > 120) {
    return formatTimeFromNow(rounded);
  }

  return formatDuration(rounded);
}

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) {
    return "?";
  }

  const rounded = Math.max(0, Math.round(minutes));

  if (rounded >= 1440) {
    const days = Math.floor(rounded / 1440);
    const remainingHours = Math.floor((rounded % 1440) / 60);
    const dayText = `${days} jour${days > 1 ? "s" : ""}`;
    return remainingHours ? `${dayText} ${remainingHours} h` : dayText;
  }

  if (rounded >= 60) {
    const hours = Math.floor(rounded / 60);
    const remainingMinutes = rounded % 60;
    return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  }

  return `${rounded} min`;
}

export function formatCountdown(seconds) {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds ? `${minutes} min ${remainingSeconds} s` : `${minutes} min`;
  }

  return `${seconds} s`;
}

export function formatCoord(value) {
  return Number(value).toFixed(6);
}
