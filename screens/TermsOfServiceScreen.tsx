import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

interface TermsOfServiceScreenProps {
  onAccept: () => void;
}

const TOS_HTML = `<!DOCTYPE html>
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
    <h1>Conqr Terms of Service</h1>
    <p class="subtitle">Last updated: February 12, 2026</p>

    <div class="highlight">
        <p><strong>Summary:</strong> By using Conqr, you agree to use the app responsibly, respect other users, and follow these terms. You must be at least 13 years old to use Conqr.</p>
    </div>

    <h2>1. Acceptance of Terms</h2>
    <p>These Terms of Service ("Terms") govern your access to and use of the Conqr mobile application ("the App"), operated by Conqr ("we," "our," or "us"). By creating an account or using the App, you agree to be bound by these Terms. If you do not agree to these Terms, you may not use the App.</p>
    <p>We may update these Terms from time to time. We will notify you of material changes by updating the "Last updated" date. Your continued use of the App after changes constitutes acceptance of the updated Terms.</p>

    <h2>2. Eligibility</h2>
    <p>You must be at least 13 years of age to use Conqr. If you are between 13 and 18 years old, you represent that your parent or legal guardian has reviewed and agreed to these Terms on your behalf. By using the App, you represent and warrant that you meet these eligibility requirements.</p>

    <h2>3. Account Registration</h2>
    <p>To use Conqr, you must create an account using Google OAuth authentication. You agree to:</p>
    <ul>
        <li>Provide accurate and complete information during registration</li>
        <li>Maintain the security of your account credentials</li>
        <li>Accept responsibility for all activity that occurs under your account</li>
        <li>Notify us immediately if you suspect unauthorized access to your account</li>
    </ul>
    <p>You may only create and maintain one account. We reserve the right to suspend or terminate accounts that violate these Terms.</p>

    <h2>4. Description of Service</h2>
    <p>Conqr is a location-based mobile application that allows users to claim real-world territory by walking, running, or cycling. The App uses your device's GPS to track your movements and calculate territories based on your recorded paths. Features include:</p>
    <ul>
        <li>Activity recording (walking, running, cycling)</li>
        <li>Territory claiming based on GPS-traced paths</li>
        <li>Leaderboards and statistics</li>
        <li>Social features including friends, a community feed, and sharing</li>
        <li>Special events organized by the Conqr team</li>
    </ul>

    <h2>5. User Conduct</h2>
    <p>When using Conqr, you agree to:</p>
    <ul>
        <li><strong>Obey all laws:</strong> Follow all applicable local, state, national, and international laws and regulations while using the App</li>
        <li><strong>Stay safe:</strong> Pay attention to your surroundings while recording activities. Do not use the App while operating a motor vehicle. You are solely responsible for your physical safety</li>
        <li><strong>Respect property:</strong> Do not trespass on private property or enter restricted areas to claim territory</li>
        <li><strong>Be respectful:</strong> Do not harass, bully, threaten, or abuse other users through any feature of the App</li>
        <li><strong>Be honest:</strong> Do not use GPS spoofing, emulators, or any other method to falsify your location or activity data</li>
    </ul>

    <h3>5.1 Prohibited Conduct</h3>
    <p>You may not:</p>
    <ul>
        <li>Use the App for any illegal or unauthorized purpose</li>
        <li>Manipulate or falsify GPS data, location, speed, or activity information</li>
        <li>Use automated tools, bots, scripts, or other software to interact with the App</li>
        <li>Attempt to gain unauthorized access to any portion of the App or its systems</li>
        <li>Interfere with or disrupt the App or servers connected to the App</li>
        <li>Post offensive, abusive, hateful, or inappropriate content</li>
        <li>Impersonate another person or entity</li>
        <li>Collect or harvest information about other users without their consent</li>
        <li>Use the App in any way that could harm minors</li>
    </ul>

    <h2>6. User Content</h2>
    <p>You may post content through the App, including profile information, activity data, comments, and community feed posts ("User Content"). You retain ownership of your User Content, but by posting it, you grant us a worldwide, non-exclusive, royalty-free license to use, display, reproduce, and distribute your User Content in connection with operating and improving the App.</p>
    <p>You are solely responsible for your User Content. You represent that you have the right to post any content you share and that it does not violate any third party's rights or any applicable law.</p>
    <p>We reserve the right to remove any User Content that violates these Terms or that we deem inappropriate, without prior notice.</p>

    <h2>7. Location Data and Privacy</h2>
    <p>Conqr requires access to your device's location services to function. By using the App, you consent to the collection and use of your location data as described in our Privacy Policy.</p>
    <p>Location data is collected only while you are actively recording an activity. We do not track your location in the background when you are not using the recording feature.</p>
    <p>For complete details about how we collect, use, and protect your data, please refer to our <strong>Privacy Policy</strong>, which is incorporated into these Terms by reference.</p>

    <h2>8. Intellectual Property</h2>
    <p>The App and its original content (excluding User Content), features, and functionality are owned by Conqr and are protected by international copyright, trademark, and other intellectual property laws. Our trademarks, logos, and trade names may not be used without our prior written consent.</p>
    <p>You are granted a limited, non-exclusive, non-transferable, revocable license to use the App for personal, non-commercial purposes in accordance with these Terms.</p>

    <h2>9. Disclaimers</h2>
    <p>The App is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, whether express or implied, including but not limited to:</p>
    <ul>
        <li>The accuracy or reliability of GPS data, territory calculations, or distance measurements</li>
        <li>The continuous, uninterrupted, or error-free operation of the App</li>
        <li>The accuracy or completeness of leaderboard data or statistics</li>
        <li>The safety of any location or route</li>
    </ul>
    <div class="highlight">
        <p><strong>Safety Notice:</strong> Conqr does not guarantee the safety of any area, route, or activity. Always be aware of your surroundings, follow traffic laws, and exercise caution when engaging in physical activity. Do not enter dangerous or restricted areas to claim territory.</p>
    </div>

    <h2>10. Limitation of Liability</h2>
    <p>To the maximum extent permitted by applicable law, Conqr and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:</p>
    <ul>
        <li>Personal injury or property damage arising from your use of the App</li>
        <li>Loss of data, profits, or goodwill</li>
        <li>Unauthorized access to or alteration of your data</li>
        <li>Any matter relating to the App</li>
    </ul>
    <p>In no event shall our total liability exceed the amount you have paid us in the twelve (12) months prior to the claim, or fifty US dollars ($50), whichever is greater.</p>

    <h2>11. Indemnification</h2>
    <p>You agree to indemnify, defend, and hold harmless Conqr and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, costs, or expenses (including reasonable attorneys' fees) arising from:</p>
    <ul>
        <li>Your use of the App</li>
        <li>Your violation of these Terms</li>
        <li>Your violation of any third party's rights</li>
        <li>Your User Content</li>
    </ul>

    <h2>12. Termination</h2>
    <p>We may suspend or terminate your account and access to the App at any time, with or without cause, and with or without notice. Upon termination, your right to use the App will immediately cease.</p>
    <p>You may delete your account at any time through the App's profile settings. Upon account deletion, we will delete your personal data in accordance with our Privacy Policy.</p>
    <p>Sections 6, 9, 10, 11, and 14 shall survive any termination of these Terms.</p>

    <h2>13. Events</h2>
    <p>Conqr may organize special events from time to time. Participation in events is voluntary. Event-specific rules may apply and will be communicated through the App. We reserve the right to modify, suspend, or cancel events at any time.</p>

    <h2>14. Governing Law and Disputes</h2>
    <p>These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to conflict of law principles. Any disputes arising from these Terms or your use of the App shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association, except that either party may seek injunctive relief in any court of competent jurisdiction.</p>

    <h2>15. Severability</h2>
    <p>If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.</p>

    <h2>16. Entire Agreement</h2>
    <p>These Terms, together with our Privacy Policy, constitute the entire agreement between you and Conqr regarding your use of the App and supersede any prior agreements.</p>

    <h2>17. Contact Us</h2>
    <p>If you have questions about these Terms of Service, please contact us at:</p>
    <ul>
        <li><strong>Email:</strong> conqrrunning@gmail.com</li>
    </ul>

    <div class="footer">
        <p>&copy; 2026 Conqr. All rights reserved.</p>
    </div>
</body>
</html>`;

export default function TermsOfServiceScreen({ onAccept }: TermsOfServiceScreenProps) {
  const handleDecline = () => {
    Alert.alert(
      'Terms Required',
      'You must accept the Terms of Service to use Conqr. If you decline, you will not be able to access the app.',
      [{ text: 'OK', style: 'default' }]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.progressRow}>
            <View style={[styles.progressDot, styles.progressDotActive]} />
            <View style={styles.progressDot} />
          </View>
          <Text style={styles.headerTitle}>Terms of Service</Text>
          <Text style={styles.headerSubtitle}>Quick read, then you're almost in</Text>
        </View>
        <WebView
          source={{ html: TOS_HTML }}
          style={styles.webview}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          originWhitelist={['*']}
        />
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.declineButton} onPress={handleDecline}>
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
            <Text style={styles.acceptText}>Accept</Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  progressDot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
  },
  progressDotActive: {
    backgroundColor: '#E65100',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  declineText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  acceptButton: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#E65100',
    alignItems: 'center',
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
