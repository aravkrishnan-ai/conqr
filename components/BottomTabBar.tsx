import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Home, User, UserPlus, Trophy, Newspaper } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

type TabName = 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed';

interface BottomTabBarProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
}

const TAB_LABELS: Record<TabName, string> = {
  home: 'Map',
  feed: 'Feed',
  record: '',
  leaderboard: 'Ranks',
  friends: 'Friends',
  profile: 'Profile',
};

export default function BottomTabBar({ activeTab, onTabPress }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const handlePress = (tab: TabName) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    onTabPress(tab);
  };

  const renderTab = (tab: TabName, Icon: any) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={styles.tab}
        onPress={() => handlePress(tab)}
        activeOpacity={0.7}
      >
        <Icon
          size={24}
          color={isActive ? '#E65100' : '#999999'}
          strokeWidth={isActive ? 2.5 : 1.8}
        />
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
          {TAB_LABELS[tab]}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {renderTab('home', Home)}
      {renderTab('feed', Newspaper)}

      <TouchableOpacity
        style={styles.recordTab}
        onPress={() => handlePress('record')}
        activeOpacity={0.8}
      >
        <View style={[
          styles.recordButton,
          activeTab === 'record' && styles.recordButtonActive
        ]}>
          <View style={styles.recordInner} />
        </View>
      </TouchableOpacity>

      {renderTab('leaderboard', Trophy)}
      {renderTab('friends', UserPlus)}
      {renderTab('profile', User)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#999999',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#E65100',
    fontWeight: '600',
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
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 4,
  },
  recordButtonActive: {
    backgroundColor: '#CC2F26',
  },
  recordInner: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
});
