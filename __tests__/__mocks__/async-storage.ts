// Mock AsyncStorage for testing
const storage: Record<string, string> = {};

const AsyncStorage = {
  getItem: jest.fn(async (key: string) => {
    return storage[key] || null;
  }),
  setItem: jest.fn(async (key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete storage[key];
  }),
  clear: jest.fn(async () => {
    Object.keys(storage).forEach(key => delete storage[key]);
  }),
  getAllKeys: jest.fn(async () => Object.keys(storage)),
  multiGet: jest.fn(async (keys: string[]) => {
    return keys.map(key => [key, storage[key] || null]);
  }),
  multiSet: jest.fn(async (keyValuePairs: [string, string][]) => {
    keyValuePairs.forEach(([key, value]) => {
      storage[key] = value;
    });
  }),
  // Helper for tests to reset storage
  __reset: () => {
    Object.keys(storage).forEach(key => delete storage[key]);
  },
  __getStorage: () => storage,
};

export default AsyncStorage;
