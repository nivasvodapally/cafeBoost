import { supabase } from '../integrations/supabase/client';
import type { Database } from '../integrations/supabase/types';

type CustomerFavorite = Database['public']['Tables']['customer_favorites']['Row'];
type CustomerFavoriteInsert = Database['public']['Tables']['customer_favorites']['Insert'];
type CustomerFavoriteUpdate = Database['public']['Tables']['customer_favorites']['Update'];

export type FavoriteMenuItem = {
    favorite_id: string;
    menu_item_id: string;
    item_name: string;
    item_description: string | null;
    item_price: number;
    item_image_url: string | null;
    category: string;
    added_at: string;
    notes: string | null;
};

export class CustomerFavoritesService {
    /**
     * Get all favorites for the current customer
     */
    static async getFavorites(cafeId?: string): Promise<FavoriteMenuItem[]> {
        const { data, error } = await supabase
            .rpc('get_customer_favorites', {
                p_customer_id: (await supabase.auth.getUser()).data.user?.id,
                p_cafe_id: cafeId || null
            });

        if (error) {
            console.error('Error fetching favorites:', error);
            throw error;
        }

        return data || [];
    }

    /**
     * Add a menu item to favorites
     */
    static async addFavorite(
        menuItemId: string,
        cafeId: string,
        notes?: string
    ): Promise<CustomerFavorite> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        const { data, error } = await supabase
            .from('customer_favorites')
            .insert({
                customer_id: userId,
                cafe_id: cafeId,
                menu_item_id: menuItemId,
                notes: notes || null
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding favorite:', error);
            throw error;
        }

        return data;
    }

    /**
     * Remove a menu item from favorites
     */
    static async removeFavorite(favoriteId: string): Promise<void> {
        const { error } = await supabase
            .from('customer_favorites')
            .delete()
            .eq('id', favoriteId);

        if (error) {
            console.error('Error removing favorite:', error);
            throw error;
        }
    }

    /**
     * Remove a menu item from favorites by menu item ID
     */
    static async removeFavoriteByMenuItem(menuItemId: string, cafeId: string): Promise<void> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            throw new Error('User not authenticated');
        }

        const { error } = await supabase
            .from('customer_favorites')
            .delete()
            .eq('customer_id', userId)
            .eq('cafe_id', cafeId)
            .eq('menu_item_id', menuItemId);

        if (error) {
            console.error('Error removing favorite by menu item:', error);
            throw error;
        }
    }

    /**
     * Check if a menu item is in favorites
     */
    static async isFavorite(menuItemId: string, cafeId: string): Promise<boolean> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            return false;
        }

        const { data, error } = await supabase
            .from('customer_favorites')
            .select('id')
            .eq('customer_id', userId)
            .eq('cafe_id', cafeId)
            .eq('menu_item_id', menuItemId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error checking favorite:', error);
            return false;
        }

        return !!data;
    }

    /**
     * Update favorite notes
     */
    static async updateFavoriteNotes(favoriteId: string, notes: string): Promise<CustomerFavorite> {
        const { data, error } = await supabase
            .from('customer_favorites')
            .update({ notes })
            .eq('id', favoriteId)
            .select()
            .single();

        if (error) {
            console.error('Error updating favorite notes:', error);
            throw error;
        }

        return data;
    }

    /**
     * Get favorite count for a cafe
     */
    static async getFavoriteCount(cafeId: string): Promise<number> {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
            return 0;
        }

        const { count, error } = await supabase
            .from('customer_favorites')
            .select('*', { count: 'exact', head: true })
            .eq('customer_id', userId)
            .eq('cafe_id', cafeId);

        if (error) {
            console.error('Error getting favorite count:', error);
            return 0;
        }

        return count || 0;
    }

    /**
     * Get most frequently favorited items for a cafe (for staff analytics)
     */
    static async getPopularFavorites(cafeId: string, limit: number = 10): Promise<Array<{
        menu_item_id: string;
        item_name: string;
        favorite_count: number;
        last_favorited: string;
    }>> {
        const { data, error } = await supabase
            .from('customer_favorites')
            .select(`
                menu_item_id,
                menu_items (
                    name,
                    price,
                    category
                ),
                added_at
            `)
            .eq('cafe_id', cafeId)
            .order('added_at', { ascending: false });

        if (error) {
            console.error('Error getting popular favorites:', error);
            return [];
        }

        // Group by menu item and count
        const counts = new Map<string, {
            menu_item_id: string;
            item_name: string;
            favorite_count: number;
            last_favorited: string;
        }>();

        data.forEach(fav => {
            const menuItem = fav.menu_items as Database['public']['Tables']['menu_items']['Row'] | null;
            const existing = counts.get(fav.menu_item_id);
            
            if (existing) {
                existing.favorite_count += 1;
                if (new Date(fav.added_at) > new Date(existing.last_favorited)) {
                    existing.last_favorited = fav.added_at;
                }
            } else {
                counts.set(fav.menu_item_id, {
                    menu_item_id: fav.menu_item_id,
                    item_name: menuItem?.name || 'Unknown',
                    favorite_count: 1,
                    last_favorited: fav.added_at
                });
            }
        });

        return Array.from(counts.values())
            .sort((a, b) => b.favorite_count - a.favorite_count)
            .slice(0, limit);
    }

    /**
     * Toggle favorite status
     */
    static async toggleFavorite(
        menuItemId: string,
        cafeId: string,
        notes?: string
    ): Promise<{ isFavorite: boolean; favorite?: CustomerFavorite }> {
        const isCurrentlyFavorite = await this.isFavorite(menuItemId, cafeId);

        if (isCurrentlyFavorite) {
            await this.removeFavoriteByMenuItem(menuItemId, cafeId);
            return { isFavorite: false };
        } else {
            const favorite = await this.addFavorite(menuItemId, cafeId, notes);
            return { isFavorite: true, favorite };
        }
    }
}