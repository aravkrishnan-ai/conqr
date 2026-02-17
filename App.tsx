import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from './screens/HomeScreen';
import RecordScreen from './screens/RecordScreen';
import ProfileScreen from './screens/ProfileScreen';
import LandingScreen from './screens/LandingScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import ActivityDetailsScreen from './screens/ActivityDetailsScreen';
import SearchScreen from './screens/SearchScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './screens/TermsOfServiceScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import FriendsScreen from './screens/FriendsScreen';
import FeedScreen from './screens/FeedScreen';
import { supabase, clearInvalidSession } from './lib/supabase';
import { AuthService, handleAuthCallbackUrl } from './services/AuthService';
import { AnalyticsService } from './services/AnalyticsService';
import { AuthContext } from './contexts/AuthContext';
import { ToastContainer } from './components/Toast';

const TOS_ACCEPTED_KEY = 'conqr_tos_accepted_v1';

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

  handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <View style={errorStyles.iconCircle}>
            <Text style={errorStyles.iconText}>!</Text>
          </View>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            The app ran into an unexpected problem. Please try restarting.
          </Text>
          <View style={errorStyles.buttonRow}>
            <Text style={errorStyles.button} onPress={this.handleRestart}>
              Restart App
            </Text>
          </View>
          <Text style={errorStyles.supportText}>
            If this keeps happening, please contact support at conqrrunning@gmail.com
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A', padding: 32, justifyContent: 'center', alignItems: 'center' },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E65100', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  iconText: { color: '#FFFFFF', fontSize: 32, fontWeight: '700' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  message: { color: '#999999', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  buttonRow: { marginBottom: 24 },
  button: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', backgroundColor: '#E65100', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12, overflow: 'hidden', textAlign: 'center' },
  supportText: { color: '#666666', fontSize: 12, textAlign: 'center' },
});

function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasAcceptedTOS, setHasAcceptedTOS] = useState(false);
  const [suggestedUsername, setSuggestedUsername] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const initDoneRef = useRef(false);

  const refreshAuthState = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthenticated(true);
        const meta = session.user?.user_metadata;
        setSuggestedUsername(meta?.name || meta?.full_name || session.user?.email?.split('@')[0] || '');
        setUserAvatarUrl(meta?.avatar_url || null);
        let profile = await AuthService.getCurrentProfile();
        // Retry once — transient network failures at cold start are common
        if (!profile?.username) {
          await new Promise(r => setTimeout(r, 1000));
          profile = await AuthService.getCurrentProfile();
        }
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
      try {
        await clearInvalidSession();

        // Check TOS acceptance from local storage
        try {
          const tosAccepted = await AsyncStorage.getItem(TOS_ACCEPTED_KEY);
          setHasAcceptedTOS(tosAccepted === 'true');
        } catch { /* default to false */ }

        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes('access_token')) {
          console.log('App opened via auth deep link:', initialUrl);
          await handleAuthCallbackUrl(initialUrl);
        }

        await refreshAuthState();
      } catch (err) {
        console.error('App init error:', err);
      } finally {
        initDoneRef.current = true;
        setIsLoading(false);
      }
    };

    // Safety timeout — if init hangs (e.g. slow AsyncStorage on cold start),
    // stop the loading spinner after 10s so the app is still usable
    const timeout = setTimeout(() => {
      setIsLoading((current) => {
        if (current) console.warn('App init timed out, proceeding anyway');
        return false;
      });
    }, 10000);

    init().then(() => clearTimeout(timeout)).catch((err) => {
      console.error('App init error:', err);
      clearTimeout(timeout);
    });


    const linkingSub = Linking.addEventListener('url', async (event) => {
      if (event.url.includes('access_token') || event.url.includes('error')) {
        const success = await handleAuthCallbackUrl(event.url);
        if (success) {
          await refreshAuthState();
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // During init, refreshAuthState() handles the initial state — ignore events
      // to prevent races between the handler and init running concurrently
      if (!initDoneRef.current) return;

      // Only fully reset state on explicit sign-out
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setHasProfile(false);
        setSuggestedUsername('');
        setUserAvatarUrl(null);
        return;
      }

      if (session) {
        setIsAuthenticated(true);
        const meta = session.user?.user_metadata;
        setSuggestedUsername(meta?.name || meta?.full_name || session.user?.email?.split('@')[0] || '');
        setUserAvatarUrl(meta?.avatar_url || null);

        // Only re-check profile on actual sign-in, not token refreshes.
        // TOKEN_REFRESHED fires periodically — if the profile query fails
        // transiently during a refresh, we'd incorrectly show ProfileSetup.
        if (event === 'SIGNED_IN') {
          const profile = await AuthService.getCurrentProfile();
          setHasProfile(!!profile?.username);
        }
      }
    });

    return () => {
      linkingSub.remove();
      subscription.unsubscribe();
    };
  }, []);

  const handleAcceptTOS = async () => {
    try {
      await AsyncStorage.setItem(TOS_ACCEPTED_KEY, 'true');
    } catch { /* proceed anyway */ }
    setHasAcceptedTOS(true);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' }}>
        <Image
          source={require('./assets/conqr-logo.png')}
          style={{ width: 120, height: 120, marginBottom: 24 }}
          resizeMode="contain"
        />
        <ActivityIndicator size="small" color="#E65100" />
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
        ) : !hasAcceptedTOS ? (
          <Stack.Screen name="TermsOfService">
            {() => <TermsOfServiceScreen onAccept={handleAcceptTOS} />}
          </Stack.Screen>
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
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
          </>
        )}
      </Stack.Navigator>
    </AuthContext.Provider>
  );
}

export default function App() {

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
          console.log('Update downloaded, will apply on next launch');
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
        <StatusBar style="light" />
        <NavigationContainer>
          <AppNavigator />
          <ToastContainer />
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
