import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MapContainer, { MapContainerHandle } from '../components/MapContainer';
import BottomTabBar from '../components/BottomTabBar';
import { Territory, GPSPoint } from '../lib/types';
import { TerritoryService } from '../services/TerritoryService';
import { LocationService } from '../services/LocationService';
import { supabase } from '../lib/supabase';

interface HomeScreenProps {
  navigation: any;
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [location, setLocation] = React.useState<GPSPoint | null>(null);
  const [territories, setTerritories] = React.useState<Territory[]>([]);
  const mapRef = React.useRef<MapContainerHandle>(null);

  React.useEffect(() => {
    const loadTerritories = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const userTerritories = await TerritoryService.getUserTerritories(session.user.id);
          setTerritories(userTerritories);
        }
      } catch (err) {
        console.error('Failed to load territories:', err);
      }
    };
    loadTerritories();
  }, []);

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

  const handleTabPress = (tab: 'home' | 'record' | 'profile') => {
    if (tab === 'record') {
      navigation.navigate('Record');
    } else if (tab === 'profile') {
      navigation.navigate('Profile');
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
