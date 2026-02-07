import { FeedService } from '../services/FeedService';
import { supabase } from '../lib/supabase';

const mockSupabase = supabase as any;

// Helper to build chainable mock
const chainable = (data: any = null, error: any = null) => {
    const result = { data, error };
    const chain: any = {
        select: jest.fn(() => chain),
        insert: jest.fn(() => chain),
        update: jest.fn(() => chain),
        delete: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        in: jest.fn(() => chain),
        or: jest.fn(() => chain),
        order: jest.fn(() => chain),
        range: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        single: jest.fn(() => result),
        then: jest.fn((resolve: any) => resolve(result)),
        // Make it thenable so await works
        ...result,
    };
    // Allow awaiting the chain directly
    Object.defineProperty(chain, 'then', {
        value: (resolve: any) => Promise.resolve(result).then(resolve),
    });
    return chain;
};

describe('FeedService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createPost', () => {
        it('should create a text post successfully', async () => {
            const mockPost = {
                id: 'post-1',
                user_id: 'test-user-id',
                content: 'Hello world!',
                post_type: 'text',
                activity_id: null,
                territory_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const mockUser = { username: 'testuser', avatar_url: null };

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'posts') return chainable(mockPost);
                if (table === 'users') return chainable(mockUser);
                return chainable(null);
            });

            const post = await FeedService.createPost('Hello world!');
            expect(post.content).toBe('Hello world!');
            expect(post.postType).toBe('text');
            expect(post.userId).toBe('test-user-id');
            expect(post.username).toBe('testuser');
            expect(mockSupabase.from).toHaveBeenCalledWith('posts');
        });

        it('should create an activity share post', async () => {
            const mockPost = {
                id: 'post-2',
                user_id: 'test-user-id',
                content: 'Check out my run!',
                post_type: 'activity_share',
                activity_id: 'act-1',
                territory_id: null,
                created_at: new Date().toISOString(),
            };

            const mockUser = { username: 'testuser', avatar_url: null };

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'posts') return chainable(mockPost);
                if (table === 'users') return chainable(mockUser);
                return chainable(null);
            });

            const post = await FeedService.createPost('Check out my run!', 'activity_share', 'act-1');
            expect(post.postType).toBe('activity_share');
            expect(post.activityId).toBe('act-1');
        });

        it('should create a territory share post', async () => {
            const mockPost = {
                id: 'post-3',
                user_id: 'test-user-id',
                content: 'New territory!',
                post_type: 'territory_share',
                activity_id: null,
                territory_id: 'ter-1',
                created_at: new Date().toISOString(),
            };

            const mockUser = { username: 'testuser', avatar_url: null };

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'posts') return chainable(mockPost);
                if (table === 'users') return chainable(mockUser);
                return chainable(null);
            });

            const post = await FeedService.createPost('New territory!', 'territory_share', undefined, 'ter-1');
            expect(post.postType).toBe('territory_share');
            expect(post.territoryId).toBe('ter-1');
        });

        it('should throw on error', async () => {
            const chain = chainable(null, { message: 'Insert failed' });
            mockSupabase.from.mockReturnValue(chain);

            await expect(FeedService.createPost('test')).rejects.toEqual({ message: 'Insert failed' });
        });

        it('should throw if not signed in', async () => {
            mockSupabase.auth.getSession.mockResolvedValueOnce({
                data: { session: null },
            });

            await expect(FeedService.createPost('test')).rejects.toThrow('Must be signed in');
        });
    });

    describe('getFeed', () => {
        it('should return posts with user info and counts', async () => {
            const mockPosts = [
                {
                    id: 'post-1',
                    user_id: 'user-1',
                    content: 'Hello',
                    post_type: 'text',
                    activity_id: null,
                    territory_id: null,
                    created_at: new Date().toISOString(),
                    user: { id: 'user-1', username: 'alice', avatar_url: 'https://example.com/alice.jpg' },
                },
                {
                    id: 'post-2',
                    user_id: 'user-2',
                    content: 'World',
                    post_type: 'text',
                    activity_id: null,
                    territory_id: null,
                    created_at: new Date().toISOString(),
                    user: { id: 'user-2', username: 'bob', avatar_url: null },
                },
            ];

            const mockLikes = [
                { post_id: 'post-1', user_id: 'test-user-id' },
                { post_id: 'post-1', user_id: 'user-2' },
            ];

            const mockComments = [
                { post_id: 'post-1' },
                { post_id: 'post-1' },
                { post_id: 'post-2' },
            ];

            let callCount = 0;
            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'posts') {
                    return chainable(mockPosts);
                } else if (table === 'post_likes') {
                    return chainable(mockLikes);
                } else if (table === 'post_comments') {
                    return chainable(mockComments);
                }
                return chainable([]);
            });

            const feed = await FeedService.getFeed();
            expect(feed).toHaveLength(2);
            expect(feed[0].username).toBe('alice');
            expect(feed[0].userAvatarUrl).toBe('https://example.com/alice.jpg');
            expect(feed[0].likeCount).toBe(2);
            expect(feed[0].commentCount).toBe(2);
            expect(feed[0].isLikedByMe).toBe(true);
            expect(feed[1].username).toBe('bob');
            expect(feed[1].likeCount).toBe(0);
            expect(feed[1].commentCount).toBe(1);
            expect(feed[1].isLikedByMe).toBe(false);
        });

        it('should return empty array on error', async () => {
            mockSupabase.from.mockReturnValue(chainable(null, { message: 'Error' }));

            const feed = await FeedService.getFeed();
            expect(feed).toEqual([]);
        });

        it('should return empty array when no posts exist', async () => {
            mockSupabase.from.mockReturnValue(chainable([]));

            const feed = await FeedService.getFeed();
            expect(feed).toEqual([]);
        });

        it('should accept limit and offset parameters', async () => {
            mockSupabase.from.mockReturnValue(chainable([]));

            await FeedService.getFeed(10, 20);
            // The chain should have been called - just verify no crash
        });
    });

    describe('deletePost', () => {
        it('should delete a post successfully', async () => {
            const chain = chainable(null, null);
            mockSupabase.from.mockReturnValue(chain);

            await FeedService.deletePost('post-1');
            expect(mockSupabase.from).toHaveBeenCalledWith('posts');
            expect(chain.delete).toHaveBeenCalled();
        });

        it('should throw on error', async () => {
            const chain = chainable(null, { message: 'Delete failed' });
            mockSupabase.from.mockReturnValue(chain);

            await expect(FeedService.deletePost('post-1')).rejects.toEqual({ message: 'Delete failed' });
        });
    });

    describe('likePost', () => {
        it('should like a post successfully', async () => {
            const chain = chainable(null, null);
            mockSupabase.from.mockReturnValue(chain);

            await FeedService.likePost('post-1');
            expect(mockSupabase.from).toHaveBeenCalledWith('post_likes');
            expect(chain.insert).toHaveBeenCalledWith({
                post_id: 'post-1',
                user_id: 'test-user-id',
            });
        });

        it('should throw on error', async () => {
            const chain = chainable(null, { message: 'Like failed' });
            mockSupabase.from.mockReturnValue(chain);

            await expect(FeedService.likePost('post-1')).rejects.toEqual({ message: 'Like failed' });
        });

        it('should throw if not signed in', async () => {
            mockSupabase.auth.getSession.mockResolvedValueOnce({
                data: { session: null },
            });

            await expect(FeedService.likePost('post-1')).rejects.toThrow('Must be signed in');
        });
    });

    describe('unlikePost', () => {
        it('should unlike a post successfully', async () => {
            const chain = chainable(null, null);
            mockSupabase.from.mockReturnValue(chain);

            await FeedService.unlikePost('post-1');
            expect(mockSupabase.from).toHaveBeenCalledWith('post_likes');
            expect(chain.delete).toHaveBeenCalled();
        });

        it('should throw on error', async () => {
            const chain = chainable(null, { message: 'Unlike failed' });
            mockSupabase.from.mockReturnValue(chain);

            await expect(FeedService.unlikePost('post-1')).rejects.toEqual({ message: 'Unlike failed' });
        });

        it('should throw if not signed in', async () => {
            mockSupabase.auth.getSession.mockResolvedValueOnce({
                data: { session: null },
            });

            await expect(FeedService.unlikePost('post-1')).rejects.toThrow('Must be signed in');
        });
    });

    describe('getComments', () => {
        it('should return comments with user info', async () => {
            const mockComments = [
                {
                    id: 'comment-1',
                    post_id: 'post-1',
                    user_id: 'user-1',
                    content: 'Nice!',
                    created_at: new Date().toISOString(),
                    user: { id: 'user-1', username: 'alice', avatar_url: null },
                },
                {
                    id: 'comment-2',
                    post_id: 'post-1',
                    user_id: 'user-2',
                    content: 'Great run!',
                    created_at: new Date().toISOString(),
                    user: { id: 'user-2', username: 'bob', avatar_url: 'https://example.com/bob.jpg' },
                },
            ];

            mockSupabase.from.mockReturnValue(chainable(mockComments));

            const comments = await FeedService.getComments('post-1');
            expect(comments).toHaveLength(2);
            expect(comments[0].username).toBe('alice');
            expect(comments[0].content).toBe('Nice!');
            expect(comments[1].username).toBe('bob');
            expect(comments[1].userAvatarUrl).toBe('https://example.com/bob.jpg');
        });

        it('should return empty array on error', async () => {
            mockSupabase.from.mockReturnValue(chainable(null, { message: 'Error' }));

            const comments = await FeedService.getComments('post-1');
            expect(comments).toEqual([]);
        });

        it('should return empty array when no comments exist', async () => {
            mockSupabase.from.mockReturnValue(chainable([]));

            const comments = await FeedService.getComments('post-1');
            expect(comments).toEqual([]);
        });
    });

    describe('addComment', () => {
        it('should add a comment successfully', async () => {
            const mockComment = {
                id: 'comment-1',
                post_id: 'post-1',
                user_id: 'test-user-id',
                content: 'Great!',
                created_at: new Date().toISOString(),
            };

            const mockUser = { username: 'testuser', avatar_url: null };

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'post_comments') return chainable(mockComment);
                if (table === 'users') return chainable(mockUser);
                return chainable(null);
            });

            const comment = await FeedService.addComment('post-1', 'Great!');
            expect(comment.content).toBe('Great!');
            expect(comment.postId).toBe('post-1');
            expect(comment.username).toBe('testuser');
            expect(mockSupabase.from).toHaveBeenCalledWith('post_comments');
        });

        it('should throw on error', async () => {
            const chain = chainable(null, { message: 'Insert failed' });
            mockSupabase.from.mockReturnValue(chain);

            await expect(FeedService.addComment('post-1', 'test')).rejects.toEqual({ message: 'Insert failed' });
        });

        it('should throw if not signed in', async () => {
            mockSupabase.auth.getSession.mockResolvedValueOnce({
                data: { session: null },
            });

            await expect(FeedService.addComment('post-1', 'test')).rejects.toThrow('Must be signed in');
        });
    });

    describe('deleteComment', () => {
        it('should delete a comment successfully', async () => {
            const chain = chainable(null, null);
            mockSupabase.from.mockReturnValue(chain);

            await FeedService.deleteComment('comment-1');
            expect(mockSupabase.from).toHaveBeenCalledWith('post_comments');
            expect(chain.delete).toHaveBeenCalled();
        });

        it('should throw on error', async () => {
            const chain = chainable(null, { message: 'Delete failed' });
            mockSupabase.from.mockReturnValue(chain);

            await expect(FeedService.deleteComment('comment-1')).rejects.toEqual({ message: 'Delete failed' });
        });
    });

    describe('getUserPosts', () => {
        it('should return posts for a specific user', async () => {
            const mockPosts = [
                {
                    id: 'post-1',
                    user_id: 'user-1',
                    content: 'My post',
                    post_type: 'text',
                    activity_id: null,
                    territory_id: null,
                    created_at: new Date().toISOString(),
                    user: { id: 'user-1', username: 'alice', avatar_url: null },
                },
            ];

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'posts') {
                    return chainable(mockPosts);
                }
                return chainable([]);
            });

            const posts = await FeedService.getUserPosts('user-1');
            expect(posts).toHaveLength(1);
            expect(posts[0].username).toBe('alice');
        });

        it('should return empty array on error', async () => {
            mockSupabase.from.mockReturnValue(chainable(null, { message: 'Error' }));

            const posts = await FeedService.getUserPosts('user-1');
            expect(posts).toEqual([]);
        });

        it('should return empty array when user has no posts', async () => {
            mockSupabase.from.mockReturnValue(chainable([]));

            const posts = await FeedService.getUserPosts('user-1');
            expect(posts).toEqual([]);
        });
    });
});
