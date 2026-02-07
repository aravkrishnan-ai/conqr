import { FriendService } from '../services/FriendService';
import { supabase } from '../lib/supabase';

const mockSupabase = supabase as any;

describe('FriendService', () => {
  describe('sendFriendRequest', () => {
    // Helper: mock a chainable select().eq().eq().limit() query
    const mockEqChain = (data: any[], error: any = null) => {
      const result = { data, error };
      const mockLimit = jest.fn(() => result);
      const mockEq2 = jest.fn(() => ({ limit: mockLimit }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      return { select: mockSelect };
    };

    it('should prevent self-requests', async () => {
      await expect(FriendService.sendFriendRequest('test-user-id'))
        .rejects.toThrow('Cannot send friend request to yourself');
    });

    it('should create a pending friendship', async () => {
      // Mock: forward check (none found), reverse check (none found), then insert
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([]))  // forward check
        .mockReturnValueOnce(mockEqChain([]))  // reverse check
        .mockReturnValueOnce({                 // insert
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => ({
                data: {
                  id: 'fs-1',
                  requester_id: 'test-user-id',
                  addressee_id: 'other-user',
                  status: 'pending',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              })),
            })),
          })),
        });

      const result = await FriendService.sendFriendRequest('other-user');
      expect(result.id).toBe('fs-1');
      expect(result.status).toBe('pending');
      expect(result.requesterId).toBe('test-user-id');
      expect(result.addresseeId).toBe('other-user');
    });

    it('should prevent duplicate requests (forward direction)', async () => {
      // Mock: forward check finds existing
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([{ id: 'existing' }]));

      await expect(FriendService.sendFriendRequest('other-user'))
        .rejects.toThrow('Friend request already exists');
    });

    it('should prevent duplicate requests (reverse direction)', async () => {
      // Mock: forward check empty, reverse check finds existing
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([]))       // forward: empty
        .mockReturnValueOnce(mockEqChain([{ id: 'existing' }]));  // reverse: found

      await expect(FriendService.sendFriendRequest('other-user'))
        .rejects.toThrow('Friend request already exists');
    });

    it('should prevent request when already friends', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([{ id: 'existing', status: 'accepted' }]));

      await expect(FriendService.sendFriendRequest('other-user'))
        .rejects.toThrow('Friend request already exists');
    });

    it('should throw on insert error', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([]))  // forward check
        .mockReturnValueOnce(mockEqChain([]))  // reverse check
        .mockReturnValueOnce({                 // insert fails
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => ({
                data: null,
                error: { message: 'Insert failed' },
              })),
            })),
          })),
        });

      await expect(FriendService.sendFriendRequest('other-user'))
        .rejects.toEqual({ message: 'Insert failed' });
    });
  });

  describe('acceptFriendRequest', () => {
    it('should update status to accepted', async () => {
      const mockSingle = jest.fn(() => ({
        data: {
          id: 'fs-1',
          requester_id: 'other-user',
          addressee_id: 'test-user-id',
          status: 'accepted',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      }));
      const mockSelect = jest.fn(() => ({ single: mockSingle }));
      const mockEq = jest.fn(() => ({ select: mockSelect }));
      const mockUpdate = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ update: mockUpdate });

      const result = await FriendService.acceptFriendRequest('fs-1');
      expect(result.status).toBe('accepted');
      expect(result.id).toBe('fs-1');
      expect(mockUpdate).toHaveBeenCalledWith({ status: 'accepted' });
      expect(mockEq).toHaveBeenCalledWith('id', 'fs-1');
    });

    it('should throw on error', async () => {
      const mockSingle = jest.fn(() => ({
        data: null,
        error: { message: 'Update failed' },
      }));
      const mockSelect = jest.fn(() => ({ single: mockSingle }));
      const mockEq = jest.fn(() => ({ select: mockSelect }));
      const mockUpdate = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ update: mockUpdate });

      await expect(FriendService.acceptFriendRequest('fs-1'))
        .rejects.toEqual({ message: 'Update failed' });
    });
  });

  describe('rejectFriendRequest', () => {
    it('should update status to rejected', async () => {
      const mockSingle = jest.fn(() => ({
        data: {
          id: 'fs-1',
          requester_id: 'other-user',
          addressee_id: 'test-user-id',
          status: 'rejected',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      }));
      const mockSelect = jest.fn(() => ({ single: mockSingle }));
      const mockEq = jest.fn(() => ({ select: mockSelect }));
      const mockUpdate = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ update: mockUpdate });

      const result = await FriendService.rejectFriendRequest('fs-1');
      expect(result.status).toBe('rejected');
      expect(mockUpdate).toHaveBeenCalledWith({ status: 'rejected' });
    });

    it('should throw on error', async () => {
      const mockSingle = jest.fn(() => ({
        data: null,
        error: { message: 'Update failed' },
      }));
      const mockSelect = jest.fn(() => ({ single: mockSingle }));
      const mockEq = jest.fn(() => ({ select: mockSelect }));
      const mockUpdate = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ update: mockUpdate });

      await expect(FriendService.rejectFriendRequest('fs-bad'))
        .rejects.toEqual({ message: 'Update failed' });
    });
  });

  describe('removeFriend', () => {
    it('should delete the friendship', async () => {
      const mockEq = jest.fn(() => ({ error: null }));
      const mockDelete = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ delete: mockDelete });

      await expect(FriendService.removeFriend('fs-1')).resolves.not.toThrow();
      expect(mockEq).toHaveBeenCalledWith('id', 'fs-1');
    });

    it('should throw on error', async () => {
      const mockEq = jest.fn(() => ({ error: { message: 'Delete failed' } }));
      const mockDelete = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ delete: mockDelete });

      await expect(FriendService.removeFriend('fs-1'))
        .rejects.toEqual({ message: 'Delete failed' });
    });
  });

  describe('getFriends', () => {
    it('should return accepted friends with profiles', async () => {
      const mockOr = jest.fn(() => ({
        data: [{
          id: 'fs-1',
          requester_id: 'test-user-id',
          addressee_id: 'friend-1',
          status: 'accepted',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          requester: { id: 'test-user-id', username: 'me', bio: '', avatar_url: null, created_at: new Date().toISOString() },
          addressee: { id: 'friend-1', username: 'friend', bio: 'hello', avatar_url: null, created_at: new Date().toISOString() },
        }],
        error: null,
      }));
      const mockEq = jest.fn(() => ({ or: mockOr }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const friends = await FriendService.getFriends('test-user-id');
      expect(friends).toHaveLength(1);
      expect(friends[0].profile.username).toBe('friend');
      expect(friends[0].profile.id).toBe('friend-1');
      expect(friends[0].friendship.status).toBe('accepted');
    });

    it('should return friend profile when user is addressee', async () => {
      const mockOr = jest.fn(() => ({
        data: [{
          id: 'fs-2',
          requester_id: 'other-user',
          addressee_id: 'test-user-id',
          status: 'accepted',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          requester: { id: 'other-user', username: 'other', bio: 'yo', avatar_url: null, created_at: new Date().toISOString() },
          addressee: { id: 'test-user-id', username: 'me', bio: '', avatar_url: null, created_at: new Date().toISOString() },
        }],
        error: null,
      }));
      const mockEq = jest.fn(() => ({ or: mockOr }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const friends = await FriendService.getFriends('test-user-id');
      expect(friends).toHaveLength(1);
      expect(friends[0].profile.username).toBe('other');
      expect(friends[0].profile.id).toBe('other-user');
    });

    it('should return empty array on error', async () => {
      const mockOr = jest.fn(() => ({ data: null, error: { message: 'DB error' } }));
      const mockEq = jest.fn(() => ({ or: mockOr }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const friends = await FriendService.getFriends('test-user-id');
      expect(friends).toHaveLength(0);
    });

    it('should return empty array when no data', async () => {
      const mockOr = jest.fn(() => ({ data: [], error: null }));
      const mockEq = jest.fn(() => ({ or: mockOr }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const friends = await FriendService.getFriends('test-user-id');
      expect(friends).toHaveLength(0);
    });

    it('should return empty array when data is null', async () => {
      const mockOr = jest.fn(() => ({ data: null, error: null }));
      const mockEq = jest.fn(() => ({ or: mockOr }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const friends = await FriendService.getFriends('test-user-id');
      expect(friends).toHaveLength(0);
    });
  });

  describe('getIncomingRequests', () => {
    it('should return pending requests where user is addressee', async () => {
      const mockOrder = jest.fn(() => ({
        data: [{
          id: 'fs-2',
          requester_id: 'someone',
          addressee_id: 'test-user-id',
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          requester: { id: 'someone', username: 'requestor', bio: '', avatar_url: null, created_at: new Date().toISOString() },
        }],
        error: null,
      }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const requests = await FriendService.getIncomingRequests('test-user-id');
      expect(requests).toHaveLength(1);
      expect(requests[0].profile.username).toBe('requestor');
      expect(requests[0].friendship.status).toBe('pending');
      expect(requests[0].friendship.addresseeId).toBe('test-user-id');
    });

    it('should return empty array on error', async () => {
      const mockOrder = jest.fn(() => ({ data: null, error: { message: 'error' } }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const requests = await FriendService.getIncomingRequests('test-user-id');
      expect(requests).toHaveLength(0);
    });

    it('should return empty array when no pending requests', async () => {
      const mockOrder = jest.fn(() => ({ data: [], error: null }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const requests = await FriendService.getIncomingRequests('test-user-id');
      expect(requests).toHaveLength(0);
    });

    it('should return multiple requests sorted by date', async () => {
      const mockOrder = jest.fn(() => ({
        data: [
          {
            id: 'fs-a',
            requester_id: 'user-a',
            addressee_id: 'test-user-id',
            status: 'pending',
            created_at: new Date('2026-02-07').toISOString(),
            updated_at: new Date('2026-02-07').toISOString(),
            requester: { id: 'user-a', username: 'alice', bio: '', avatar_url: null, created_at: new Date().toISOString() },
          },
          {
            id: 'fs-b',
            requester_id: 'user-b',
            addressee_id: 'test-user-id',
            status: 'pending',
            created_at: new Date('2026-02-06').toISOString(),
            updated_at: new Date('2026-02-06').toISOString(),
            requester: { id: 'user-b', username: 'bob', bio: '', avatar_url: null, created_at: new Date().toISOString() },
          },
        ],
        error: null,
      }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const requests = await FriendService.getIncomingRequests('test-user-id');
      expect(requests).toHaveLength(2);
      expect(requests[0].profile.username).toBe('alice');
      expect(requests[1].profile.username).toBe('bob');
    });
  });

  describe('getOutgoingRequests', () => {
    it('should return pending requests where user is requester', async () => {
      const mockOrder = jest.fn(() => ({
        data: [{
          id: 'fs-3',
          requester_id: 'test-user-id',
          addressee_id: 'target',
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          addressee: { id: 'target', username: 'target_user', bio: '', avatar_url: null, created_at: new Date().toISOString() },
        }],
        error: null,
      }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const requests = await FriendService.getOutgoingRequests('test-user-id');
      expect(requests).toHaveLength(1);
      expect(requests[0].profile.username).toBe('target_user');
      expect(requests[0].friendship.requesterId).toBe('test-user-id');
    });

    it('should return empty array on error', async () => {
      const mockOrder = jest.fn(() => ({ data: null, error: { message: 'error' } }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const requests = await FriendService.getOutgoingRequests('test-user-id');
      expect(requests).toHaveLength(0);
    });

    it('should return empty array when no pending outgoing', async () => {
      const mockOrder = jest.fn(() => ({ data: [], error: null }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const requests = await FriendService.getOutgoingRequests('test-user-id');
      expect(requests).toHaveLength(0);
    });
  });

  describe('getFriendshipStatus', () => {
    // Helper: mock a chainable select().eq().eq().limit() query
    const mockEqChain = (data: any[] | null, error: any = null) => {
      const result = { data, error };
      const mockLimit = jest.fn(() => result);
      const mockEq2 = jest.fn(() => ({ limit: mockLimit }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      return { select: mockSelect };
    };

    it('should return none when no friendship exists', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([]))   // forward: empty
        .mockReturnValueOnce(mockEqChain([]));  // reverse: empty

      const result = await FriendService.getFriendshipStatus('user-a', 'user-b');
      expect(result.status).toBe('none');
      expect(result.friendshipId).toBeUndefined();
    });

    it('should return accepted when friends (forward direction)', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([{ id: 'fs-1', status: 'accepted' }]));

      const result = await FriendService.getFriendshipStatus('user-a', 'user-b');
      expect(result.status).toBe('accepted');
      expect(result.friendshipId).toBe('fs-1');
    });

    it('should return accepted when friends (reverse direction)', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([]))  // forward: empty
        .mockReturnValueOnce(mockEqChain([{ id: 'fs-1', status: 'accepted' }]));  // reverse: found

      const result = await FriendService.getFriendshipStatus('user-a', 'user-b');
      expect(result.status).toBe('accepted');
      expect(result.friendshipId).toBe('fs-1');
    });

    it('should return pending for pending request', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([{ id: 'fs-2', status: 'pending' }]));

      const result = await FriendService.getFriendshipStatus('user-a', 'user-b');
      expect(result.status).toBe('pending');
      expect(result.friendshipId).toBe('fs-2');
    });

    it('should return rejected for rejected request', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([{ id: 'fs-3', status: 'rejected' }]));

      const result = await FriendService.getFriendshipStatus('user-a', 'user-b');
      expect(result.status).toBe('rejected');
      expect(result.friendshipId).toBe('fs-3');
    });

    it('should return none on error', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain(null, { message: 'error' }))
        .mockReturnValueOnce(mockEqChain(null, { message: 'error' }));

      const result = await FriendService.getFriendshipStatus('user-a', 'user-b');
      expect(result.status).toBe('none');
    });

    it('should return none when data is null', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain(null))
        .mockReturnValueOnce(mockEqChain(null));

      const result = await FriendService.getFriendshipStatus('user-a', 'user-b');
      expect(result.status).toBe('none');
    });

    it('should return none when data array is empty', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockEqChain([]))
        .mockReturnValueOnce(mockEqChain([]));

      const result = await FriendService.getFriendshipStatus('user-a', 'user-b');
      expect(result.status).toBe('none');
    });
  });
});
