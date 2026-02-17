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

        // Check for existing friendship in either direction
        const { data: existing } = await supabase
            .from('friendships')
            .select('id')
            .or(
                `and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),` +
                `and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`
            )
            .limit(1);

        if (existing && existing.length > 0) {
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
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { data, error } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', friendshipId)
            .eq('addressee_id', session.user.id)
            .select()
            .single();

        if (error) throw error;
        return mapFriendship(data);
    },

    async rejectFriendRequest(friendshipId: string): Promise<Friendship> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { data, error } = await supabase
            .from('friendships')
            .update({ status: 'rejected' })
            .eq('id', friendshipId)
            .eq('addressee_id', session.user.id)
            .select()
            .single();

        if (error) throw error;
        return mapFriendship(data);
    },

    async removeFriend(friendshipId: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('id', friendshipId)
            .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);

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
        const { data, error } = await supabase
            .from('friendships')
            .select('id, status')
            .or(
                `and(requester_id.eq.${userId},addressee_id.eq.${otherUserId}),` +
                `and(requester_id.eq.${otherUserId},addressee_id.eq.${userId})`
            )
            .limit(1);

        if (error) {
            console.error('Failed to check friendship status:', error);
            return { status: 'none' };
        }

        if (data && data.length > 0) {
            return {
                status: data[0].status as FriendshipStatus,
                friendshipId: data[0].id,
            };
        }

        return { status: 'none' };
    },
};
