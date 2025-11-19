# VibeCheck Travel - Expo Mobile App

A mobile recreation of the VibeTravel web app, built with Expo and React Native. Discover trending places around you using Gemini AI.

## Features

- 🗺️ Location-based recommendations powered by Gemini AI
- 📱 Native mobile experience for iOS and Android
- 🎨 Beautiful UI with animations and gradients
- 🖼️ Image carousel with multiple sources (Wikipedia, Gemini Search, AI-generated fallbacks)
- 📍 Interactive map integration
- ⭐ Reviews and ratings for each location
- 🔄 Refresh to get new recommendations

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac only) or Android Emulator
- Gemini API key from Google AI Studio

## Setup

1. **Install dependencies:**
   ```bash
   cd vibetravelapp
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```

3. **Export the environment variable:**
   ```bash
   export GEMINI_API_KEY=your_actual_api_key_here
   ```

## Development

### Run on iOS Simulator (Mac only)
```bash
npm run ios
```

### Run on Android Emulator
```bash
npm run android
```

### Run on Web
```bash
npm run web
```

### Run with Expo Go (recommended for testing)
```bash
npx expo start
```
Then scan the QR code with Expo Go app on your phone.

## Building for Production

### iOS
```bash
eas build --platform ios
```

### Android
```bash
eas build --platform android
```

### Prerequisites for EAS Build
1. Install EAS CLI: `npm install -g eas-cli`
2. Login: `eas login`
3. Configure project: `eas build:configure`
4. Set environment variables in EAS:
   ```bash
   eas secret:create --scope project --name GEMINI_API_KEY --value your_key_here
   ```

## Project Structure

```
vibetravelapp/
├── App.tsx                 # Main app component
├── types.ts               # TypeScript type definitions
├── services/
│   ├── gemini.ts         # Gemini AI service
│   └── wikipedia.ts      # Wikipedia image service
├── components/
│   ├── PlaceCard.tsx     # Place card component
│   ├── PlacePopup.tsx    # Detail modal
│   ├── CenterPiece.tsx   # Map component
│   └── LoadingScreen.tsx # Loading animation
└── app.json              # Expo configuration
```

## Key Differences from Web Version

- **Maps API**: Uses WebView for embedded maps instead of Google Maps JavaScript API
- **Styling**: Uses React Native StyleSheet instead of Tailwind CSS classes
- **Animations**: Uses React Native's Animated API instead of CSS transitions
- **Location**: Uses expo-location instead of browser geolocation API
- **Images**: Native Image component with proper error handling

## Environment Variables

The app requires a Gemini API key to function. The key should be:
1. Added to `.env` file (for local development)
2. Exported as environment variable before running the app
3. Added to EAS secrets for production builds

## Troubleshooting

### Location permissions not working
- Ensure you've granted location permissions in your device settings
- For iOS simulator: Features > Location > Custom Location
- For Android emulator: Extended controls > Location

### API key not found
- Make sure `GEMINI_API_KEY` is exported in your terminal session
- Restart the Expo development server after setting the variable
- Check that the key is correctly added to app.json's extra section

### Images not loading
- The app uses multiple fallback sources: Wikipedia, Gemini Search, and AI-generated
- If one source fails, it automatically tries the next
- Network connectivity is required for all image sources

## License

MIT
