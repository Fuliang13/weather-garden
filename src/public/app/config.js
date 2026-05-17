export const AUTO_REFRESH_MS = 5 * 60 * 1000;
export const RADAR_RADIUS_STEPS_KM = [10, 20, 40, 60, 80, 100, 120, 160];

export const GARDEN_ENTITY_COLORS = {
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

export const FORECAST_EXTERNAL_SOURCE_ORDER = ["arome", "metNorway"];

export const FORECAST_SOURCE_LABELS = {
  arome: "AROME",
  metNorway: "MET Norway",
  wgf: "WGF"
};

export const WEATHER_ICON_FILES = {
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

export const SOURCE_DISPLAY_ORDER = new Map([
  ["ecowitt", 10],
  ["station-locale", 10],
  ["open-meteo-arome", 20],
  ["met-norway", 30],
  ["meteofrance-radar", 40],
  ["rainviewer", 50]
]);

export const SOURCE_DISPLAY_LABELS = {
  ecowitt: "Station locale",
  "station-locale": "Station locale",
  "open-meteo-arome": "Prévision AROME",
  "met-norway": "MET Norway",
  "meteofrance-radar": "Radar Météo-France",
  rainviewer: "RainViewer"
};

export const MAP_BASE_LAYER_DEFINITIONS = {
  osm: {
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap"
    }
  },
  "ign-plan": {
    label: "IGN Plan V2",
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    options: {
      maxNativeZoom: 19,
      maxZoom: 22,
      attribution: "&copy; IGN · Géoplateforme"
    }
  },
  "ign-ortho": {
    label: "IGN Orthophotos",
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    options: {
      maxNativeZoom: 19,
      maxZoom: 22,
      attribution: "&copy; IGN · Géoplateforme"
    }
  }
};

export const GARDEN_CADASTRE_LAYER_DEFINITION = {
  label: "Cadastre IGN",
  url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  options: {
    maxNativeZoom: 19,
    maxZoom: 22,
    opacity: 0.72,
    zIndex: 30,
    attribution: "&copy; IGN · Cadastre"
  }
};

export const RADAR_SOURCE_LABELS = {
  wgr: "WGR",
  meteofrance: "MF",
  rainviewer: "RV"
};
