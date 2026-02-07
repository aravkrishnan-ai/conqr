import { supabase } from '../lib/supabase';
import { Friendship, FriendWithProfile, FriendshipStatus, UserProfile } from '../lib/types';

const mapFriendship = (row: any): Friendship => ({
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
});

const mapUserProfile = (user: any): UserProfile => ({
    id: user.id,
    username: user.username || '',
    bio: user.bio || '',
    avatarUrl: user.avatar_url || undefined,
    createdAt: user.created_at ? new Date(user.created_at).getTime() : Date.now(),
});

export const FriendService = {
    async sendFriendRequest(addresseeId: string): Promise<Friendship> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const requesterId = session.user.id;

        if (requesterId === addresseeId) {
            throw new Error('Cannot send friend request to yourself');
        }

        // Check for existing friendship in forward direction
        const { data: forward } = await supabase
            .from('friendships')
            .select('id')
            .eq('requester_id', requesterId)
            .eq('addressee_id', addresseeId)
            .limit(1);

        if (forward && forward.length > 0) {
            throw new Error('Friend request already exists');
        }

        // Check for existing friendship in reverse direction
        const { data: reverse } = await supabase
            .from('friendships')
            .select('id')
            .eq('requester_id', addresseeId)
            .eq('addressee_id', requesterId)
            .limit(1);

        if (reverse && reverse.length > 0) {
            throw new Error('Friend request already exists');
        }

        const { data, error } = await supabase
            .from('friendships')
            .insert({
                requester_id: requesterId,
                addressee_id: addresseeId,
                status: 'pending',
            })
            .select()
            .single();

        if (error) throw error;
        return mapFriendship(data);
    },

    async acceptFriendRequest(friendshipId: string): Promise<Friendship> {
        const { data, error } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', friendshipId)
            .select()
            .single();

        if (error) throw error;
        return mapFriendship(data);
    },

    async rejectFriendRequest(friendshipId: string): Promise<Friendship> {
        const { data, error } = await supabase
            .from('friendships')
            .update({ status: 'rejected' })
            .eq('id', friendshipId)
            .select()
            .single();

        if (error) throw error;
        return mapFriendship(data);
    },

    async removeFriend(friendshipId: string): Promise<void> {
        const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('id', friendshipId);

        if (error) throw error;
    },

    async getFriends(userId: string): Promise<FriendWithProfile[]> {
        const { data, error } = await supabase
            .from('friendships')
            .select(`
                *,
                requester:users!requester_id(id, username, bio, avatar_url, created_at),
                addressee:users!addressee_id(id, username, bio, avatar_url, created_at)
            `)
            .eq('status', 'accepted')
            .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

        if (error) {
            console.error('Failed to fetch friends:', error);
            return [];
        }

        if (!data) return [];

        return data.map((row: any) => {
            const friendship = mapFriendship(row);
            const friendData = row.requester_id === userId ? row.addressee : row.requester;
            return {
                friendship,
                profile: mapUserProfile(friendData),
            };
        });
    },

    async getIncomingRequests(userId: string): Promise<FriendWithProfile[]> {
        const { data, error } = await supabase
            .from('friendships')
            .select(`
                *,
                requester:users!requester_id(id, username, bio, avatar_url, created_at)
            `)
            .eq('addressee_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Failed to fetch incoming requests:', error);
            return [];
        }

        if (!data) return [];

        return data.map((row: any) => ({
            friendship: mapFriendship(row),
            profile: mapUserProfile(row.requester),
        }));
    },

    async getOutgoingRequests(userId: string): Promise<FriendWithProfile[]> {
        const { data, error } = await supabase
            .from('friendships')
            .select(`
                *,
                addressee:users!addressee_id(id, username, bio, avatar_url, created_at)
            `)
            .eq('requester_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Failed to fetch outgoing requests:', error);
            return [];
        }

        if (!data) return [];

        return data.map((row: any) => ({
            friendship: mapFriendship(row),
            profile: mapUserProfile(row.addressee),
        }));
    },

    async getFriendshipStatus(userId: string, otherUserId: string): Promise<{ status: FriendshipStatus; friendshipId?: string }> {
        // Check forward direction
        const { data: forward } = await supabase
            .from('friendships')
            .select('id, status')
            .eq('requester_id', userId)
            .eq('addressee_id', otherUserId)
            .limit(1);

        if (forward && forward.length > 0) {
            return {
                status: forward[0].status as FriendshipStatus,
                friendshipId: forward[0].id,
            };
        }

        // Check reverse direction
        const { data: reverse } = await supabase
            .from('friendships')
            .select('id, status')
            .eq('requester_id', otherUserId)
            .eq('addressee_id', userId)
            .limit(1);

        if (reverse && reverse.length > 0) {
            return {
                status: reverse[0].status as FriendshipStatus,
                friendshipId: reverse[0].id,
            };
        }

        return { status: 'none' };
    },
};
