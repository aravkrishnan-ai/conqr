export type AnalyticsEventType =
    // Engagement
    | 'session_start'
    | 'session_end'
    | 'screen_view'
    // Features
    | 'activity_started'
    | 'activity_completed'
    | 'activity_saved'
    | 'territory_claimed'
    | 'territory_invaded'
    | 'post_created'
    | 'post_liked'
    | 'comment_added'
    | 'friend_request_sent'
    | 'friend_request_accepted'
    | 'share_initiated'
    // Errors
    | 'error'
    | 'crash';

export interface AnalyticsEvent {
    id: string;
    user_id: string;
    event_type: AnalyticsEventType;
    screen_name?: string;
    session_id: string;
    metadata: Record<string, any>;
    created_at: string;
}
