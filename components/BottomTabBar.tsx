import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Home, User, UserPlus, Trophy, Newspaper } from 'lucide-react-native';

type TabName = 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed';

interface BottomTabBarProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
}

export default function BottomTabBar({ activeTab, onTabPress }: BottomTabBarProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => onTabPress('home')}
        activeOpacity={0.7}
      >
        <Home
          size={24}
          color={activeTab === 'home' ? '#E65100' : '#666666'}
          strokeWidth={activeTab === 'home' ? 2.5 : 2}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onTabPress('feed')}
        activeOpacity={0.7}
      >
        <Newspaper
          size={24}
          color={activeTab === 'feed' ? '#E65100' : '#666666'}
          strokeWidth={activeTab === 'feed' ? 2.5 : 2}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.recordTab}
        onPress={() => onTabPress('record')}
        activeOpacity={0.8}
      >
        <View style={[
          styles.recordButton,
          activeTab === 'record' && styles.recordButtonActive
        ]}>
          <View style={styles.recordInner} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onTabPress('leaderboard')}
        activeOpacity={0.7}
      >
        <Trophy
          size={24}
          color={activeTab === 'leaderboard' ? '#E65100' : '#666666'}
          strokeWidth={activeTab === 'leaderboard' ? 2.5 : 2}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onTabPress('friends')}
        activeOpacity={0.7}
      >
        <UserPlus
          size={24}
          color={activeTab === 'friends' ? '#E65100' : '#666666'}
          strokeWidth={activeTab === 'friends' ? 2.5 : 2}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => onTabPress('profile')}
        activeOpacity={0.7}
      >
        <User
          size={24}
          color={activeTab === 'profile' ? '#E65100' : '#666666'}
          strokeWidth={activeTab === 'profile' ? 2.5 : 2}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingTop: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  recordTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  recordButtonActive: {
    backgroundColor: '#CC2F26',
  },
  recordInner: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
});
