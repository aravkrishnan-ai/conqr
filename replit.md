# CONQR - Territory Conquest Mobile App

## Overview
CONQR is a mobile app (Android/iOS) where users claim real-world territory by running, walking, or cycling. Users trace GPS paths to "conquer" areas on a map.

## Project Architecture

### Tech Stack
- **Framework**: React Native with Expo SDK 54
- **Navigation**: React Navigation (native stack)
- **Backend**: Supabase (auth, database)
- **Maps**: MapLibre React Native (native), Leaflet (web fallback)
- **Local Storage**: AsyncStorage (for offline-first data)

### Key Files Structure
```
/
├── App.tsx                    # Main app entry, navigation setup
├── contexts/
│   └── AuthContext.tsx        # Auth context (extracted to avoid require cycles)
├── screens/
│   ├── LandingScreen.tsx      # Login screen with Google OAuth
│   ├── ProfileSetupScreen.tsx # Initial profile setup
│   ├── GameScreen.tsx         # Main game map view
│   └── ProfileScreen.tsx      # User profile
├── services/
│   ├── AuthService.ts         # Authentication handling
│   ├── GameEngine.ts          # Territory calculation logic
│   ├── LocationService.ts     # GPS tracking
│   ├── TerritoryService.ts    # Save/load territories (Supabase + local)
│   └── WakeLockService.ts     # Keep screen awake during tracking
├── components/
│   ├── MapContainer.tsx       # Native map component
│   └── MapContainer.web.tsx   # Web fallback map
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

## Recent Changes (January 2026)
- **Fixed require cycle**: Extracted AuthContext to separate file to prevent App.tsx <-> ProfileSetupScreen.tsx cycle
- **Added territory persistence**: Territories now save to Supabase and sync across devices
- **Display total conquered area**: Game screen now shows cumulative conquered territory

## Building APK
```bash
EXPO_TOKEN=$EXPO_TOKEN eas build -p android --profile development --non-interactive
```

Build profiles in `eas.json`:
- `development` - Development build with dev client
- `preview` - Internal distribution APK
- `production` - Production build

## User Preferences
- Dark theme throughout
- Cyan (#22d3ee) as primary accent color
- Offline-first data persistence
