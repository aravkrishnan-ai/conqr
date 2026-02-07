import { ShareService } from '../services/ShareService';
import { Share } from 'react-native';
import { Activity, Territory, Post } from '../lib/types';

// Mock Share from react-native
jest.mock('react-native', () => ({
    Share: {
        share: jest.fn().mockResolvedValue({ action: 'sharedAction' }),
    },
}));

const mockActivity: Activity = {
    id: 'act-1',
    userId: 'user-1',
    type: 'RUN',
    startTime: Date.now() - 3600000,
    endTime: Date.now(),
    distance: 5230,
    duration: 1800,
    polylines: [],
    isSynced: true,
    averageSpeed: 2.9,
};

const mockTerritory: Territory = {
    id: 'ter-1',
    name: 'Central Park',
    ownerId: 'user-1',
    activityId: 'act-1',
    claimedAt: Date.now(),
    area: 15000,
    perimeter: 500,
    center: { lat: 40.78, lng: -73.97 },
    polygon: [[-73.97, 40.78], [-73.96, 40.78], [-73.96, 40.79], [-73.97, 40.79]],
    history: [],
};

const mockPost: Post = {
    id: 'post-1',
    userId: 'user-1',
    username: 'testuser',
    content: 'Great run today!',
    postType: 'text',
    likeCount: 5,
    commentCount: 2,
    isLikedByMe: false,
    createdAt: Date.now(),
};

describe('ShareService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('shareActivity', () => {
        it('should call Share.share with formatted activity message', async () => {
            await ShareService.shareActivity(mockActivity);

            expect(Share.share).toHaveBeenCalledTimes(1);
            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.title).toBe('RUN on Conqr');
            expect(call.message).toContain('RUN on Conqr');
            expect(call.message).toContain('5.23km');
            expect(call.message).toContain('30m 0s');
            expect(call.message).toContain('min/km');
            expect(call.message).toContain('Shared via Conqr');
        });

        it('should include territory info when provided', async () => {
            await ShareService.shareActivity(mockActivity, mockTerritory);

            expect(Share.share).toHaveBeenCalledTimes(1);
            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('Central Park');
            expect(call.message).toContain('1.50 ha');
        });

        it('should handle activity with zero speed', async () => {
            const activity = { ...mockActivity, averageSpeed: 0 };
            await ShareService.shareActivity(activity);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('--:--');
        });

        it('should handle activity with undefined speed', async () => {
            const activity = { ...mockActivity, averageSpeed: undefined };
            await ShareService.shareActivity(activity);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('--:--');
        });

        it('should handle short distance in meters', async () => {
            const activity = { ...mockActivity, distance: 500 };
            await ShareService.shareActivity(activity);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('500m');
        });

        it('should handle territory with unnamed territory', async () => {
            const territory = { ...mockTerritory, name: '' };
            await ShareService.shareActivity(mockActivity, territory);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('Unnamed Territory');
        });

        it('should handle Share.share rejection gracefully', async () => {
            (Share.share as jest.Mock).mockRejectedValueOnce(new Error('User cancelled'));

            // Should not throw
            await ShareService.shareActivity(mockActivity);
        });

        it('should format duration with hours correctly', async () => {
            const activity = { ...mockActivity, duration: 7265 }; // 2h 1m 5s
            await ShareService.shareActivity(activity);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('2h 1m 5s');
        });

        it('should format duration with only seconds', async () => {
            const activity = { ...mockActivity, duration: 45 };
            await ShareService.shareActivity(activity);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('45s');
        });

        it('should include WALK activity type', async () => {
            const activity = { ...mockActivity, type: 'WALK' as const };
            await ShareService.shareActivity(activity);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('WALK on Conqr');
            expect(call.title).toBe('WALK on Conqr');
        });

        it('should include RIDE activity type', async () => {
            const activity = { ...mockActivity, type: 'RIDE' as const };
            await ShareService.shareActivity(activity);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('RIDE on Conqr');
        });
    });

    describe('shareTerritory', () => {
        it('should call Share.share with territory stats', async () => {
            await ShareService.shareTerritory(mockTerritory);

            expect(Share.share).toHaveBeenCalledTimes(1);
            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.title).toBe('Territory on Conqr');
            expect(call.message).toContain('Territory conquered on Conqr!');
            expect(call.message).toContain('Central Park');
            expect(call.message).toContain('1.50 ha');
            expect(call.message).toContain('500m');
            expect(call.message).toContain('Shared via Conqr');
        });

        it('should handle unnamed territory', async () => {
            const territory = { ...mockTerritory, name: '' };
            await ShareService.shareTerritory(territory);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('Unnamed Territory');
        });

        it('should handle small territory area in m²', async () => {
            const territory = { ...mockTerritory, area: 500 };
            await ShareService.shareTerritory(territory);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('500 m²');
        });

        it('should handle Share.share rejection gracefully', async () => {
            (Share.share as jest.Mock).mockRejectedValueOnce(new Error('User cancelled'));

            await ShareService.shareTerritory(mockTerritory);
            // Should not throw
        });

        it('should format long perimeter in km', async () => {
            const territory = { ...mockTerritory, perimeter: 2500 };
            await ShareService.shareTerritory(territory);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('2.50km');
        });
    });

    describe('sharePost', () => {
        it('should call Share.share with post content', async () => {
            await ShareService.sharePost(mockPost);

            expect(Share.share).toHaveBeenCalledTimes(1);
            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.title).toBe('Conqr Post');
            expect(call.message).toContain('Great run today!');
            expect(call.message).toContain('Shared via Conqr');
        });

        it('should include activity share text for activity posts', async () => {
            const post = { ...mockPost, postType: 'activity_share' as const };
            await ShareService.sharePost(post);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('Activity shared on Conqr');
        });

        it('should include territory share text for territory posts', async () => {
            const post = { ...mockPost, postType: 'territory_share' as const };
            await ShareService.sharePost(post);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('Territory shared on Conqr');
        });

        it('should handle empty content', async () => {
            const post = { ...mockPost, content: '' };
            await ShareService.sharePost(post);

            const call = (Share.share as jest.Mock).mock.calls[0][0];
            expect(call.message).toContain('Shared via Conqr');
        });

        it('should handle Share.share rejection gracefully', async () => {
            (Share.share as jest.Mock).mockRejectedValueOnce(new Error('User cancelled'));

            await ShareService.sharePost(mockPost);
            // Should not throw
        });
    });
});
