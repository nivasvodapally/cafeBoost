import { supabase } from '../integrations/supabase/client';
import { Tables } from '../integrations/supabase/types';

export type TimerStatus = {
  elapsed_seconds: number;
  expected_seconds: number | null;
  is_running: boolean;
  is_paused: boolean;
  should_alert: boolean;
  formatted_time: string;
  progress_percentage: number;
  status: 'ontime' | 'warning' | 'late' | 'unknown';
};

export type TimerAlert = {
  order_id: string;
  order_number: string;
  customer_name: string;
  elapsed_minutes: number;
  expected_minutes: number | null;
  status: string;
  alert_type: 'timer_started' | 'timer_warning' | 'timer_late' | 'timer_completed';
};

export class OrderTimerService {
  /**
   * Start timer for an order
   */
  static async startTimer(orderId: string, expectedMinutes?: number): Promise<void> {
    const { error } = await supabase.rpc('start_order_timer', {
      order_id: orderId,
      expected_minutes: expectedMinutes
    });

    if (error) {
      console.error('Error starting order timer:', error);
      throw new Error(`Failed to start timer: ${error.message}`);
    }
  }

  /**
   * Pause timer for an order
   */
  static async pauseTimer(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('pause_order_timer', {
      order_id: orderId
    });

    if (error) {
      console.error('Error pausing order timer:', error);
      throw new Error(`Failed to pause timer: ${error.message}`);
    }
  }

  /**
   * Resume timer for an order
   */
  static async resumeTimer(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('resume_order_timer', {
      order_id: orderId
    });

    if (error) {
      console.error('Error resuming order timer:', error);
      throw new Error(`Failed to resume timer: ${error.message}`);
    }
  }

  /**
   * Stop and reset timer for an order
   */
  static async stopTimer(orderId: string): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .update({
        timer_started_at: null,
        timer_paused_at: null,
        timer_total_seconds: 0,
        timer_alert_sent: false
      })
      .eq('id', orderId);

    if (error) {
      console.error('Error stopping order timer:', error);
      throw new Error(`Failed to stop timer: ${error.message}`);
    }
  }

  /**
   * Get timer status for an order
   */
  static async getTimerStatus(orderId: string): Promise<TimerStatus> {
    const { data, error } = await supabase.rpc('get_order_timer_status', {
      order_id: orderId
    });

    if (error) {
      console.error('Error getting order timer status:', error);
      throw new Error(`Failed to get timer status: ${error.message}`);
    }

    const status = data?.[0] || {
      elapsed_seconds: 0,
      expected_seconds: null,
      is_running: false,
      is_paused: false,
      should_alert: false
    };

    return this.formatTimerStatus(status);
  }

  /**
   * Format timer status with additional computed fields
   */
  private static formatTimerStatus(status: {
    elapsed_seconds?: number;
    expected_seconds?: number | null;
    is_running?: boolean;
    is_paused?: boolean;
    should_alert?: boolean;
  }): TimerStatus {
    const elapsedSeconds = status.elapsed_seconds || 0;
    const expectedSeconds = status.expected_seconds;
    
    let progressPercentage = 0;
    let timerStatus: TimerStatus['status'] = 'unknown';
    
    if (expectedSeconds && expectedSeconds > 0) {
      progressPercentage = Math.min(100, (elapsedSeconds / expectedSeconds) * 100);
      
      if (elapsedSeconds <= expectedSeconds * 0.7) {
        timerStatus = 'ontime';
      } else if (elapsedSeconds <= expectedSeconds) {
        timerStatus = 'warning';
      } else {
        timerStatus = 'late';
      }
    } else {
      timerStatus = 'unknown';
    }

    const formattedTime = this.formatSeconds(elapsedSeconds);

    return {
      ...status,
      elapsed_seconds: elapsedSeconds,
      expected_seconds: expectedSeconds,
      formatted_time: formattedTime,
      progress_percentage: progressPercentage,
      status: timerStatus
    };
  }

  /**
   * Format seconds to HH:MM:SS or MM:SS
   */
  static formatSeconds(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Format seconds to human readable time
   */
  static formatHumanTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds} seconds`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Check for timer alerts across all orders
   */
  static async checkTimerAlerts(cafeId: string): Promise<TimerAlert[]> {
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        customer:profiles(full_name),
        timer_started_at,
        timer_paused_at,
        timer_total_seconds,
        timer_expected_seconds,
        timer_alert_sent,
        status
      `)
      .eq('cafe_id', cafeId)
      .not('timer_started_at', 'is', null)
      .eq('timer_alert_sent', false);

    if (error) {
      console.error('Error checking timer alerts:', error);
      throw new Error(`Failed to check timer alerts: ${error.message}`);
    }

    const alerts: TimerAlert[] = [];
    const now = new Date();

    for (const order of orders) {
      const elapsedSeconds = this.calculateElapsedSeconds(order);
      const expectedSeconds = order.timer_expected_seconds;
      
      if (!expectedSeconds) continue;

      const elapsedMinutes = Math.floor(elapsedSeconds / 60);
      const expectedMinutes = Math.floor(expectedSeconds / 60);

      let alertType: TimerAlert['alert_type'] | null = null;

      // Check for warning (70% of expected time)
      if (elapsedSeconds >= expectedSeconds * 0.7 && elapsedSeconds < expectedSeconds) {
        alertType = 'timer_warning';
      }
      // Check for late (exceeded expected time)
      else if (elapsedSeconds >= expectedSeconds) {
        alertType = 'timer_late';
      }

      if (alertType) {
        alerts.push({
          order_id: order.id,
          order_number: order.order_number,
          customer_name: order.customer?.full_name || 'Customer',
          elapsed_minutes: elapsedMinutes,
          expected_minutes: expectedMinutes,
          status: order.status,
          alert_type: alertType
        });

        // Mark alert as sent
        await supabase
          .from('orders')
          .update({ timer_alert_sent: true })
          .eq('id', order.id);
      }
    }

    return alerts;
  }

  /**
   * Calculate elapsed seconds for an order
   */
  private static calculateElapsedSeconds(order: {
    timer_total_seconds?: number | null;
    timer_started_at?: string | null;
    timer_paused_at?: string | null;
  }): number {
    let elapsed = order.timer_total_seconds || 0;
    
    if (order.timer_started_at && !order.timer_paused_at) {
      const startedAt = new Date(order.timer_started_at);
      const now = new Date();
      elapsed += (now.getTime() - startedAt.getTime()) / 1000;
    }
    
    return Math.floor(elapsed);
  }

  /**
   * Get orders with active timers for a cafe
   */
  static async getActiveTimers(cafeId: string): Promise<Array<Tables<'orders'> & { timer_status: TimerStatus }>> {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('cafe_id', cafeId)
      .not('timer_started_at', 'is', null)
      .order('timer_started_at', { ascending: true });

    if (error) {
      console.error('Error fetching active timers:', error);
      throw new Error(`Failed to fetch active timers: ${error.message}`);
    }

    const ordersWithTimers = [];
    
    for (const order of orders || []) {
      const timerStatus = await this.getTimerStatus(order.id);
      ordersWithTimers.push({
        ...order,
        timer_status: timerStatus
      });
    }

    return ordersWithTimers;
  }

  /**
   * Set expected time for an order based on menu items
   */
  static async setExpectedTimeFromMenu(orderId: string): Promise<void> {
    // Get order items and their preparation times
    const { data: items, error } = await supabase
      .from('order_items')
      .select(`
        menu_item:menu_items(preparation_time_minutes)
      `)
      .eq('order_id', orderId);

    if (error) {
      console.error('Error fetching order items for timer:', error);
      throw new Error(`Failed to fetch order items: ${error.message}`);
    }

    // Calculate total preparation time (max of all items + buffer)
    let maxPreparationTime = 0;
    items?.forEach(item => {
      const prepTime = item.menu_item?.preparation_time_minutes || 15;
      maxPreparationTime = Math.max(maxPreparationTime, prepTime);
    });

    // Add buffer for multiple items
    const totalItems = items?.length || 0;
    const expectedMinutes = maxPreparationTime + (totalItems > 1 ? 5 : 0);

    await this.startTimer(orderId, expectedMinutes);
  }

  /**
   * Check if order timer is enabled for a cafe
   */
  static async isTimerEnabled(cafeId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('cafes')
      .select('order_timer_enabled')
      .eq('id', cafeId)
      .single();

    if (error) {
      console.error('Error checking timer enabled status:', error);
      return false;
    }

    return data?.order_timer_enabled ?? true;
  }

  /**
   * Get timer statistics for a cafe
   */
  static async getTimerStatistics(cafeId: string, days: number = 7): Promise<{
    total_timed_orders: number;
    average_preparation_time: number;
    on_time_percentage: number;
    late_orders_count: number;
    most_common_late_items: string[];
  }> {
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        timer_started_at,
        timer_total_seconds,
        timer_expected_seconds,
        status,
        updated_at,
        created_at
      `)
      .eq('cafe_id', cafeId)
      .not('timer_started_at', 'is', null)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error('Error fetching timer statistics:', error);
      throw new Error(`Failed to fetch timer statistics: ${error.message}`);
    }

    const timedOrders = orders || [];
    let totalPreparationTime = 0;
    let onTimeCount = 0;
    let lateCount = 0;

    timedOrders.forEach(order => {
      const elapsed = this.calculateElapsedSeconds(order);
      const expected = order.timer_expected_seconds;
      
      if (expected) {
        totalPreparationTime += elapsed;
        
        if (elapsed <= expected) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      }
    });

    return {
      total_timed_orders: timedOrders.length,
      average_preparation_time: timedOrders.length > 0 ? totalPreparationTime / timedOrders.length : 0,
      on_time_percentage: timedOrders.length > 0 ? (onTimeCount / timedOrders.length) * 100 : 0,
      late_orders_count: lateCount,
      most_common_late_items: [] // Would need item analysis
    };
  }
}