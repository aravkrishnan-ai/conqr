import React, { useEffect, useState, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

type ToastType = 'success' | 'info' | 'error';

interface ToastMessage {
  text: string;
  type: ToastType;
  id: number;
}

const _listeners: Set<(msg: ToastMessage) => void> = new Set();
let _nextId = 0;

export function showToast(text: string, type: ToastType = 'info') {
  const msg: ToastMessage = { text, type, id: _nextId++ };
  for (const fn of _listeners) {
    try { fn(msg); } catch {}
  }
}

export function ToastContainer() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const listener = (msg: ToastMessage) => {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          msg.type === 'error'
            ? Haptics.NotificationFeedbackType.Error
            : Haptics.NotificationFeedbackType.Success
        ).catch(() => {});
      }
      setToast(msg);
      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 20, duration: 300, useNativeDriver: true }),
        ]).start(() => setToast(null));
      }, 2500);
    };

    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  if (!toast) return null;

  const bgColor = toast.type === 'success' ? '#10B981' : toast.type === 'error' ? '#FF3B30' : '#1A1A1A';

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bgColor, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.toastText}>{toast.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
