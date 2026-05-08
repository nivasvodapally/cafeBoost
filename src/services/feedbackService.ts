import { supabase } from '../integrations/supabase/client';
import type { Database } from '../integrations/supabase/types';

// Temporary types since customer_feedback table doesn't exist in current types
type CustomerFeedback = {
  id: string;
  cafe_id: string;
  customer_id: string;
  order_id: string | null;
  booking_id: string | null;
  rating: number;
  category: string;
  comments: string | null;
  anonymous: boolean;
  responded: boolean;
  response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at?: string;
};

type CustomerFeedbackInsert = Omit<CustomerFeedback, 'id' | 'created_at'>;
type CustomerFeedbackUpdate = Partial<CustomerFeedbackInsert>;

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type OrderRow = Database['public']['Tables']['orders']['Row'];
type BookingRow = Database['public']['Tables']['bookings']['Row'];

// Type for the query result with joined data
type FeedbackQueryResult = CustomerFeedback & {
  profiles?: { full_name: string | null; email: string } | null;
  orders?: { order_number: string; total_amount: number } | null;
  bookings?: { party_size: number; scheduled_for: string } | null;
  profiles_responder?: { full_name: string | null; email: string } | null;
};

export type FeedbackInput = {
    cafeId: string;
    rating: number;
    category: 'food_quality' | 'service' | 'ambience' | 'speed' | 'value' | 'overall';
    comments?: string;
    anonymous?: boolean;
    orderId?: string;
    bookingId?: string;
};

export type FeedbackAnalytics = {
    total_feedback: number;
    average_rating: number;
    category_ratings: Record<string, { count: number; avg_rating: number }>;
    rating_distribution: Record<string, number>;
    response_rate: number;
};

export type FeedbackWithDetails = CustomerFeedback & {
    customer?: {
        full_name: string | null;
        email: string;
    };
    order?: {
        order_number: string;
        total_amount: number;
    } | null;
    booking?: {
        party_size: number;
        scheduled_for: string;
    } | null;
    responder?: {
        full_name: string | null;
        email: string;
    } | null;
};

export class FeedbackService {
    /**
     * Submit feedback
     */
    static async submitFeedback(input: FeedbackInput): Promise<CustomerFeedback> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        const { data, error } = await supabase
            .from('customer_feedback')
            .insert({
                customer_id: userId,
                cafe_id: input.cafeId,
                order_id: input.orderId || null,
                booking_id: input.bookingId || null,
                rating: input.rating,
                category: input.category,
                comments: input.comments || null,
                anonymous: input.anonymous || false
            })
            .select()
            .single();

        if (error) {
            console.error('Error submitting feedback:', error);
            throw error;
        }

        // If cafe has auto-response enabled, send thank you message
        await this.maybeSendAutoResponse(input.cafeId, data.id);

        return data;
    }

    /**
     * Get feedback for the current user
     */
    static async getUserFeedback(cafeId?: string): Promise<FeedbackWithDetails[]> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        const query = supabase
            .from('customer_feedback')
            .select(`
                *,
                profiles!customer_feedback_customer_id_fkey(full_name, email),
                orders(order_number, total_amount),
                bookings(party_size, scheduled_for),
                profiles!customer_feedback_responded_by_fkey(full_name, email)
            `)
            .eq('customer_id', userId)
            .order('created_at', { ascending: false });

        if (cafeId) {
            query.eq('cafe_id', cafeId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching user feedback:', error);
            throw error;
        }

        return data.map((item: FeedbackQueryResult) => ({
            ...item,
            customer: item.profiles ? {
                full_name: item.profiles.full_name,
                email: item.profiles.email
            } : undefined,
            order: item.orders ? {
                order_number: item.orders.order_number,
                total_amount: item.orders.total_amount
            } : null,
            booking: item.bookings ? {
                party_size: item.bookings.party_size,
                scheduled_for: item.bookings.scheduled_for
            } : null,
            responder: item.profiles_responder ? {
                full_name: item.profiles_responder.full_name,
                email: item.profiles_responder.email
            } : null
        })) as FeedbackWithDetails[];
    }

    /**
     * Get feedback for a cafe (staff view)
     */
    static async getCafeFeedback(
        cafeId: string,
        options: {
            limit?: number;
            offset?: number;
            category?: string;
            minRating?: number;
            maxRating?: number;
            responded?: boolean;
            startDate?: Date;
            endDate?: Date;
        } = {}
    ): Promise<{ feedback: FeedbackWithDetails[]; total: number }> {
        const {
            limit = 20,
            offset = 0,
            category,
            minRating,
            maxRating,
            responded,
            startDate,
            endDate
        } = options;

        let query = supabase
            .from('customer_feedback')
            .select(`
                *,
                profiles!customer_feedback_customer_id_fkey(full_name, email),
                orders(order_number, total_amount),
                bookings(party_size, scheduled_for),
                profiles!customer_feedback_responded_by_fkey(full_name, email)
            `, { count: 'exact' })
            .eq('cafe_id', cafeId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (category) {
            query = query.eq('category', category);
        }

        if (minRating !== undefined) {
            query = query.gte('rating', minRating);
        }

        if (maxRating !== undefined) {
            query = query.lte('rating', maxRating);
        }

        if (responded !== undefined) {
            query = query.eq('responded', responded);
        }

        if (startDate) {
            query = query.gte('created_at', startDate.toISOString());
        }

        if (endDate) {
            query = query.lte('created_at', endDate.toISOString());
        }

        const { data, error, count } = await query;

        if (error) {
            console.error('Error fetching cafe feedback:', error);
            throw error;
        }

        const feedback = data.map((item: FeedbackQueryResult) => ({
            ...item,
            customer: item.profiles ? {
                full_name: item.profiles.full_name,
                email: item.profiles.email
            } : undefined,
            order: item.orders ? {
                order_number: item.orders.order_number,
                total_amount: item.orders.total_amount
            } : null,
            booking: item.bookings ? {
                party_size: item.bookings.party_size,
                scheduled_for: item.bookings.scheduled_for
            } : null,
            responder: item.profiles_responder ? {
                full_name: item.profiles_responder.full_name,
                email: item.profiles_responder.email
            } : null
        })) as FeedbackWithDetails[];

        return { feedback, total: count || 0 };
    }

    /**
     * Get feedback analytics for a cafe
     */
    static async getFeedbackAnalytics(
        cafeId: string,
        days: number = 30
    ): Promise<FeedbackAnalytics> {
        const { data, error } = await supabase
            .rpc('get_cafe_feedback_analytics', {
                p_cafe_id: cafeId,
                p_days: days
            });

        if (error) {
            console.error('Error fetching feedback analytics:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            return {
                total_feedback: 0,
                average_rating: 0,
                category_ratings: {},
                rating_distribution: {},
                response_rate: 0
            };
        }

        return data[0] as FeedbackAnalytics;
    }

    /**
     * Respond to feedback (staff)
     */
    static async respondToFeedback(
        feedbackId: string,
        response: string
    ): Promise<CustomerFeedback> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        const { data, error } = await supabase
            .from('customer_feedback')
            .update({
                responded: true,
                response: response,
                responded_by: userId,
                responded_at: new Date().toISOString()
            })
            .eq('id', feedbackId)
            .select()
            .single();

        if (error) {
            console.error('Error responding to feedback:', error);
            throw error;
        }

        return data;
    }

    /**
     * Update feedback (user can update their own feedback)
     */
    static async updateFeedback(
        feedbackId: string,
        updates: Partial<{
            rating: number;
            category: string;
            comments: string;
            anonymous: boolean;
        }>
    ): Promise<CustomerFeedback> {
        const { data, error } = await supabase
            .from('customer_feedback')
            .update(updates)
            .eq('id', feedbackId)
            .select()
            .single();

        if (error) {
            console.error('Error updating feedback:', error);
            throw error;
        }

        return data;
    }

    /**
     * Delete feedback (user can delete their own feedback)
     */
    static async deleteFeedback(feedbackId: string): Promise<void> {
        const { error } = await supabase
            .from('customer_feedback')
            .delete()
            .eq('id', feedbackId);

        if (error) {
            console.error('Error deleting feedback:', error);
            throw error;
        }
    }

    /**
     * Check if user has already submitted feedback for an order/booking
     */
    static async hasSubmittedFeedback(
        orderId?: string,
        bookingId?: string
    ): Promise<boolean> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            return false;
        }

        const query = supabase
            .from('customer_feedback')
            .select('id')
            .eq('customer_id', userId);

        if (orderId) {
            query.eq('order_id', orderId);
        } else if (bookingId) {
            query.eq('booking_id', bookingId);
        } else {
            return false;
        }

        const { data, error } = await query.single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error checking feedback submission:', error);
            return false;
        }

        return !!data;
    }

    /**
     * Get recent feedback for dashboard
     */
    static async getRecentFeedback(
        cafeId: string,
        limit: number = 10
    ): Promise<FeedbackWithDetails[]> {
        const { data, error } = await supabase
            .from('customer_feedback')
            .select(`
                *,
                profiles!customer_feedback_customer_id_fkey(full_name, email),
                orders(order_number, total_amount)
            `)
            .eq('cafe_id', cafeId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching recent feedback:', error);
            throw error;
        }

        return data.map((item: FeedbackQueryResult) => ({
            ...item,
            customer: item.profiles ? {
                full_name: item.profiles.full_name,
                email: item.profiles.email
            } : undefined,
            order: item.orders ? {
                order_number: item.orders.order_number,
                total_amount: item.orders.total_amount
            } : null
        })) as FeedbackWithDetails[];
    }

    /**
     * Get feedback summary for cafe dashboard
     */
    static async getFeedbackSummary(cafeId: string): Promise<{
        total: number;
        averageRating: number;
        responseRate: number;
        recentCount: number;
        lowRatingCount: number;
    }> {
        const analytics = await this.getFeedbackAnalytics(cafeId, 7); // Last 7 days

        // Count low ratings (1-2 stars)
        const lowRatingCount = Object.entries(analytics.rating_distribution)
            .filter(([rating]) => parseInt(rating) <= 2)
            .reduce((sum, [, count]) => sum + count, 0);

        return {
            total: analytics.total_feedback,
            averageRating: analytics.average_rating,
            responseRate: analytics.response_rate,
            recentCount: analytics.total_feedback,
            lowRatingCount
        };
    }

    /**
     * Send auto-response if cafe has it enabled
     */
    private static async maybeSendAutoResponse(cafeId: string, feedbackId: string): Promise<void> {
        try {
            const { data: cafe, error } = await supabase
                .from('cafes')
                .select('auto_response_feedback, feedback_thank_you_message')
                .eq('id', cafeId)
                .single();

            if (error || !cafe?.auto_response_feedback) {
                return;
            }

            // Auto-respond to the feedback
            await this.respondToFeedback(
                feedbackId,
                cafe.feedback_thank_you_message || 'Thank you for your feedback! We appreciate your input.'
            );
        } catch (error) {
            console.error('Error sending auto-response:', error);
            // Don't throw - auto-response is optional
        }
    }

    /**
     * Export feedback as CSV
     */
    static async exportFeedbackAsCSV(
        cafeId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<string> {
        const { feedback } = await this.getCafeFeedback(cafeId, {
            limit: 1000, // Maximum for export
            startDate,
            endDate
        });

        const headers = [
            'Date',
            'Customer',
            'Rating',
            'Category',
            'Comments',
            'Anonymous',
            'Order Number',
            'Booking Date',
            'Responded',
            'Response',
            'Response Date'
        ];

        const rows = feedback.map(f => [
            new Date(f.created_at).toLocaleDateString(),
            f.anonymous ? 'Anonymous' : (f.customer?.full_name || f.customer?.email || 'Unknown'),
            f.rating.toString(),
            f.category,
            `"${(f.comments || '').replace(/"/g, '""')}"`,
            f.anonymous ? 'Yes' : 'No',
            f.order?.order_number || '',
            f.booking?.scheduled_for ? new Date(f.booking.scheduled_for).toLocaleDateString() : '',
            f.responded ? 'Yes' : 'No',
            f.response ? `"${f.response.replace(/"/g, '""')}"` : '',
            f.responded_at ? new Date(f.responded_at).toLocaleDateString() : ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csvContent;
    }
}