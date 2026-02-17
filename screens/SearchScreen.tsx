import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Search, User, Users, X } from 'lucide-react-native';
import BottomTabBar from '../components/BottomTabBar';
import { AuthService } from '../services/AuthService';
import { UserProfile } from '../lib/types';
import { useScreenTracking } from '../lib/useScreenTracking';

interface SearchScreenProps {
  navigation: any;
}

export default function SearchScreen({ navigation }: SearchScreenProps) {
  useScreenTracking('Search');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (searchQuery.trim().length < 2) {
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const users = await AuthService.searchUsers(searchQuery);
      setResults(users);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const clearSearch = () => {
    setSearchQuery('');
    setResults([]);
    setHasSearched(false);
  };

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed') => {
    if (tab === 'home') {
      navigation.navigate('Home');
    } else if (tab === 'record') {
      navigation.navigate('Record');
    } else if (tab === 'profile') {
      navigation.navigate('Profile');
    } else if (tab === 'leaderboard') {
      navigation.navigate('Leaderboard');
    } else if (tab === 'friends') {
      navigation.navigate('Friends');
    } else if (tab === 'feed') {
      navigation.navigate('Feed');
    }
  };

  const renderUserItem = ({ item }: { item: UserProfile }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.userAvatar}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
        ) : (
          <User color="#E65100" size={24} />
        )}
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.username}>{item.username}</Text>
        {item.bio ? (
          <Text style={styles.userBio} numberOfLines={1}>{item.bio}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Users color="#E65100" size={28} />
          <Text style={styles.headerTitle}>Find Users</Text>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Search color="#999999" size={20} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by username..."
              placeholderTextColor="#999999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                <X color="#999999" size={18} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.searchButton, searchQuery.trim().length < 2 && styles.searchButtonDisabled]}
            onPress={handleSearch}
            disabled={searchQuery.trim().length < 2}
          >
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator color="#E65100" size="large" />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : hasSearched && results.length === 0 ? (
            <View style={styles.centerContent}>
              <Users color="#CCCCCC" size={48} />
              <Text style={styles.noResultsText}>No users found</Text>
              <Text style={styles.noResultsHint}>Try a different search term</Text>
            </View>
          ) : !hasSearched ? (
            <View style={styles.centerContent}>
              <Search color="#CCCCCC" size={48} />
              <Text style={styles.emptyText}>Search for users</Text>
              <Text style={styles.emptyHint}>Enter at least 2 characters to search</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              renderItem={renderUserItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </SafeAreaView>
      <BottomTabBar activeTab="profile" onTabPress={handleTabPress} />
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    paddingVertical: 12,
  },
  clearButton: {
    padding: 4,
  },
  searchButton: {
    backgroundColor: '#E65100',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666666',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#666666',
  },
  emptyHint: {
    marginTop: 8,
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
  noResultsText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#666666',
  },
  noResultsHint: {
    marginTop: 8,
    fontSize: 14,
    color: '#999999',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  userBio: {
    fontSize: 13,
    color: '#666666',
    marginTop: 2,
  },
});
