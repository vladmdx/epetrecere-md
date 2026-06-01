// Dynamic Expo config: extends app.json to inject secrets at build time WITHOUT
// committing them to the (public) repo.
//   - Google Maps API key  -> EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (EAS env var / .env)
//   - google-services.json -> GOOGLE_SERVICES_JSON (EAS file env var) || local ./google-services.json
// app.json stays the single source of truth for everything else.
const { expo } = require("./app.json");

module.exports = () => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  return {
    ...expo,
    ios: {
      ...expo.ios,
      config: {
        ...(expo.ios?.config || {}),
        ...(mapsKey ? { googleMapsApiKey: mapsKey } : {}),
      },
    },
    android: {
      ...expo.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      config: {
        ...(expo.android?.config || {}),
        ...(mapsKey ? { googleMaps: { apiKey: mapsKey } } : {}),
      },
    },
  };
};
