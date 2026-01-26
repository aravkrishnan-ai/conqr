// Mock expo-keep-awake for testing
export const activateKeepAwakeAsync = jest.fn(async () => {});
export const deactivateKeepAwake = jest.fn(async () => {});

export default {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
};
