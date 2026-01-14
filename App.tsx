import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './lib/supabase';
import { AuthService } from './services/AuthService';
import LandingScreen from './screens/LandingScreen';
import GameScreen from './screens/GameScreen';
import ProfileScreen from './screens/ProfileScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import { Session } from '@supabase/supabase-js';

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSession = async (session: Session | null) => {
    setSession(session);
    if (session) {
      // Check if profile is complete
      try {
        const profile = await AuthService.getCurrentProfile();
        setOnboardingComplete(!!profile?.username);
      } catch (err) {
        console.error('Check profile error:', err);
        setOnboardingComplete(false);
      }
    }
    setLoading(false);
  };

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
        {!session ? (
          <Stack.Screen name="Landing" component={LandingScreen} />
        ) : !onboardingComplete ? (
          <Stack.Screen name="ProfileSetup">
            {(props) => <ProfileSetupScreen {...props} onComplete={() => setOnboardingComplete(true)} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Game" component={GameScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
