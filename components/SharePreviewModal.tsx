import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    Dimensions, ActivityIndicator, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Share2 } from 'lucide-react-native';
import { Activity, Territory, Post } from '../lib/types';
import { ImageShareService } from '../services/ImageShareService';
import ShareCardActivity from './ShareCardActivity';
import ShareCardTerritory from './ShareCardTerritory';
import ShareCardPost from './ShareCardPost';
import { SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, DOWNLOAD_URL, formatDistance, formatDuration, formatPace, formatArea } from '../utils/shareCardUtils';

// Try to import ViewShot - may not be available if native module isn't in the build
let ViewShot: any = null;
try {
    ViewShot = require('react-native-view-shot').default;
} catch {
    // Native module not available in this build
}

interface SharePreviewModalProps {
    visible: boolean;
    onClose: () => void;
    cardType: 'activity' | 'territory' | 'post';
    activity?: Activity;
    territory?: Territory;
    post?: Post;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const PREVIEW_PADDING = 32;
const PREVIEW_WIDTH = SCREEN_WIDTH - PREVIEW_PADDING * 2;
const SCALE = PREVIEW_WIDTH / SHARE_CARD_WIDTH;
const PREVIEW_HEIGHT = SHARE_CARD_HEIGHT * SCALE;

export default function SharePreviewModal({
    visible,
    onClose,
    cardType,
    activity,
    territory,
    post,
}: SharePreviewModalProps) {
    const viewShotRef = useRef<any>(null);
    const [sharing, setSharing] = useState(false);

    const handleTextFallback = async () => {
        const lines: string[] = [];
        if (cardType === 'activity' && activity) {
            lines.push(`${activity.type} on Conqr`);
            lines.push(`Distance: ${formatDistance(activity.distance)}`);
            lines.push(`Duration: ${formatDuration(activity.duration)}`);
            lines.push(`Pace: ${formatPace(activity.averageSpeed || 0)} /km`);
            if (territory) {
                lines.push(`Territory: ${territory.name || 'Unnamed'} (${formatArea(territory.area)})`);
            }
        } else if (cardType === 'territory' && territory) {
            lines.push(`Territory conquered on Conqr!`);
            lines.push(`${territory.name || 'Unnamed Territory'}`);
            lines.push(`Area: ${formatArea(territory.area)}`);
        } else if (cardType === 'post' && post) {
            if (post.content) {
                lines.push(post.content);
            }
            if (post.postType === 'activity_share' && post.activity) {
                lines.push('');
                lines.push(`${post.activity.type} - ${formatDistance(post.activity.distance)} in ${formatDuration(post.activity.duration)}`);
            } else if (post.postType === 'territory_share' && post.territory) {
                lines.push('');
                lines.push(`Territory: ${post.territory.name || 'Unnamed'} (${formatArea(post.territory.area)})`);
            }
        }
        lines.push('');
        lines.push(`Download Conqr Beta: ${DOWNLOAD_URL}`);

        await Share.share({ message: lines.join('\n'), title: 'Conqr' });
    };

    const handleShare = async () => {
        setSharing(true);
        try {
            // Try image capture if ViewShot is available
            if (ViewShot && viewShotRef.current) {
                try {
                    const uri = await viewShotRef.current.capture({
                        format: 'png',
                        quality: 0.9,
                        result: 'tmpfile',
                        width: 540,
                        height: 960,
                    });

                    if (uri) {
                        await ImageShareService.shareImage(uri);
                        return;
                    }
                } catch (captureErr) {
                    console.error('[Share] Image capture failed:', captureErr);
                    // Fall through to text fallback
                }
            }

            // Fallback to text sharing
            await handleTextFallback();
        } catch (err: any) {
            if (err?.message !== 'User did not share') {
                // Try text fallback on image share failure
                try {
                    await handleTextFallback();
                } catch {
                    // User cancelled
                }
            }
        } finally {
            setSharing(false);
        }
    };

    if (!visible) return null;

    const hasContent = cardType === 'activity' ? !!activity : cardType === 'territory' ? !!territory : !!post;

    const cardContent = (
        <>
            {cardType === 'activity' && activity ? (
                <ShareCardActivity activity={activity} territory={territory} />
            ) : cardType === 'territory' && territory ? (
                <ShareCardTerritory territory={territory} />
            ) : cardType === 'post' && post ? (
                <ShareCardPost post={post} />
            ) : null}
        </>
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="overFullScreen"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <X color="#FFFFFF" size={24} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Share</Text>
                        <View style={styles.closeBtnPlaceholder} />
                    </View>

                    {/* Preview */}
                    <View style={styles.previewContainer}>
                        <View style={styles.previewWrapper}>
                            <View style={{
                                width: PREVIEW_WIDTH,
                                height: PREVIEW_HEIGHT,
                                overflow: 'hidden',
                                borderRadius: 16,
                            }}>
                                {ViewShot ? (
                                    <ViewShot
                                        ref={viewShotRef}
                                        options={{ format: 'png', quality: 1 }}
                                        style={{
                                            width: SHARE_CARD_WIDTH,
                                            height: SHARE_CARD_HEIGHT,
                                            transform: [{ scale: SCALE }],
                                            transformOrigin: 'top left',
                                        }}
                                    >
                                        {cardContent}
                                    </ViewShot>
                                ) : (
                                    <View style={{
                                        width: SHARE_CARD_WIDTH,
                                        height: SHARE_CARD_HEIGHT,
                                        transform: [{ scale: SCALE }],
                                        transformOrigin: 'top left',
                                    }}>
                                        {cardContent}
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={[styles.shareBtn, (!hasContent || sharing) && styles.shareBtnDisabled]}
                            onPress={handleShare}
                            disabled={!hasContent || sharing}
                        >
                            {sharing ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <>
                                    <Share2 color="#FFFFFF" size={20} />
                                    <Text style={styles.shareBtnText}>Share</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
    },
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeBtnPlaceholder: {
        width: 40,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
    previewContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: PREVIEW_PADDING,
    },
    previewWrapper: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#E65100',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    actions: {
        paddingHorizontal: 20,
        paddingVertical: 20,
        gap: 12,
    },
    shareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#E65100',
        paddingVertical: 16,
        borderRadius: 14,
        gap: 10,
    },
    shareBtnDisabled: {
        backgroundColor: '#666666',
    },
    shareBtnText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '600',
    },
});
