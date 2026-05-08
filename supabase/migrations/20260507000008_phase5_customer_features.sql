-- PHASE 5: Customer System Enhancement
-- Adds customer favorites, enhanced referral system, and feedback system

-- 1. Customer Favorites System
CREATE TABLE IF NOT EXISTS public.customer_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    UNIQUE(customer_id, cafe_id, menu_item_id)
);

-- Add RLS policies for customer favorites
ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;

-- Customers can only see their own favorites
CREATE POLICY "Customers can view own favorites"
    ON public.customer_favorites
    FOR SELECT
    USING (auth.uid() = customer_id);

-- Customers can insert their own favorites
CREATE POLICY "Customers can insert own favorites"
    ON public.customer_favorites
    FOR INSERT
    WITH CHECK (auth.uid() = customer_id);

-- Customers can delete their own favorites
CREATE POLICY "Customers can delete own favorites"
    ON public.customer_favorites
    FOR DELETE
    USING (auth.uid() = customer_id);

-- Cafe staff can view favorites for their cafe (for analytics)
CREATE POLICY "Staff can view favorites for their cafe"
    ON public.customer_favorites
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.cafe_staff sa
            WHERE sa.user_id = auth.uid()
            AND sa.cafe_id = customer_favorites.cafe_id
        )
    );

-- 2. Enhanced Referral System
-- Add referral tracking columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_referral_rewards INTEGER DEFAULT 0;

-- Create referral tracking table
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cafe_id UUID REFERENCES public.cafes(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
    reward_points INTEGER DEFAULT 0,
    reward_awarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(referred_id) -- A user can only be referred once
);

-- Add RLS policies for referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can view referrals they made or were referred by
CREATE POLICY "Users can view own referrals"
    ON public.referrals
    FOR SELECT
    USING (
        auth.uid() = referrer_id 
        OR auth.uid() = referred_id
        OR EXISTS (
            SELECT 1 FROM public.cafe_staff sa
            WHERE sa.user_id = auth.uid()
            AND sa.cafe_id = referrals.cafe_id
        )
    );

-- Users can insert referrals they make
CREATE POLICY "Users can insert own referrals"
    ON public.referrals
    FOR INSERT
    WITH CHECK (auth.uid() = referrer_id);

-- Cafe staff can update referral status for their cafe
CREATE POLICY "Staff can update referrals for their cafe"
    ON public.referrals
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.cafe_staff sa
            WHERE sa.user_id = auth.uid()
            AND sa.cafe_id = referrals.cafe_id
        )
    );

-- 3. Customer Feedback System
CREATE TABLE IF NOT EXISTS public.customer_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    category TEXT NOT NULL CHECK (category IN ('food_quality', 'service', 'ambience', 'speed', 'value', 'overall')),
    comments TEXT,
    anonymous BOOLEAN DEFAULT FALSE,
    responded BOOLEAN DEFAULT FALSE,
    response TEXT,
    responded_by UUID REFERENCES public.profiles(id),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add RLS policies for customer feedback
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

-- Customers can view and insert their own feedback
CREATE POLICY "Customers can view own feedback"
    ON public.customer_feedback
    FOR SELECT
    USING (
        auth.uid() = customer_id
        OR EXISTS (
            SELECT 1 FROM public.cafe_staff sa
            WHERE sa.user_id = auth.uid()
            AND sa.cafe_id = customer_feedback.cafe_id
        )
    );

CREATE POLICY "Customers can insert own feedback"
    ON public.customer_feedback
    FOR INSERT
    WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update own feedback"
    ON public.customer_feedback
    FOR UPDATE
    USING (auth.uid() = customer_id)
    WITH CHECK (auth.uid() = customer_id);

-- Cafe staff can view all feedback for their cafe and respond
CREATE POLICY "Staff can view feedback for their cafe"
    ON public.customer_feedback
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.cafe_staff sa
            WHERE sa.user_id = auth.uid()
            AND sa.cafe_id = customer_feedback.cafe_id
        )
    );

CREATE POLICY "Staff can respond to feedback"
    ON public.customer_feedback
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.cafe_staff sa
            WHERE sa.user_id = auth.uid()
            AND sa.cafe_id = customer_feedback.cafe_id
        )
    );

-- 4. Functions for customer features

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    code TEXT;
    base_code TEXT;
    suffix INTEGER := 0;
BEGIN
    -- Get user initials or first 3 chars of email
    SELECT SUBSTRING(
        COALESCE(
            (SELECT full_name FROM public.profiles WHERE id = user_id),
            (SELECT email FROM auth.users WHERE id = user_id::text)
        ) FROM 1 FOR 3
    ) INTO base_code;
    
    base_code := UPPER(REGEXP_REPLACE(base_code, '[^A-Za-z]', 'X'));
    
    -- Ensure at least 3 characters
    IF LENGTH(base_code) < 3 THEN
        base_code := 'REF';
    END IF;
    
    -- Try to find unique code
    LOOP
        IF suffix = 0 THEN
            code := base_code;
        ELSE
            code := base_code || suffix::TEXT;
        END IF;
        
        -- Check if code exists
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code) THEN
            RETURN code;
        END IF;
        
        suffix := suffix + 1;
        
        -- Safety break
        IF suffix > 999 THEN
            code := base_code || EXTRACT(EPOCH FROM NOW())::INTEGER::TEXT;
            RETURN SUBSTRING(code FROM 1 FOR 10);
        END IF;
    END LOOP;
END;
$$;

-- Function to process referral completion
CREATE OR REPLACE FUNCTION public.complete_referral(referral_id UUID, cafe_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_referrer_id UUID;
    v_referred_id UUID;
    v_reward_points INTEGER;
    result JSONB;
BEGIN
    -- Get referral details
    SELECT referrer_id, referred_id, reward_points
    INTO v_referrer_id, v_referred_id, v_reward_points
    FROM public.referrals
    WHERE id = referral_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Referral not found or already processed');
    END IF;
    
    -- Update referral status
    UPDATE public.referrals
    SET 
        status = 'completed',
        completed_at = NOW(),
        reward_awarded_at = NOW(),
        cafe_id = cafe_id
    WHERE id = referral_id;
    
    -- Update referrer's stats
    UPDATE public.profiles
    SET 
        referral_count = COALESCE(referral_count, 0) + 1,
        total_referral_rewards = COALESCE(total_referral_rewards, 0) + COALESCE(v_reward_points, 100)
    WHERE id = v_referrer_id;
    
    -- Award loyalty points to referrer
    INSERT INTO public.loyalty_points (
        customer_id,
        cafe_id,
        points,
        kind,
        source_id,
        expires_at
    ) VALUES (
        v_referrer_id,
        cafe_id,
        COALESCE(v_reward_points, 100),
        'referral',
        referral_id,
        NOW() + INTERVAL '1 year'
    );
    
    -- Award welcome points to referred user
    INSERT INTO public.loyalty_points (
        customer_id,
        cafe_id,
        points,
        kind,
        source_id,
        expires_at
    ) VALUES (
        v_referred_id,
        cafe_id,
        50, -- Welcome bonus
        'referral',
        referral_id,
        NOW() + INTERVAL '1 year'
    );
    
    result := jsonb_build_object(
        'success', true,
        'message', 'Referral completed successfully',
        'referrer_id', v_referrer_id,
        'referred_id', v_referred_id,
        'reward_points', COALESCE(v_reward_points, 100)
    );
    
    RETURN result;
END;
$$;

-- Function to get customer favorites with menu details
CREATE OR REPLACE FUNCTION public.get_customer_favorites(p_customer_id UUID, p_cafe_id UUID DEFAULT NULL)
RETURNS TABLE (
    favorite_id UUID,
    menu_item_id UUID,
    item_name TEXT,
    item_description TEXT,
    item_price INTEGER,
    item_image_url TEXT,
    category TEXT,
    added_at TIMESTAMPTZ,
    notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cf.id AS favorite_id,
        mi.id AS menu_item_id,
        mi.name AS item_name,
        mi.description AS item_description,
        mi.price AS item_price,
        mi.image_url AS item_image_url,
        mi.category AS category,
        cf.added_at,
        cf.notes
    FROM public.customer_favorites cf
    JOIN public.menu_items mi ON cf.menu_item_id = mi.id
    WHERE cf.customer_id = p_customer_id
    AND (p_cafe_id IS NULL OR cf.cafe_id = p_cafe_id)
    ORDER BY cf.added_at DESC;
END;
$$;

-- Function to get cafe feedback analytics
CREATE OR REPLACE FUNCTION public.get_cafe_feedback_analytics(p_cafe_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    total_feedback INTEGER,
    average_rating NUMERIC,
    category_ratings JSONB,
    rating_distribution JSONB,
    response_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total INTEGER;
    v_avg_rating NUMERIC;
    v_response_rate NUMERIC;
BEGIN
    -- Total feedback and average rating
    SELECT 
        COUNT(*),
        AVG(rating::NUMERIC)
    INTO v_total, v_avg_rating
    FROM public.customer_feedback
    WHERE cafe_id = p_cafe_id
    AND created_at >= NOW() - (p_days || ' days')::INTERVAL;
    
    -- Category ratings
    RETURN QUERY
    WITH category_stats AS (
        SELECT 
            category,
            COUNT(*) as count,
            AVG(rating::NUMERIC) as avg_rating
        FROM public.customer_feedback
        WHERE cafe_id = p_cafe_id
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY category
    ),
    rating_dist AS (
        SELECT 
            rating,
            COUNT(*) as count
        FROM public.customer_feedback
        WHERE cafe_id = p_cafe_id
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY rating
        ORDER BY rating
    ),
    response_stats AS (
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE responded = true) as responded_count
        FROM public.customer_feedback
        WHERE cafe_id = p_cafe_id
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL
    )
    SELECT 
        COALESCE(v_total, 0)::INTEGER as total_feedback,
        ROUND(COALESCE(v_avg_rating, 0), 2) as average_rating,
        COALESCE(
            jsonb_object_agg(category_stats.category, 
                jsonb_build_object('count', category_stats.count, 'avg_rating', ROUND(category_stats.avg_rating, 2))
            ),
            '{}'::jsonb
        ) as category_ratings,
        COALESCE(
            jsonb_object_agg(rating_dist.rating::TEXT, rating_dist.count),
            '{}'::jsonb
        ) as rating_distribution,
        CASE 
            WHEN rs.total > 0 THEN ROUND((rs.responded_count::NUMERIC / rs.total) * 100, 2)
            ELSE 0
        END as response_rate
    FROM category_stats, rating_dist, response_stats rs
    GROUP BY rs.total, rs.responded_count;
END;
$$;

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_favorites_customer_cafe 
    ON public.customer_favorites(customer_id, cafe_id);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_menu_item 
    ON public.customer_favorites(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer 
    ON public.referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referred 
    ON public.referrals(referred_id);

CREATE INDEX IF NOT EXISTS idx_referrals_status 
    ON public.referrals(status);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_cafe_created 
    ON public.customer_feedback(cafe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_customer 
    ON public.customer_feedback(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_rating 
    ON public.customer_feedback(rating);

-- 6. Update triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customer_feedback_updated_at
    BEFORE UPDATE ON public.customer_feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Add sample referral codes for existing users (optional)
-- Uncomment if you want to generate referral codes for existing users
-- UPDATE public.profiles 
-- SET referral_code = public.generate_referral_code(id)
-- WHERE referral_code IS NULL;

-- 8. Add feedback settings to cafes table
ALTER TABLE public.cafes
ADD COLUMN IF NOT EXISTS feedback_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS referral_reward_points INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS auto_response_feedback BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS feedback_thank_you_message TEXT DEFAULT 'Thank you for your feedback! We appreciate your input.';

COMMENT ON COLUMN public.cafes.feedback_enabled IS 'Whether feedback collection is enabled for this cafe';
COMMENT ON COLUMN public.cafes.referral_reward_points IS 'Points awarded for successful referrals';
COMMENT ON COLUMN public.cafes.auto_response_feedback IS 'Whether to automatically send thank you message for feedback';
COMMENT ON COLUMN public.cafes.feedback_thank_you_message IS 'Default thank you message for feedback submissions';