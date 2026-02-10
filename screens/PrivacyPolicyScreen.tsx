import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { WebView } from 'react-native-webview';

interface PrivacyPolicyScreenProps {
  navigation: any;
}

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.7;
            color: #333;
            background: #FFFFFF;
            padding: 20px 16px 60px;
        }
        h1 { font-size: 24px; color: #E65100; margin-bottom: 4px; }
        .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
        h2 { font-size: 18px; color: #1A1A1A; margin-top: 28px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #EEE; }
        h3 { font-size: 15px; color: #333; margin-top: 16px; margin-bottom: 6px; }
        p, li { font-size: 14px; color: #444; margin-bottom: 10px; }
        ul { padding-left: 20px; margin-bottom: 12px; }
        li { margin-bottom: 4px; }
        .highlight { background: #FFF3E0; border-left: 4px solid #E65100; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
        .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #DDD; text-align: center; color: #999; font-size: 12px; }
        a { color: #E65100; }
    </style>
</head>
<body>
    <h1>Conqr Privacy Policy</h1>
    <p class="subtitle">Last updated: February 8, 2026</p>

    <div class="highlight">
        <p><strong>Summary:</strong> Conqr collects your location data to let you claim territories, your profile info to identify you, and usage data to improve the app. We never sell your personal data to third parties.</p>
    </div>

    <h2>1. Introduction</h2>
    <p>Conqr ("we," "our," or "us") is a mobile application that allows users to claim real-world territory by walking, running, or cycling. This Privacy Policy explains how we collect, use, store, and protect your information when you use the Conqr app ("the App").</p>
    <p>By using Conqr, you agree to the collection and use of information as described in this policy. If you do not agree, please do not use the App.</p>

    <h2>2. Information We Collect</h2>

    <h3>2.1 Account Information</h3>
    <p>When you sign up using Google OAuth, we collect:</p>
    <ul>
        <li><strong>Name</strong> (from your Google account)</li>
        <li><strong>Email address</strong> (kept private, not displayed to other users)</li>
        <li><strong>Profile photo URL</strong> (from your Google account)</li>
    </ul>
    <p>You may also provide:</p>
    <ul>
        <li><strong>Username</strong> (displayed publicly to other users)</li>
        <li><strong>Bio</strong> (optional, displayed on your profile)</li>
    </ul>

    <h3>2.2 Location Data</h3>
    <p>Conqr requires access to your device's GPS to function. We collect:</p>
    <ul>
        <li><strong>Real-time GPS coordinates</strong> during activity recording (latitude, longitude, altitude, speed)</li>
        <li><strong>GPS paths</strong> that you trace while walking, running, or cycling</li>
        <li><strong>Territory boundaries</strong> (polygon coordinates of areas you claim)</li>
    </ul>
    <div class="highlight">
        <p><strong>Important:</strong> Location data is only collected while you are actively recording an activity. We do not track your location in the background when you are not using the App's recording feature.</p>
    </div>

    <h3>2.3 Activity Data</h3>
    <p>When you record an activity, we collect:</p>
    <ul>
        <li>Activity type (walking, running, or cycling)</li>
        <li>Duration and distance</li>
        <li>GPS path of your route</li>
        <li>Territories claimed during the activity</li>
        <li>Date and time of the activity</li>
    </ul>

    <h3>2.4 Social Data</h3>
    <p>If you use social features, we collect:</p>
    <ul>
        <li>Friend connections and friend requests</li>
        <li>Posts, comments, and likes on the community feed</li>
        <li>Shared activity and territory content</li>
    </ul>

    <h3>2.5 Usage and Analytics Data</h3>
    <p>We collect anonymous usage data to improve the App:</p>
    <ul>
        <li>Screen views and feature usage patterns</li>
        <li>Session duration and frequency</li>
        <li>App crashes and error reports</li>
        <li>Device platform (Android or iOS)</li>
    </ul>

    <h2>3. How We Use Your Information</h2>
    <p>We use the information we collect to:</p>
    <ul>
        <li><strong>Provide core functionality</strong> - Track your movements, calculate territories, and display them on the map</li>
        <li><strong>Identify you</strong> - Show your username and profile to other users on the map and leaderboard</li>
        <li><strong>Enable social features</strong> - Allow you to connect with friends, share activities, and interact on the feed</li>
        <li><strong>Sync across devices</strong> - Store your territories and activities so they persist across devices</li>
        <li><strong>Improve the App</strong> - Analyze usage patterns to fix bugs and add features</li>
        <li><strong>Display leaderboards</strong> - Rank users by territory area, distance, and activity count</li>
    </ul>

    <h2>4. Data Storage and Security</h2>
    <ul>
        <li>Your data is stored using <strong>Supabase</strong>, a secure cloud database platform, with servers protected by industry-standard encryption.</li>
        <li>Data is also cached locally on your device using AsyncStorage for offline access.</li>
        <li>Authentication is handled through Google OAuth with secure token management.</li>
        <li>We use Row Level Security (RLS) policies to ensure users can only access their own private data.</li>
    </ul>

    <h2>5. Data Sharing</h2>
    <p>We do <strong>not</strong> sell, rent, or trade your personal information to third parties.</p>
    <p>Your data may be shared in the following limited circumstances:</p>
    <ul>
        <li><strong>Public profile information</strong> - Your username, avatar, territories, and activity stats are visible to other Conqr users</li>
        <li><strong>Email address</strong> - Your email is kept private and is never shared with other users</li>
        <li><strong>Service providers</strong> - We use Supabase for data storage and Google for authentication. These providers have their own privacy policies</li>
        <li><strong>Legal requirements</strong> - We may disclose information if required by law or to protect our rights and safety</li>
    </ul>

    <h2>6. Your Rights and Choices</h2>
    <p>You have the right to:</p>
    <ul>
        <li><strong>Access your data</strong> - View your profile, activities, and territories within the App</li>
        <li><strong>Update your information</strong> - Edit your username, bio, and profile photo at any time</li>
        <li><strong>Delete your account</strong> - Use the "Delete Account" option in your profile settings, or contact us to request complete deletion</li>
        <li><strong>Control location access</strong> - Revoke location permissions through your device settings at any time (note: the App's core features require location access to function)</li>
    </ul>

    <h2>7. Children's Privacy</h2>
    <p>Conqr is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we learn that we have collected information from a child under 13, we will take steps to delete it promptly.</p>

    <h2>8. Data Retention</h2>
    <p>We retain your data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where we are required to retain it for legal or security purposes.</p>

    <h2>9. Third-Party Services</h2>
    <p>Conqr uses the following third-party services:</p>
    <ul>
        <li><strong>Google OAuth</strong> - For authentication</li>
        <li><strong>Supabase</strong> - For data storage and backend services</li>
        <li><strong>Expo / EAS</strong> - For app building and over-the-air updates</li>
        <li><strong>CARTO / OpenStreetMap</strong> - For map tiles displayed in the App</li>
    </ul>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Continued use of the App after changes constitutes acceptance of the updated policy.</p>

    <h2>11. Contact Us</h2>
    <p>If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at:</p>
    <ul>
        <li><strong>Email:</strong> conqrapp@gmail.com</li>
    </ul>

    <div class="footer">
        <p>&copy; 2026 Conqr. All rights reserved.</p>
    </div>
</body>
</html>`;

export default function PrivacyPolicyScreen({ navigation }: PrivacyPolicyScreenProps) {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft color="#1A1A1A" size={24} />
          </TouchableOpacity>
        </View>
        <WebView
          source={{ html: PRIVACY_HTML }}
          style={styles.webview}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          originWhitelist={['*']}
        />
      </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    padding: 8,
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
