// Test setup file
import AsyncStorage from './__mocks__/async-storage';

// Reset mocks and storage before each test
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any).__reset();
});

// Mock console methods to reduce noise (optional - comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Mock supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: {
            user: { id: 'test-user-id' }
          }
        }
      })),
      signOut: jest.fn(async () => ({})),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            data: [],
            error: null
          }))
        }))
      })),
      insert: jest.fn(() => ({ error: null })),
      upsert: jest.fn(() => ({ error: null })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({ error: null }))
      })),
    })),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9)),
}));
