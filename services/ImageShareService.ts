import * as Sharing from 'expo-sharing';

export const ImageShareService = {
    async shareImage(imageUri: string): Promise<void> {
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
            throw new Error('Sharing not available on this device');
        }
        await Sharing.shareAsync(imageUri, {
            mimeType: 'image/png',
            dialogTitle: 'Share your Conqr activity',
            UTI: 'public.png',
        });
    },
};
