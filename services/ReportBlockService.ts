import { supabase } from '../lib/supabase';

export const ReportBlockService = {
    async reportContent(
        reportedUserId: string,
        reportType: 'post' | 'comment' | 'user',
        reason: 'spam' | 'harassment' | 'inappropriate' | 'other',
        targetId?: string,
        description?: string,
    ): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { error } = await supabase.from('user_reports').insert({
            reporter_id: session.user.id,
            reported_user_id: reportedUserId,
            report_type: reportType,
            target_id: targetId || null,
            reason,
            description: description || null,
        });

        if (error) throw error;
    },

    async blockUser(blockedId: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { error } = await supabase.from('user_blocks').insert({
            blocker_id: session.user.id,
            blocked_id: blockedId,
        });

        // Ignore duplicate block errors
        if (error && !error.message?.includes('duplicate')) throw error;
    },

    async unblockUser(blockedId: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Must be signed in');

        const { error } = await supabase.from('user_blocks')
            .delete()
            .eq('blocker_id', session.user.id)
            .eq('blocked_id', blockedId);

        if (error) throw error;
    },

    async getBlockedUserIds(): Promise<string[]> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return [];

        const { data, error } = await supabase.from('user_blocks')
            .select('blocked_id')
            .eq('blocker_id', session.user.id);

        if (error || !data) return [];
        return data.map((row: any) => row.blocked_id);
    },

    async isBlocked(userId: string): Promise<boolean> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return false;

        const { data, error } = await supabase.from('user_blocks')
            .select('id')
            .eq('blocker_id', session.user.id)
            .eq('blocked_id', userId)
            .maybeSingle();

        if (error) return false;
        return !!data;
    },
};
