import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import MapContainer, { MapContainerHandle } from '../components/MapContainer';
import BottomTabBar from '../components/BottomTabBar';
import { Territory, GPSPoint } from '../lib/types';
import { TerritoryService } from '../services/TerritoryService';
import { ActivityService } from '../services/ActivityService';
import { LocationService } from '../services/LocationService';
import { supabase } from '../lib/supabase';

interface HomeScreenProps {
  navigation: any;
  route?: {
    params?: {
      focusTerritoryLat?: number;
      focusTerritoryLng?: number;
    };
  };
}

export default function HomeScreen({ navigation, route }: HomeScreenProps) {
  const [location, setLocation] = React.useState<GPSPoint | null>(null);
  const [territories, setTerritories] = React.useState<Territory[]>([]);
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>(undefined);
  const mapRef = React.useRef<MapContainerHandle>(null);

  // Reload territories every time the screen comes into focus (including mount)
  // Also sync any pending activities in background to ensure data reaches the cloud
  useFocusEffect(
    React.useCallback(() => {
      // Sync pending activities in background so other users can see them
      ActivityService.syncPendingActivities().catch(err => {
        console.error('Failed to sync pending activities:', err);
      });

      const loadTerritories = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setCurrentUserId(session.user.id);
            // Fetch all territories to show everyone's claimed areas
            const allTerritories = await TerritoryService.getAllTerritories();
            setTerritories(allTerritories);
          }
        } catch (err) {
          console.error('Failed to load territories:', err);
        }
      };
      loadTerritories();
    }, [])
  );

  React.useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let mounted = true;

    const startLocation = async () => {
      try {
        unsubscribe = await LocationService.startTracking(
          (point) => {
            if (mounted) {
              setLocation(point);
            }
          },
          (error) => {
            console.error('Location error:', error);
          }
        );
      } catch (err) {
        console.error('Failed to start location:', err);
      }
    };

    startLocation();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Center map on territory when navigated with focus params
  const focusLat = route?.params?.focusTerritoryLat;
  const focusLng = route?.params?.focusTerritoryLng;
  const lastFocusRef = React.useRef<string>('');

  React.useEffect(() => {
    if (focusLat && focusLng) {
      const focusKey = `${focusLat},${focusLng}`;
      if (focusKey === lastFocusRef.current) return;
      lastFocusRef.current = focusKey;
      // Small delay to ensure map is ready
      const timer = setTimeout(() => {
        mapRef.current?.centerOnLocation(focusLat, focusLng, 17);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [focusLat, focusLng]);

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'search' | 'leaderboard') => {
    if (tab === 'record') {
      navigation.navigate('Record');
    } else if (tab === 'profile') {
      navigation.navigate('Profile');
    } else if (tab === 'search') {
      navigation.navigate('Search');
    } else if (tab === 'leaderboard') {
      navigation.navigate('Leaderboard');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.mapContainer}>
          <MapContainer
            ref={mapRef}
            location={location}
            path={[]}
            territories={territories}
            currentUserId={currentUserId}
            style={styles.map}
          />
        </View>
      </SafeAreaView>
      <BottomTabBar activeTab="home" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
});
