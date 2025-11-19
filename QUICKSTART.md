# Quick Start Guide

## Get Started in 3 Steps

### 1. Set your API key
```bash
cd vibetravelapp
export GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Start the app
```bash
npx expo start
```

### 3. Open on your device
- **iOS**: Press `i` to open iOS Simulator (Mac only)
- **Android**: Press `a` to open Android Emulator
- **Phone**: Scan the QR code with Expo Go app

## Testing on Physical Device

1. Install Expo Go from App Store (iOS) or Play Store (Android)
2. Run `npx expo start`
3. Scan the QR code with:
   - **iOS**: Camera app
   - **Android**: Expo Go app

## First Run Checklist

- [ ] Node.js installed
- [ ] Dependencies installed (`npm install`)
- [ ] Gemini API key exported
- [ ] Location permissions granted on device
- [ ] Internet connection active

## Common Issues

**"API_KEY is not defined"**
- Make sure to export the GEMINI_API_KEY before running `npx expo start`
- Restart the Expo server after exporting

**Location not working**
- Grant location permission when prompted
- iOS Simulator: Features > Location > Custom Location

**Images not loading**
- Check internet connection
- App uses multiple image sources with fallbacks

## Production Build

To build a standalone app:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build for iOS or Android
eas build --platform ios
eas build --platform android
```

Remember to set your API key in EAS secrets:
```bash
eas secret:create --scope project --name GEMINI_API_KEY --value your_key
```
