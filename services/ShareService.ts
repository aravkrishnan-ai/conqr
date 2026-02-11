import { Share } from 'react-native';
import { Activity, Territory, Post } from '../lib/types';
import { DOWNLOAD_URL } from '../utils/shareCardUtils';

export const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
};

export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
};

export const formatPace = (speedMs: number): string => {
    if (!speedMs || speedMs <= 0) return '--:--';
    const paceSecondsPerKm = 1000 / speedMs;
    const minutes = Math.floor(paceSecondsPerKm / 60);
    const seconds = Math.floor(paceSecondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatArea = (sqMeters: number): string => {
    if (sqMeters < 10000) return `${Math.round(sqMeters)} m²`;
    return `${(sqMeters / 10000).toFixed(2)} ha`;
};

export const ShareService = {
    async shareActivity(activity: Activity, territory?: Territory): Promise<void> {
        const lines: string[] = [
            `${activity.type} on Conqr`,
            '',
            `Distance: ${formatDistance(activity.distance)}`,
            `Duration: ${formatDuration(activity.duration)}`,
            `Pace: ${formatPace(activity.averageSpeed || 0)} min/km`,
        ];

        if (territory) {
            lines.push('');
            lines.push(`Territory claimed: ${territory.name || 'Unnamed Territory'}`);
            lines.push(`Area: ${formatArea(territory.area)}`);
        }

        lines.push('');
        lines.push(`Download Conqr Beta: ${DOWNLOAD_URL}`);

        try {
            await Share.share({
                message: lines.join('\n'),
                title: `${activity.type} on Conqr`,
            });
        } catch {
            // User cancelled or error
        }
    },

    async shareTerritory(territory: Territory): Promise<void> {
        const lines: string[] = [
            `Territory conquered on Conqr!`,
            '',
            `Name: ${territory.name || 'Unnamed Territory'}`,
            `Area: ${formatArea(territory.area)}`,
            `Perimeter: ${formatDistance(territory.perimeter)}`,
            '',
            `Download Conqr Beta: ${DOWNLOAD_URL}`,
        ];

        try {
            await Share.share({
                message: lines.join('\n'),
                title: 'Territory on Conqr',
            });
        } catch {
            // User cancelled or error
        }
    },

    async sharePost(post: Post): Promise<void> {
        const lines: string[] = [];

        if (post.content) {
            lines.push(post.content);
        }

        if (post.postType === 'activity_share') {
            lines.push('');
            lines.push('Activity shared on Conqr');
        } else if (post.postType === 'territory_share') {
            lines.push('');
            lines.push('Territory shared on Conqr');
        }

        lines.push('');
        lines.push(`Download Conqr Beta: ${DOWNLOAD_URL}`);

        try {
            await Share.share({
                message: lines.join('\n'),
                title: 'Conqr Post',
            });
        } catch {
            // User cancelled or error
        }
    },
};
