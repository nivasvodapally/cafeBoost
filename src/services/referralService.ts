import { supabase } from '../integrations/supabase/client';
import type { Database } from '../integrations/supabase/types';

type Referral = Database['public']['Tables']['referrals']['Row'];
type ReferralInsert = Database['public']['Tables']['referrals']['Insert'];
type ReferralUpdate = Database['public']['Tables']['referrals']['Update'];

export type ReferralStats = {
    referral_code: string | null;
    referred_by: string | null;
    referral_count: number;
    total_referral_rewards: number;
    pending_referrals: number;
    completed_referrals: number;
};

export type ReferralInfo = {
    referrer_name: string | null;
    referrer_email: string | null;
    referred_at: string;
    status: string;
    reward_points: number | null;
};

type ReferralWithJoins = {
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    reward_points: number | null;
    referred_id: string;
    cafe_id: string;
    profiles: { email: string; full_name: string | null } | null;
    cafes: { name: string } | null;
};

export class ReferralService {
    /**
     * Generate or get user's referral code
     */
    static async getOrCreateReferralCode(): Promise<string> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        // Check if user already has a referral code
        const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('referral_code')
            .eq('id', userId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error fetching referral code:', fetchError);
            throw fetchError;
        }

        if (profile?.referral_code) {
            return profile.referral_code;
        }

        // Generate new referral code
        const { data: newCode, error: generateError } = await supabase
            .rpc('generate_referral_code', { user_id: userId });

        if (generateError) {
            console.error('Error generating referral code:', generateError);
            throw generateError;
        }

        // Update profile with referral code
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ referral_code: newCode })
            .eq('id', userId);

        if (updateError) {
            console.error('Error updating profile with referral code:', updateError);
            throw updateError;
        }

        return newCode;
    }

    /**
     * Get user's referral statistics
     */
    static async getReferralStats(): Promise<ReferralStats> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        // Get profile with referral stats
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('referral_code, referred_by, referral_count, total_referral_rewards')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.error('Error fetching profile:', profileError);
            throw profileError;
        }

        // Get referral counts
        const { count: pendingCount, error: pendingError } = await supabase
            .from('referrals')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_id', userId)
            .eq('status', 'pending');

        const { count: completedCount, error: completedError } = await supabase
            .from('referrals')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_id', userId)
            .eq('status', 'completed');

        if (pendingError || completedError) {
            console.error('Error fetching referral counts:', pendingError || completedError);
        }

        return {
            referral_code: profile.referral_code,
            referred_by: profile.referred_by,
            referral_count: profile.referral_count || 0,
            total_referral_rewards: profile.total_referral_rewards || 0,
            pending_referrals: pendingCount || 0,
            completed_referrals: completedCount || 0
        };
    }

    /**
     * Create a new referral
     */
    static async createReferral(referredEmail: string, cafeId?: string): Promise<Referral> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        // Check if referred user exists
        const { data: referredUser, error: userError } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', referredEmail)
            .single();

        if (userError && userError.code !== 'PGRST116') {
            console.error('Error checking referred user:', userError);
            throw userError;
        }

        if (!referredUser) {
            throw new Error('Referred user not found. They need to sign up first.');
        }

        // Check if referral already exists
        const { data: existingReferral, error: checkError } = await supabase
            .from('referrals')
            .select('id')
            .eq('referred_id', referredUser.id)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking existing referral:', checkError);
            throw checkError;
        }

        if (existingReferral) {
            throw new Error('This user has already been referred.');
        }

        // Create referral
        const { data, error } = await supabase
            .from('referrals')
            .insert({
                referrer_id: userId,
                referred_id: referredUser.id,
                cafe_id: cafeId || null,
                status: 'pending',
                reward_points: cafeId ? await this.getCafeReferralReward(cafeId) : 100
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating referral:', error);
            throw error;
        }

        return data;
    }

    /**
     * Get cafe's referral reward points
     */
    static async getCafeReferralReward(cafeId: string): Promise<number> {
        const { data, error } = await supabase
            .from('cafes')
            .select('referral_reward_points')
            .eq('id', cafeId)
            .single();

        if (error) {
            console.error('Error fetching cafe referral reward:', error);
            return 100; // Default
        }

        return data.referral_reward_points || 100;
    }

    /**
     * Complete a referral (for staff)
     */
    static async completeReferral(referralId: string, cafeId: string): Promise<unknown> {
        const { data, error } = await supabase
            .rpc('complete_referral', {
                referral_id: referralId,
                cafe_id: cafeId
            });

        if (error) {
            console.error('Error completing referral:', error);
            throw error;
        }

        return data;
    }

    /**
     * Get user's referral history
     */
    static async getReferralHistory(): Promise<Array<{
        id: string;
        referred_user_email: string;
        referred_user_name: string | null;
        status: string;
        created_at: string;
        completed_at: string | null;
        reward_points: number | null;
        cafe_name: string | null;
    }>> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        const { data, error } = await supabase
            .from('referrals')
            .select(`
                id,
                status,
                created_at,
                completed_at,
                reward_points,
                referred_id,
                cafe_id,
                cafes(name),
                profiles!referrals_referred_id_fkey(email, full_name)
            `)
            .eq('referrer_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching referral history:', error);
            throw error;
        }

        return (data as ReferralWithJoins[]).map(ref => ({
            id: ref.id,
            referred_user_email: ref.profiles?.email || 'Unknown',
            referred_user_name: ref.profiles?.full_name || null,
            status: ref.status,
            created_at: ref.created_at,
            completed_at: ref.completed_at,
            reward_points: ref.reward_points,
            cafe_name: ref.cafes?.name || null
        }));
    }

    /**
     * Get referral info for the current user (who referred them)
     */
    static async getReferralInfo(): Promise<ReferralInfo | null> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('referred_by')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.error('Error fetching referral info:', profileError);
            return null;
        }

        if (!profile.referred_by) {
            return null;
        }

        // Get referral details
        const { data: referral, error: referralError } = await supabase
            .from('referrals')
            .select('*')
            .eq('referred_id', userId)
            .single();

        if (referralError) {
            console.error('Error fetching referral details:', referralError);
            return null;
        }

        // Get referrer info
        const { data: referrer, error: referrerError } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', profile.referred_by)
            .single();

        if (referrerError) {
            console.error('Error fetching referrer info:', referrerError);
        }

        return {
            referrer_name: referrer?.full_name || null,
            referrer_email: referrer?.email || null,
            referred_at: referral.created_at,
            status: referral.status,
            reward_points: referral.reward_points
        };
    }

    /**
     * Get pending referrals for a cafe (for staff)
     */
    static async getPendingReferrals(cafeId: string): Promise<Referral[]> {
        const { data, error } = await supabase
            .from('referrals')
            .select('*')
            .eq('cafe_id', cafeId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching pending referrals:', error);
            throw error;
        }

        return data || [];
    }

    /**
     * Share referral link
     */
    static getReferralLink(referralCode: string): string {
        const origin = window.location.origin;
        return `${origin}/signup?ref=${referralCode}`;
    }

    /**
     * Validate referral code
     */
    static async validateReferralCode(code: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', code)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error validating referral code:', error);
            return false;
        }

        return !!data;
    }

    /**
     * Apply referral code during signup
     */
    static async applyReferralCode(code: string, userId: string): Promise<void> {
        // Find referrer
        const { data: referrer, error: referrerError } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', code)
            .single();

        if (referrerError) {
            console.error('Error finding referrer:', referrerError);
            throw new Error('Invalid referral code');
        }

        // Update user's profile
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ referred_by: referrer.id })
            .eq('id', userId);

        if (updateError) {
            console.error('Error updating profile with referrer:', updateError);
            throw updateError;
        }

        // Create referral record
        const { error: referralError } = await supabase
            .from('referrals')
            .insert({
                referrer_id: referrer.id,
                referred_id: userId,
                status: 'pending'
            });

        if (referralError) {
            console.error('Error creating referral record:', referralError);
            // Don't throw - the referral was still applied to profile
        }
    }
}