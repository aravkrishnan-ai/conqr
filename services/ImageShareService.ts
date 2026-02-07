import * as Sharing from 'expo-sharing';
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy';

export const ImageShareService = {
    async shareImage(imageUri: string): Promise<void> {
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
            throw new Error('Sharing not available on this device');
        }

        // Copy to cache directory so content provider can share it with external apps
        let shareUri = imageUri;
        try {
            if (cacheDirectory && !imageUri.includes(cacheDirectory)) {
                const filename = `conqr-share-${Date.now()}.png`;
                const destUri = `${cacheDirectory}${filename}`;
                await copyAsync({ from: imageUri, to: destUri });
                shareUri = destUri;
            }
        } catch {
            // Fall through to try sharing with original URI
        }

        await Sharing.shareAsync(shareUri, {
            mimeType: 'image/png',
            dialogTitle: 'Share your Conqr activity',
            UTI: 'public.png',
        });
    },
};
