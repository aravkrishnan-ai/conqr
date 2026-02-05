# CONQR - Territory Conquest Mobile App

## Overview
CONQR is a mobile app (Android/iOS) where users claim real-world territory by running, walking, or cycling. Users trace GPS paths to "conquer" areas on a map.

## Project Architecture

### Tech Stack
- **Framework**: React Native with Expo SDK 54
- **Navigation**: React Navigation (native stack with tab-style navigation)
- **Backend**: Supabase (auth, database)
- **Maps**: Leaflet via WebView (both native and web)
- **Local Storage**: AsyncStorage (for offline-first data)

### Key Files Structure
```
/
├── App.tsx                    # Main app entry, navigation setup
├── contexts/
│   └── AuthContext.tsx        # Auth context (extracted to avoid require cycles)
├── screens/
│   ├── LandingScreen.tsx      # Login screen with Google OAuth (dark theme)
│   ├── ProfileSetupScreen.tsx # Initial profile setup
│   ├── HomeScreen.tsx         # Map view showing territories
│   ├── RecordScreen.tsx       # Activity recording with stats
│   └── ProfileScreen.tsx      # User profile with dashboard
├── components/
│   ├── BottomTabBar.tsx       # Bottom navigation (home, record, profile)
│   ├── MapContainer.tsx       # Native map component
│   ├── MapContainer.web.tsx   # Web fallback map
│   └── GoogleSignInButton.tsx # Google OAuth button
├── services/
│   ├── AuthService.ts         # Authentication handling
│   ├── GameEngine.ts          # Territory calculation logic
│   ├── LocationService.ts     # GPS tracking
│   ├── TerritoryService.ts    # Save/load territories (Supabase + local)
│   ├── ActivityService.ts     # Activity recording/stats
│   └── WakeLockService.ts     # Keep screen awake during tracking
├── lib/
│   ├── supabase.ts            # Supabase client config
│   ├── db.ts                  # Local AsyncStorage wrapper
│   └── types.ts               # TypeScript interfaces
└── supabase/
    └── schema.sql             # Database schema
```

### Environment Variables
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `EXPO_TOKEN` - For EAS builds (secret)

## Recent Changes (February 2026)
- **Complete UI Revamp**: Redesigned based on Figma mockups
  - Landing screen: Dark background with italic "Conqr" branding
  - Home screen: Map view showing conquered territories
  - Record screen: Stats (distance, duration, pace) with "start run" button
  - Profile screen: User info, streak counter, dashboard with "your runs" and "statistics"
  - Bottom tab navigation: home, record (red circle), profile
- **New color scheme**: Orange (#E65100) primary, white backgrounds for main screens
- **Separated navigation**: HomeScreen (map view) and RecordScreen (activity tracking)

## Building Apps

### Android APK
```bash
EXPO_TOKEN=$EXPO_TOKEN eas build -p android --profile preview --non-interactive
```

### iOS Simulator
```bash
EXPO_TOKEN=$EXPO_TOKEN eas build -p ios --profile development --non-interactive
```

### iOS Device (requires Apple Developer credentials)
```bash
EXPO_TOKEN=$EXPO_TOKEN eas build -p ios --profile preview
```
Note: iOS device builds require an Apple Developer Program account ($99/year) and proper provisioning profiles.

Build profiles in `eas.json`:
- `development` - Development build (iOS: simulator only, Android: APK with dev client)
- `preview` - Internal distribution (iOS: ad-hoc, Android: APK)
- `production` - Production build for app stores

## User Preferences
- Light theme for main screens (Home, Record, Profile)
- Dark theme for Landing screen only
- Orange (#E65100) as primary accent color
- Offline-first data persistence
