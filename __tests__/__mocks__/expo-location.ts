// Mock expo-location for testing
export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export const requestForegroundPermissionsAsync = jest.fn(async () => ({
  status: 'granted',
  granted: true,
  canAskAgain: true,
}));

export const watchPositionAsync = jest.fn(async (options: any, callback: any) => {
  return {
    remove: jest.fn(),
  };
});

export const getCurrentPositionAsync = jest.fn(async () => ({
  coords: {
    latitude: 37.7749,
    longitude: -122.4194,
    altitude: 0,
    accuracy: 10,
    altitudeAccuracy: 10,
    heading: 0,
    speed: 1.5,
  },
  timestamp: Date.now(),
}));

export default {
  Accuracy,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
  getCurrentPositionAsync,
};
