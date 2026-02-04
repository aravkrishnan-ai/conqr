import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';

import GameScreen from './screens/GameScreen';
import ProfileScreen from './screens/ProfileScreen';
import LandingScreen from './screens/LandingScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import { supabase } from './lib/supabase';
import { AuthService, handleAuthCallbackUrl } from './services/AuthService';
import { AuthContext } from './contexts/AuthContext';

const Stack = createNativeStackNavigator();

// Error Boundary to catch crashes
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
      // Check if app was opened via an auth callback deep link
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && initialUrl.includes('access_token')) {
        console.log('App opened via auth deep link:', initialUrl);
        await handleAuthCallbackUrl(initialUrl);
      }

      await refreshAuthState();
      setIsLoading(false);
    };
    init();

    // Listen for incoming deep links (handles auth callbacks when app is already running)
    const linkingSub = Linking.addEventListener('url', async (event) => {
      console.log('Deep link received:', event.url);
      if (event.url.includes('access_token') || event.url.includes('error')) {
        await handleAuthCallbackUrl(event.url);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
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
    });

    return () => {
      linkingSub.remove();
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#22d3ee" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ setHasProfile, refreshAuthState, suggestedUsername, userAvatarUrl }}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Landing" component={LandingScreen} />
        ) : !hasProfile ? (
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        ) : (
          <>
            <Stack.Screen name="Game" component={GameScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </>
        )}
      </Stack.Navigator>
    </AuthContext.Provider>
  );
}

export default function App() {
  console.log('APP STARTING');

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
