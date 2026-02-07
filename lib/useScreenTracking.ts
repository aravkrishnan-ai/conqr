import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AnalyticsService } from '../services/AnalyticsService';

export function useScreenTracking(screenName: string): void {
    useFocusEffect(
        useCallback(() => {
            AnalyticsService.trackScreenView(screenName);
        }, [screenName])
    );
}
