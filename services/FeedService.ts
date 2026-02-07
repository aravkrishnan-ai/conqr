import { supabase } from '../lib/supabase';
import { Post, PostComment, PostType } from '../lib/types';

const mapPost = (row: any, currentUserId: string | null, likeRows: any[], commentCounts: Map<string, number>): Post => ({
    id: row.id,
    userId: row.user_id,
    username: row.user?.username || 'Unknown',
    userAvatarUrl: row.user?.avatar_url || undefined,
    content: row.content || '',
    postType: row.post_type as PostType,
    activityId: row.activity_id || undefined,
    territoryId: row.territory_id || undefined,
    likeCount: likeRows.filter((l: any) => l.post_id === row.id).length,
    commentCount: commentCounts.get(row.id) || 0,
    isLikedByMe: currentUserId ? likeRows.some((l: any) => l.post_id === row.id && l.user_id === currentUserId) : false,
    createdAt: new Date(row.created_at).getTime(),
});

const mapComment = (row: any): PostComment => ({
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    username: row.user?.username || 'Unknown',
    userAvatarUrl: row.user?.avatar_url || undefined,
    content: row.content,
    createdAt: new Date(row.created_at).getTime(),
});

export const FeedService = {
    async getFeed(limit: number = 50, offset: number = 0): Promise<Post[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUserId = session?.user?.id || null;

            // Fetch posts with user info
            const { data: posts, error } = await supabase
                .from('posts')
                .select(`
                    *,
                    user:users!user_id(id, username, avatar_url)
                `)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error || !posts) {
                console.error('Failed to fetch feed:', error);
                return [];
            }

            if (posts.length === 0) return [];

            const postIds = posts.map((p: any) => p.id);

            // Fetch likes for all posts in batch
            const { data: likes } = await supabase
                .from('post_likes')
                .select('post_id, user_id')
                .in('post_id', postIds);

            // Fetch comment counts in batch
            const { data: comments } = await supabase
                .from('post_comments')
                .select('post_id')
                .in('post_id', postIds);

            const commentCounts = new Map<string, number>();
            if (comments) {
                for (const c of comments) {
                    commentCounts.set(c.post_id, (commentCounts.get(c.post_id) || 0) + 1);
                }
            }

            return posts.map((row: any) => mapPost(row, currentUserId, likes || [], commentCounts));
        } catch (err) {
            console.error('Failed to fetch feed:', err);
            return [];
        }
    },

    async createPost(content: string, postType: PostType = 'text', activityId?: string, territoryId?: string): Promise<Post> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { data, error } = await supabase
            .from('posts')
            .insert({
                user_id: session.user.id,
                content,
                post_type: postType,
                activity_id: activityId || null,
                territory_id: territoryId || null,
            })
            .select()
            .single();

        if (error) throw error;

        // Fetch username from users table
        let username = 'Unknown';
        let avatarUrl: string | undefined;
        try {
            const { data: userData } = await supabase
                .from('users')
                .select('username, avatar_url')
                .eq('id', session.user.id)
                .single();
            if (userData) {
                username = userData.username || 'Unknown';
                avatarUrl = userData.avatar_url || undefined;
            }
        } catch {}

        return {
            id: data.id,
            userId: data.user_id,
            username,
            userAvatarUrl: avatarUrl,
            content: data.content || '',
            postType: data.post_type as PostType,
            activityId: data.activity_id || undefined,
            territoryId: data.territory_id || undefined,
            likeCount: 0,
            commentCount: 0,
            isLikedByMe: false,
            createdAt: new Date(data.created_at).getTime(),
        };
    },

    async deletePost(postId: string): Promise<void> {
        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', postId);

        if (error) throw error;
    },

    async likePost(postId: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { error } = await supabase
            .from('post_likes')
            .insert({
                post_id: postId,
                user_id: session.user.id,
            });

        if (error) throw error;
    },

    async unlikePost(postId: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { error } = await supabase
            .from('post_likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', session.user.id);

        if (error) throw error;
    },

    async getComments(postId: string): Promise<PostComment[]> {
        try {
            const { data, error } = await supabase
                .from('post_comments')
                .select(`
                    *,
                    user:users!user_id(id, username, avatar_url)
                `)
                .eq('post_id', postId)
                .order('created_at', { ascending: true });

            if (error || !data) {
                console.error('Failed to fetch comments:', error);
                return [];
            }

            return data.map(mapComment);
        } catch (err) {
            console.error('Failed to fetch comments:', err);
            return [];
        }
    },

    async addComment(postId: string, content: string): Promise<PostComment> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { data, error } = await supabase
            .from('post_comments')
            .insert({
                post_id: postId,
                user_id: session.user.id,
                content,
            })
            .select()
            .single();

        if (error) throw error;

        // Fetch username from users table
        let username = 'Unknown';
        let avatarUrl: string | undefined;
        try {
            const { data: userData } = await supabase
                .from('users')
                .select('username, avatar_url')
                .eq('id', session.user.id)
                .single();
            if (userData) {
                username = userData.username || 'Unknown';
                avatarUrl = userData.avatar_url || undefined;
            }
        } catch {}

        return {
            id: data.id,
            postId: data.post_id,
            userId: data.user_id,
            username,
            userAvatarUrl: avatarUrl,
            content: data.content,
            createdAt: new Date(data.created_at).getTime(),
        };
    },

    async deleteComment(commentId: string): Promise<void> {
        const { error } = await supabase
            .from('post_comments')
            .delete()
            .eq('id', commentId);

        if (error) throw error;
    },

    async getUserPosts(userId: string): Promise<Post[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUserId = session?.user?.id || null;

            const { data: posts, error } = await supabase
                .from('posts')
                .select(`
                    *,
                    user:users!user_id(id, username, avatar_url)
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error || !posts) {
                console.error('Failed to fetch user posts:', error);
                return [];
            }

            if (posts.length === 0) return [];

            const postIds = posts.map((p: any) => p.id);

            const { data: likes } = await supabase
                .from('post_likes')
                .select('post_id, user_id')
                .in('post_id', postIds);

            const { data: comments } = await supabase
                .from('post_comments')
                .select('post_id')
                .in('post_id', postIds);

            const commentCounts = new Map<string, number>();
            if (comments) {
                for (const c of comments) {
                    commentCounts.set(c.post_id, (commentCounts.get(c.post_id) || 0) + 1);
                }
            }

            return posts.map((row: any) => mapPost(row, currentUserId, likes || [], commentCounts));
        } catch (err) {
            console.error('Failed to fetch user posts:', err);
            return [];
        }
    },
};
