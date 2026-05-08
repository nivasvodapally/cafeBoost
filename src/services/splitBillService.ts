import { supabase } from '../integrations/supabase/client';
import { Tables } from '../integrations/supabase/types';

export type SplitType = 'equal' | 'percentage' | 'custom';

export type SplitDetails = {
  // For equal split
  split_count?: number;
  
  // For percentage split
  percentages?: Record<string, number>; // user_id -> percentage
  
  // For custom split
  amounts?: Record<string, number>; // user_id -> amount in cents
  
  // Common fields
  split_among?: string[]; // user_ids
  notes?: string;
};

export type SplitBillInput = {
  order_id: string;
  split_type: SplitType;
  split_details: SplitDetails;
};

export type SplitBillRecord = {
  id: string;
  original_order_id: string;
  split_order_id: string;
  split_type: SplitType;
  split_details: SplitDetails;
  created_by: string;
  created_at: string;
};

export type OrderWithSplitInfo = Tables<'orders'> & {
  split_bills?: SplitBillRecord[];
  is_split?: boolean;
  split_parent_id?: string | null;
  split_children?: Tables<'orders'>[];
};

export class SplitBillService {
  /**
   * Split a bill into multiple orders
   */
  static async splitBill(input: SplitBillInput, userId: string): Promise<string> {
    const { data, error } = await supabase.rpc('split_bill', {
      order_id: input.order_id,
      split_type: input.split_type,
      split_details: input.split_details,
      user_id: userId
    });

    if (error) {
      console.error('Error splitting bill:', error);
      throw new Error(`Failed to split bill: ${error.message}`);
    }

    return data;
  }

  /**
   * Get split bill records for an order
   */
  static async getSplitsForOrder(orderId: string): Promise<SplitBillRecord[]> {
    const { data, error } = await supabase
      .from('split_bills')
      .select('*')
      .or(`original_order_id.eq.${orderId},split_order_id.eq.${orderId}`);

    if (error) {
      console.error('Error fetching split bills:', error);
      throw new Error(`Failed to fetch split bills: ${error.message}`);
    }

    return data as SplitBillRecord[];
  }

  /**
   * Get order with split information
   */
  static async getOrderWithSplits(orderId: string): Promise<OrderWithSplitInfo> {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError) {
      console.error('Error fetching order:', orderError);
      throw new Error(`Failed to fetch order: ${orderError.message}`);
    }

    const splits = await this.getSplitsForOrder(orderId);
    
    // Check if this is a split child
    const isSplitChild = splits.some(split => split.split_order_id === orderId);
    const splitParent = splits.find(split => split.split_order_id === orderId);
    
    // Get split children if this is a parent
    let splitChildren: Tables<'orders'>[] = [];
    if (!isSplitChild) {
      const childSplits = splits.filter(split => split.original_order_id === orderId);
      if (childSplits.length > 0) {
        const { data: children } = await supabase
          .from('orders')
          .select('*')
          .in('id', childSplits.map(s => s.split_order_id));
        
        splitChildren = children || [];
      }
    }

    return {
      ...order,
      split_bills: splits,
      is_split: splits.length > 0,
      split_parent_id: splitParent?.original_order_id || null,
      split_children: splitChildren
    } as OrderWithSplitInfo;
  }

  /**
   * Calculate equal split amounts
   */
  static calculateEqualSplit(totalAmountCents: number, splitCount: number): number[] {
    if (splitCount <= 0) {
      throw new Error('Split count must be greater than 0');
    }

    const baseAmount = Math.floor(totalAmountCents / splitCount);
    const remainder = totalAmountCents % splitCount;
    
    const amounts: number[] = Array(splitCount).fill(baseAmount);
    
    // Distribute remainder
    for (let i = 0; i < remainder; i++) {
      amounts[i]++;
    }
    
    return amounts;
  }

  /**
   * Calculate percentage split amounts
   */
  static calculatePercentageSplit(totalAmountCents: number, percentages: Record<string, number>): Record<string, number> {
    const totalPercentage = Object.values(percentages).reduce((sum, p) => sum + p, 0);
    
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error('Percentages must sum to 100%');
    }

    const amounts: Record<string, number> = {};
    let allocated = 0;
    const entries = Object.entries(percentages);
    
    for (let i = 0; i < entries.length; i++) {
      const [userId, percentage] = entries[i];
      const amount = Math.round((totalAmountCents * percentage) / 100);
      amounts[userId] = amount;
      allocated += amount;
    }
    
    // Adjust for rounding errors
    const difference = totalAmountCents - allocated;
    if (difference !== 0 && entries.length > 0) {
      amounts[entries[0][0]] += difference;
    }
    
    return amounts;
  }

  /**
   * Validate custom split amounts
   */
  static validateCustomSplit(totalAmountCents: number, amounts: Record<string, number>): boolean {
    const sum = Object.values(amounts).reduce((s, a) => s + a, 0);
    return sum === totalAmountCents;
  }

  /**
   * Check if split bill is enabled for a cafe
   */
  static async isSplitBillEnabled(cafeId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('cafes')
      .select('split_bill_enabled')
      .eq('id', cafeId)
      .single();

    if (error) {
      console.error('Error checking split bill enabled status:', error);
      return false;
    }

    return data?.split_bill_enabled ?? true;
  }

  /**
   * Get suggested splits for an order
   */
  static getSuggestedSplits(order: Tables<'orders'>, orderItems: Tables<'order_items'>[]): SplitDetails[] {
    const suggestions: SplitDetails[] = [];
    
    // 1. Equal split among 2 people
    suggestions.push({
      split_type: 'equal',
      split_count: 2,
      notes: 'Equal split between 2 people'
    });
    
    // 2. Equal split among 4 people
    suggestions.push({
      split_type: 'equal',
      split_count: 4,
      notes: 'Equal split among 4 people'
    });
    
    // 3. By item categories (if we have item data)
    const categories = new Set(orderItems.map(item => item.category));
    if (categories.size > 1) {
      suggestions.push({
        split_type: 'custom',
        notes: 'Split by food categories',
        amounts: {} // Would need actual calculation
      });
    }
    
    return suggestions;
  }

  /**
   * Merge split bills back (admin only)
   */
  static async mergeSplitBills(orderId: string): Promise<void> {
    // This would be a complex operation that requires admin privileges
    // For now, we'll just mark the split as merged
    const { error } = await supabase
      .from('split_bills')
      .delete()
      .eq('original_order_id', orderId);

    if (error) {
      console.error('Error merging split bills:', error);
      throw new Error(`Failed to merge split bills: ${error.message}`);
    }
  }

  /**
   * Get split bill statistics for a cafe
   */
  static async getSplitStatistics(cafeId: string, days: number = 30): Promise<{
    total_splits: number;
    average_split_count: number;
    most_common_split_type: SplitType;
    revenue_from_splits: number;
  }> {
    const { data, error } = await supabase
      .from('split_bills')
      .select(`
        *,
        original_order:cafe_id
      `)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error('Error fetching split statistics:', error);
      throw new Error(`Failed to fetch split statistics: ${error.message}`);
    }

    // Filter by cafe (need to join with orders)
    const splits = data || [];
    
    return {
      total_splits: splits.length,
      average_split_count: splits.length > 0 ? splits.length / new Set(splits.map(s => s.original_order_id)).size : 0,
      most_common_split_type: this.getMostCommonSplitType(splits),
      revenue_from_splits: 0 // Would need order amounts
    };
  }

  private static getMostCommonSplitType(splits: { split_type: SplitType }[]): SplitType {
    const counts: Record<SplitType, number> = { equal: 0, percentage: 0, custom: 0 };
    
    splits.forEach(split => {
      counts[split.split_type]++;
    });
    
    return Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0] as SplitType;
  }
}