import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type OrderPriority = Database['public']['Enums']['order_priority'];

// Type for the query result with nested cafes
type OrderWithCafe = {
  id: string;
  status: string;
  created_at: string;
  cafes: {
    order_modification_window_minutes: number | null;
  } | null;
};

export interface OrderModificationRequest {
  orderId: string;
  newItems: Array<{
    menu_item_id?: string;
    name: string;
    quantity: number;
    price: number;
    notes?: string;
  }>;
  modificationReason?: string;
}

export interface OrderSplitRequest {
  orderId: string;
  splits: Array<{
    name: string;       // label for this split (e.g. "Split 1")
    amount: number;    // amount in rupees for this split
    sequence: number;  // order of this split (1-indexed)
    item_ids?: string[]; // optional: specific menu item IDs to include
  }>;
}

export interface OrderPriorityRequest {
  orderId: string;
  priority: OrderPriority;
  reason?: string;
}

export class OrderModificationService {
  /**
   * Check if an order can be modified
   */
  static async canModifyOrder(orderId: string): Promise<{
    canModify: boolean;
    reason?: string;
    minutesRemaining?: number;
  }> {
    try {
      const { data, error } = await supabase.rpc('can_modify_order', {
        order_id: orderId
      });

      if (error) {
        console.error('Error checking if order can be modified:', error);
        return { canModify: false, reason: 'Error checking order status' };
      }

      if (!data) {
        // Get order details to provide better error message
        const { data: order } = await supabase
          .from('orders')
          .select('status, created_at, cafes(order_modification_window_minutes)')
          .eq('id', orderId)
          .single();

        if (!order) {
          return { canModify: false, reason: 'Order not found' };
        }

        const orderData = order as unknown as OrderWithCafe;
        if (orderData.status !== 'placed') {
          return { canModify: false, reason: 'Order has already been accepted' };
        }

        // Calculate minutes passed
        const created = new Date(orderData.created_at);
        const now = new Date();
        const minutesPassed = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
        const windowMinutes = orderData.cafes?.order_modification_window_minutes || 5;

        if (minutesPassed > windowMinutes) {
          return { 
            canModify: false, 
            reason: `Modification window (${windowMinutes} minutes) has expired`,
            minutesRemaining: 0
          };
        }

        return { 
          canModify: false, 
          reason: 'Unknown reason',
          minutesRemaining: Math.max(0, windowMinutes - minutesPassed)
        };
      }

      // If we can modify, calculate remaining time
      const { data: order } = await supabase
        .from('orders')
        .select('created_at, cafes(order_modification_window_minutes)')
        .eq('id', orderId)
        .single();

      if (order) {
        const orderData = order as unknown as OrderWithCafe;
        const created = new Date(orderData.created_at);
        const now = new Date();
        const minutesPassed = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
        const windowMinutes = orderData.cafes?.order_modification_window_minutes || 5;
        const minutesRemaining = Math.max(0, windowMinutes - minutesPassed);

        return { 
          canModify: true, 
          minutesRemaining 
        };
      }

      return { canModify: true };
    } catch (error) {
      console.error('Error in canModifyOrder:', error);
      return { canModify: false, reason: 'System error' };
    }
  }

  /**
   * Modify an order (creates a new order and cancels the original)
   */
  static async modifyOrder(request: OrderModificationRequest): Promise<{
    success: boolean;
    newOrderId?: string;
    error?: string;
  }> {
    try {
      // First check if order can be modified
      const canModify = await this.canModifyOrder(request.orderId);
      if (!canModify.canModify) {
        return { 
          success: false, 
          error: canModify.reason || 'Order cannot be modified' 
        };
      }

      // Call the database function to modify the order
      const { data, error } = await supabase.rpc('modify_order', {
        order_id: request.orderId,
        new_items: JSON.stringify(request.newItems),
        modification_reason: request.modificationReason || null,
        modified_by_user_id: (await supabase.auth.getUser()).data.user?.id || null
      });

      if (error) {
        console.error('Error modifying order:', error);
        return { success: false, error: error.message };
      }

      // The function returns the new order ID
      const newOrderId = data as string;

      // TODO: In a real implementation, we would need to create the order items
      // For now, we'll assume the database function handles it

      return { success: true, newOrderId };
    } catch (error) {
      console.error('Error in modifyOrder:', error);
      return { success: false, error: 'System error' };
    }
  }

  /**
   * Split an order into multiple orders
   */
  static async splitOrder(request: OrderSplitRequest): Promise<{
    success: boolean;
    newOrderIds?: string[];
    error?: string;
  }> {
    try {
      // split_order RPC expects: { name, amount, sequence } per split
      const splitInstructions = request.splits.map((split, index) => ({
        name: split.name || `Split ${index + 1}`,
        amount: split.amount,
        sequence: split.sequence || index + 1,
      }));

      const { data, error } = await supabase.rpc('split_order', {
        order_id: request.orderId,
        split_instructions: JSON.stringify(splitInstructions),
      });

      if (error) {
        console.error('Error splitting order:', error);
        return { success: false, error: error.message };
      }

      const newOrderIds = (data as string[]) ?? [];
      return { success: true, newOrderIds };
    } catch (error) {
      console.error('Error in splitOrder:', error);
      return { success: false, error: 'System error' };
    }
  }

  /**
   * Update order priority
   */
  static async updatePriority(request: OrderPriorityRequest): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          priority: request.priority,
          notes: request.reason 
            ? `Priority changed to ${request.priority}: ${request.reason}`
            : `Priority changed to ${request.priority}`
        })
        .eq('id', request.orderId);

      if (error) {
        console.error('Error updating order priority:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error in updatePriority:', error);
      return { success: false, error: 'System error' };
    }
  }

  /**
   * Get order modification history
   */
  static async getModificationHistory(orderId: string): Promise<{
    modifications: Array<{
      id: string;
      originalOrderId: string;
      newOrderId: string;
      reason?: string;
      modifiedBy?: string;
      modifiedAt: string;
    }>;
    splits: Array<{
      parentOrderId: string;
      childOrders: Array<{
        id: string;
        sequence: number;
        totalCount: number;
        createdAt: string;
      }>;
    }>;
  }> {
    try {
      // Get modifications (orders that have original_order_id = orderId)
      const { data: modifications } = await supabase
        .from('orders')
        .select('id, original_order_id, modification_reason, modified_by, modified_at')
        .eq('original_order_id', orderId)
        .order('modified_at', { ascending: false });

      // Get splits (orders that have split_parent_id = orderId)
      const { data: splits } = await supabase
        .from('orders')
        .select('id, split_sequence, split_total_count, created_at')
        .eq('split_parent_id', orderId)
        .order('split_sequence', { ascending: true });

      return {
        modifications: (modifications || []).map(mod => ({
          id: mod.id,
          originalOrderId: mod.original_order_id!,
          newOrderId: mod.id,
          reason: mod.modification_reason || undefined,
          modifiedBy: mod.modified_by || undefined,
          modifiedAt: mod.modified_at!
        })),
        splits: splits && splits.length > 0 ? [{
          parentOrderId: orderId,
          childOrders: splits.map(split => ({
            id: split.id,
            sequence: split.split_sequence || 1,
            totalCount: split.split_total_count || 1,
            createdAt: split.created_at
          }))
        }] : []
      };
    } catch (error) {
      console.error('Error getting modification history:', error);
      return { modifications: [], splits: [] };
    }
  }

  /**
   * Get cafe's order modification settings
   */
  static async getCafeModificationSettings(cafeId: string): Promise<{
    modificationWindowMinutes: number;
    allowsModification: boolean;
    allowsSplitting: boolean;
    prioritySettings: {
      enabled: boolean;
      defaultPriority: OrderPriority;
      vipCustomerPriority: OrderPriority;
    };
  }> {
    try {
      const { data } = await supabase
        .from('cafes')
        .select('order_modification_window_minutes')
        .eq('id', cafeId)
        .single();

      return {
        modificationWindowMinutes: data?.order_modification_window_minutes || 5,
        allowsModification: true, // Default to true
        allowsSplitting: true, // Default to true
        prioritySettings: {
          enabled: true,
          defaultPriority: 'normal',
          vipCustomerPriority: 'high'
        }
      };
    } catch (error) {
      console.error('Error getting cafe modification settings:', error);
      return {
        modificationWindowMinutes: 5,
        allowsModification: true,
        allowsSplitting: true,
        prioritySettings: {
          enabled: true,
          defaultPriority: 'normal',
          vipCustomerPriority: 'high'
        }
      };
    }
  }
}