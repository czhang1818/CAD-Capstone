# VSMS Mobile App

This is the React Native mobile client for the Volunteer Shift Management System (VSMS). It is built using the [Expo](https://expo.dev/) Managed Workflow, allowing for cross-platform support without managing messy native Android/iOS project files.

## Project Structure
- `app/` - File-based routing (Expo Router). Contains tabs for Volunteer, Coordinator, and Admin views.
- `services/` - Data fetching layer, calling the centralized `/api` endpoints.
- `components/` - Global components (e.g., floating `<AIAssistant />`).
- `stores/` - Global state management with Zustand for authentication tokens and active user profile.

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Development Server**
   ```bash
   npx expo start
   ```
   *You can then press `a` to open the Android emulator, or scan the QR code with the Expo Go app on your physical device.*

---

## 🚀 Building a Release APK (Local Workflow)

Because this repository uses an Expo Managed Workflow, the `android` and `ios` folders are **not committed to Git** (ignored by `.gitignore` by default).

To generate a real `.apk` file for sideloading/testing without Expo Go, on a machine configured with the Android SDK (like Android Studio):

1. **Prebuild the Native Artifacts**
   This command reads `app.json` and dynamically generates a fresh, configured `android` folder.
   ```bash
   npx expo prebuild --clean
   ```

2. **Compile the Release Build via Gradle**
   Navigate into the freshly generated Android folder and compile the universal APK.
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

3. **Locate your APK**
   Once compilation finishes successfully, your generated installable APK file will be located precisely at:
   `android/app/build/outputs/apk/release/app-release.apk`
