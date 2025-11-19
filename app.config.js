require('dotenv').config({ path: '.env.local' });

module.exports = {
  expo: {
    name: "VibeCheck Travel",
    slug: "vibetravelapp",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    experiments: {
      tsconfigPaths: true
    },
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#020617"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.vibecheck.travel",
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "VibeCheck needs your location to find the best spots around you."
      },
      config: {
        googleMapsApiKey: process.env.GEMINI_API_KEY
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#020617"
      },
      package: "com.vibecheck.travel",
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ],
      config: {
        googleMaps: {
          apiKey: process.env.GEMINI_API_KEY
        }
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY
    },
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "VibeCheck needs your location to find the best spots around you."
        }
      ]
    ]
  }
};
