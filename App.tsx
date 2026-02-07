import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';

import HomeScreen from './screens/HomeScreen';
import RecordScreen from './screens/RecordScreen';
import ProfileScreen from './screens/ProfileScreen';
import LandingScreen from './screens/LandingScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import ActivityDetailsScreen from './screens/ActivityDetailsScreen';
import SearchScreen from './screens/SearchScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import FriendsScreen from './screens/FriendsScreen';
import FeedScreen from './screens/FeedScreen';
import { supabase } from './lib/supabase';
import { AuthService, handleAuthCallbackUrl } from './services/AuthService';
import { AnalyticsService } from './services/AnalyticsService';
import { AuthContext } from './contexts/AuthContext';

const Stack = createNativeStackNavigator();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed:', error, errorInfo);
    this.setState({ errorInfo: errorInfo.componentStack || '' });
    AnalyticsService.trackCrash(error, errorInfo.componentStack || undefined);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>App Crashed</Text>
          <ScrollView style={errorStyles.scroll}>
            <Text style={errorStyles.errorName}>{this.state.error?.name}</Text>
            <Text style={errorStyles.errorMessage}>{this.state.error?.message}</Text>
            <Text style={errorStyles.errorStack}>{this.state.error?.stack}</Text>
            <Text style={errorStyles.componentStack}>{this.state.errorInfo}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0000', padding: 20, paddingTop: 60 },
  title: { color: '#ff4444', fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  scroll: { flex: 1 },
  errorName: { color: '#ff8888', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  errorMessage: { color: '#ffaaaa', fontSize: 16, marginBottom: 16 },
  errorStack: { color: '#888', fontSize: 12, fontFamily: 'monospace', marginBottom: 16 },
  componentStack: { color: '#666', fontSize: 10, fontFamily: 'monospace' },
});

function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [suggestedUsername, setSuggestedUsername] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  const refreshAuthState = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthenticated(true);
        const meta = session.user?.user_metadata;
        setSuggestedUsername(meta?.name || meta?.full_name || session.user?.email?.split('@')[0] || '');
        setUserAvatarUrl(meta?.avatar_url || null);
        const profile = await AuthService.getCurrentProfile();
        setHasProfile(!!profile?.username);
      } else {
        setIsAuthenticated(false);
        setHasProfile(false);
        setSuggestedUsername('');
        setUserAvatarUrl(null);
      }
    } catch (err) {
      console.error('Auth check error:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && initialUrl.includes('access_token')) {
        console.log('App opened via auth deep link:', initialUrl);
        await handleAuthCallbackUrl(initialUrl);
      }

      await refreshAuthState();
      setIsLoading(false);
    };
    init();

    const linkingSub = Linking.addEventListener('url', async (event) => {
      console.log('Deep link received:', event.url);
      if (event.url.includes('access_token') || event.url.includes('error')) {
        await handleAuthCallbackUrl(event.url);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      if (session) {
        const meta = session.user?.user_metadata;
        setSuggestedUsername(meta?.name || meta?.full_name || session.user?.email?.split('@')[0] || '');
        setUserAvatarUrl(meta?.avatar_url || null);
        const profile = await AuthService.getCurrentProfile();
        setHasProfile(!!profile?.username);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setHasProfile(false);
        setSuggestedUsername('');
        setUserAvatarUrl(null);
      }
    });

    return () => {
      linkingSub.remove();
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#E65100" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ setHasProfile, refreshAuthState, suggestedUsername, userAvatarUrl }}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#FFFFFF' },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Landing" component={LandingScreen} />
        ) : !hasProfile ? (
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Record" component={RecordScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Friends" component={FriendsScreen} />
            <Stack.Screen name="Feed" component={FeedScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            <Stack.Screen name="ActivityDetails" component={ActivityDetailsScreen} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          </>
        )}
      </Stack.Navigator>
    </AuthContext.Provider>
  );
}

export default function App() {
  console.log('APP STARTING');

  useEffect(() => {
    AnalyticsService.startSession();
    return () => { AnalyticsService.endSession(); };
  }, []);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        if (!Updates.isEnabled) return;
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          console.log('Update available, downloading...');
          await Updates.fetchUpdateAsync();
          console.log('Update downloaded, reloading...');
          await Updates.reloadAsync();
        }
      } catch (err) {
        console.log('Update check failed:', err);
      }
    }
    checkForUpdates();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
