// Mock React Native for testing
export const Platform = {
  OS: 'ios',
  Version: '14.0',
  select: (obj: any) => obj.ios || obj.default,
};

export const Alert = {
  alert: jest.fn(),
};

export const StyleSheet = {
  create: (styles: any) => styles,
  flatten: (style: any) => style,
  absoluteFillObject: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  absoluteFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
};

export default {
  Platform,
  Alert,
  StyleSheet,
};
