import { supabase } from '../integrations/supabase/client';
import { Tables } from '../integrations/supabase/types';

export type StaffPerformanceMetrics = {
  staff_id: string;
  staff_name: string;
  role: string;
  orders_processed: number;
  average_preparation_time_seconds: number;
  customer_satisfaction_rating: number;
  rank: number;
  efficiency_score: number;
  revenue_contribution: number;
};

export type StaffLeaderboardRpcResult = {
  staff_id: string;
  staff_name: string;
  role: string;
  orders_processed: number;
  average_preparation_time_seconds: number;
  customer_satisfaction_rating: number;
  rank: number;
};

export type EfficiencyScoreMetrics = {
  orders_processed: number;
  average_preparation_time_seconds: number;
  customer_satisfaction_rating: number;
};

export type StaffPerformanceSnapshot = {
  id: string;
  staff_id: string;
  cafe_id: string;
  snapshot_date: string;
  metrics: {
    orders_processed?: number;
    orders_per_hour?: number;
    average_preparation_time?: number;
    cancellation_rate?: number;
    total_revenue?: number;
    customer_satisfaction?: number;
    [key: string]: unknown;
  };
  created_at: string;
};

export type StaffLeaderboardEntry = StaffPerformanceMetrics & {
  change_from_previous?: number;
  trend?: 'up' | 'down' | 'stable';
};

export type StaffPerformanceTrend = {
  date: string;
  orders_processed: number;
  average_preparation_time: number;
  customer_satisfaction: number;
  efficiency_score: number;
};

export class StaffMetricsService {
  /**
   * Record performance snapshot for a staff member
   */
  static async recordPerformanceSnapshot(staffId: string, cafeId: string): Promise<StaffPerformanceSnapshot> {
    const { data, error } = await supabase.rpc('record_staff_performance_snapshot', {
      staff_id: staffId,
      cafe_id: cafeId
    });

    if (error) {
      console.error('Error recording staff performance snapshot:', error);
      throw new Error(`Failed to record snapshot: ${error.message}`);
    }

    // Get the created snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('staff_performance_snapshots')
      .select('*')
      .eq('staff_id', staffId)
      .eq('cafe_id', cafeId)
      .eq('snapshot_date', new Date().toISOString().split('T')[0])
      .single();

    if (snapshotError) {
      console.error('Error fetching created snapshot:', snapshotError);
      throw new Error(`Failed to fetch snapshot: ${snapshotError.message}`);
    }

    return snapshot as StaffPerformanceSnapshot;
  }

  /**
   * Get staff leaderboard for a cafe
   */
  static async getStaffLeaderboard(cafeId: string, periodDays: number = 7): Promise<StaffLeaderboardEntry[]> {
    const { data, error } = await supabase.rpc('get_staff_leaderboard', {
      cafe_id: cafeId,
      period_days: periodDays
    });

    if (error) {
      console.error('Error fetching staff leaderboard:', error);
      throw new Error(`Failed to fetch leaderboard: ${error.message}`);
    }

    const leaderboard = (data || []).map((entry: StaffLeaderboardRpcResult) => ({
      ...entry,
      efficiency_score: this.calculateEfficiencyScore(entry),
      revenue_contribution: 0 // Would need actual revenue calculation
    }));

    // Calculate trends
    return this.calculateTrends(leaderboard, cafeId);
  }

  /**
   * Calculate efficiency score based on multiple metrics
   */
  private static calculateEfficiencyScore(metrics: EfficiencyScoreMetrics): number {
    const weights = {
      orders_processed: 0.4,
      average_preparation_time: 0.3,
      customer_satisfaction: 0.3
    };

    let score = 0;
    
    // Normalize orders processed (higher is better)
    const maxOrders = 100; // hypothetical max
    const ordersScore = Math.min(metrics.orders_processed / maxOrders, 1) * 100;
    
    // Normalize preparation time (lower is better)
    const idealTime = 300; // 5 minutes
    const prepTimeScore = Math.max(0, 100 - (metrics.average_preparation_time_seconds / idealTime) * 100);
    
    // Customer satisfaction (0-5 scale to 0-100)
    const satisfactionScore = (metrics.customer_satisfaction_rating || 0) * 20;

    score = (
      ordersScore * weights.orders_processed +
      prepTimeScore * weights.average_preparation_time +
      satisfactionScore * weights.customer_satisfaction
    );

    return Math.round(score);
  }

  /**
   * Calculate trends for leaderboard entries
   */
  private static async calculateTrends(
    leaderboard: StaffLeaderboardEntry[],
    cafeId: string
  ): Promise<StaffLeaderboardEntry[]> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Get yesterday's snapshots for comparison
    const { data: yesterdaySnapshots } = await supabase
      .from('staff_performance_snapshots')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('snapshot_date', yesterdayStr);

    const yesterdayMap = new Map(
      (yesterdaySnapshots || []).map(s => [s.staff_id, s])
    );

    return leaderboard.map(entry => {
      const yesterdaySnapshot = yesterdayMap.get(entry.staff_id);
      
      if (!yesterdaySnapshot) {
        return { ...entry, change_from_previous: 0, trend: 'stable' };
      }

      const yesterdayOrders = yesterdaySnapshot.metrics.orders_processed || 0;
      const change = entry.orders_processed - yesterdayOrders;
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (change > 2) trend = 'up';
      else if (change < -2) trend = 'down';

      return {
        ...entry,
        change_from_previous: change,
        trend
      };
    });
  }

  /**
   * Get performance trends for a staff member
   */
  static async getStaffPerformanceTrend(
    staffId: string,
    cafeId: string,
    days: number = 30
  ): Promise<StaffPerformanceTrend[]> {
    const { data: snapshots, error } = await supabase
      .from('staff_performance_snapshots')
      .select('*')
      .eq('staff_id', staffId)
      .eq('cafe_id', cafeId)
      .gte('snapshot_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true });

    if (error) {
      console.error('Error fetching staff performance trends:', error);
      throw new Error(`Failed to fetch trends: ${error.message}`);
    }

    return (snapshots || []).map(snapshot => ({
      date: snapshot.snapshot_date,
      orders_processed: snapshot.metrics.orders_processed || 0,
      average_preparation_time: snapshot.metrics.average_preparation_time || 0,
      customer_satisfaction: snapshot.metrics.customer_satisfaction || 0,
      efficiency_score: this.calculateEfficiencyScore({
        orders_processed: snapshot.metrics.orders_processed || 0,
        average_preparation_time_seconds: snapshot.metrics.average_preparation_time || 0,
        customer_satisfaction_rating: snapshot.metrics.customer_satisfaction || 0
      })
    }));
  }

  /**
   * Get detailed performance metrics for a staff member
   */
  static async getStaffDetailedMetrics(
    staffId: string,
    cafeId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    summary: StaffPerformanceMetrics;
    trends: StaffPerformanceTrend[];
    strengths: string[];
    areas_for_improvement: string[];
    recommendations: string[];
  }> {
    const [leaderboard, trends] = await Promise.all([
      this.getStaffLeaderboard(cafeId, 7),
      this.getStaffPerformanceTrend(staffId, cafeId, 30)
    ]);

    const staffEntry = leaderboard.find(entry => entry.staff_id === staffId);
    
    if (!staffEntry) {
      throw new Error('Staff member not found in leaderboard');
    }

    // Analyze strengths and areas for improvement
    const strengths: string[] = [];
    const areasForImprovement: string[] = [];
    const recommendations: string[] = [];

    if (staffEntry.efficiency_score >= 80) {
      strengths.push('High efficiency score');
    } else if (staffEntry.efficiency_score <= 50) {
      areasForImprovement.push('Low efficiency score');
      recommendations.push('Focus on reducing preparation time and improving customer satisfaction');
    }

    if (staffEntry.average_preparation_time_seconds < 300) {
      strengths.push('Fast preparation time');
    } else if (staffEntry.average_preparation_time_seconds > 600) {
      areasForImprovement.push('Slow preparation time');
      recommendations.push('Review workflow and consider additional training');
    }

    if (staffEntry.customer_satisfaction_rating >= 4) {
      strengths.push('High customer satisfaction');
    } else if (staffEntry.customer_satisfaction_rating <= 2.5) {
      areasForImprovement.push('Low customer satisfaction');
      recommendations.push('Focus on customer service training and quality control');
    }

    if (staffEntry.orders_processed >= 20) {
      strengths.push('High order volume');
    } else if (staffEntry.orders_processed <= 5) {
      areasForImprovement.push('Low order volume');
      recommendations.push('Consider shift scheduling optimization');
    }

    // Add generic recommendations if none
    if (recommendations.length === 0) {
      recommendations.push('Continue current performance level');
      recommendations.push('Consider mentoring newer staff members');
    }

    return {
      summary: staffEntry,
      trends,
      strengths,
      areas_for_improvement: areasForImprovement,
      recommendations
    };
  }

  /**
   * Get comparative analysis between staff members
   */
  static async getComparativeAnalysis(
    cafeId: string,
    staffIds: string[]
  ): Promise<{
    comparison: Array<StaffPerformanceMetrics & { percentile: number }>;
    benchmarks: {
      average_orders_processed: number;
      average_preparation_time: number;
      average_satisfaction: number;
      top_performer: string;
    };
  }> {
    const leaderboard = await this.getStaffLeaderboard(cafeId, 7);
    
    const filteredLeaderboard = leaderboard.filter(entry => 
      staffIds.includes(entry.staff_id)
    );

    if (filteredLeaderboard.length === 0) {
      throw new Error('No staff members found for comparison');
    }

    // Calculate averages
    const totalOrders = filteredLeaderboard.reduce((sum, entry) => sum + entry.orders_processed, 0);
    const totalPrepTime = filteredLeaderboard.reduce((sum, entry) => sum + entry.average_preparation_time_seconds, 0);
    const totalSatisfaction = filteredLeaderboard.reduce((sum, entry) => sum + entry.customer_satisfaction_rating, 0);

    const averageOrders = totalOrders / filteredLeaderboard.length;
    const averagePrepTime = totalPrepTime / filteredLeaderboard.length;
    const averageSatisfaction = totalSatisfaction / filteredLeaderboard.length;

    // Find top performer
    const topPerformer = filteredLeaderboard.reduce((top, current) => 
      current.efficiency_score > top.efficiency_score ? current : top
    );

    // Calculate percentiles
    const comparison = filteredLeaderboard.map(entry => {
      const betterCount = filteredLeaderboard.filter(e => e.efficiency_score < entry.efficiency_score).length;
      const percentile = Math.round((betterCount / filteredLeaderboard.length) * 100);
      
      return {
        ...entry,
        percentile
      };
    });

    return {
      comparison,
      benchmarks: {
        average_orders_processed: Math.round(averageOrders),
        average_preparation_time: Math.round(averagePrepTime),
        average_satisfaction: Math.round(averageSatisfaction * 10) / 10,
        top_performer: topPerformer.staff_name
      }
    };
  }

  /**
   * Check if staff metrics are enabled for a cafe
   */
  static async isMetricsEnabled(cafeId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('cafes')
      .select('staff_metrics_enabled')
      .eq('id', cafeId)
      .single();

    if (error) {
      console.error('Error checking staff metrics enabled status:', error);
      return false;
    }

    return data?.staff_metrics_enabled ?? true;
  }

  /**
   * Generate performance report for a cafe
   */
  static async generatePerformanceReport(
    cafeId: string,
    periodDays: number = 30
  ): Promise<{
    period: string;
    total_staff: number;
    total_orders_processed: number;
    average_efficiency_score: number;
    top_performers: StaffLeaderboardEntry[];
    areas_for_improvement: string[];
    recommendations: string[];
  }> {
    const leaderboard = await this.getStaffLeaderboard(cafeId, periodDays);
    
    if (leaderboard.length === 0) {
      throw new Error('No staff performance data available');
    }

    const totalOrders = leaderboard.reduce((sum, entry) => sum + entry.orders_processed, 0);
    const averageEfficiency = leaderboard.reduce((sum, entry) => sum + entry.efficiency_score, 0) / leaderboard.length;

    // Identify top 3 performers
    const topPerformers = [...leaderboard]
      .sort((a, b) => b.efficiency_score - a.efficiency_score)
      .slice(0, 3);

    // Identify common areas for improvement
    const areasForImprovement: string[] = [];
    const lowSatisfactionCount = leaderboard.filter(e => e.customer_satisfaction_rating < 3).length;
    const slowPrepCount = leaderboard.filter(e => e.average_preparation_time_seconds > 600).length;

    if (lowSatisfactionCount > leaderboard.length * 0.3) {
      areasForImprovement.push('Customer satisfaction needs improvement across multiple staff');
    }

    if (slowPrepCount > leaderboard.length * 0.3) {
      areasForImprovement.push('Preparation times are consistently high');
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (averageEfficiency < 70) {
      recommendations.push('Consider implementing additional training programs');
    }
    
    if (topPerformers.length > 0) {
      recommendations.push(`Leverage ${topPerformers[0].staff_name}'s expertise for peer mentoring`);
    }

    if (areasForImprovement.length === 0) {
      recommendations.push('Maintain current performance standards');
    }

    return {
      period: `${periodDays} days`,
      total_staff: leaderboard.length,
      total_orders_processed: totalOrders,
      average_efficiency_score: Math.round(averageEfficiency),
      top_performers: topPerformers,
      areas_for_improvement: areasForImprovement,
      recommendations
    };
  }

  /**
   * Export performance data to CSV
   */
  static async exportPerformanceData(
    cafeId: string,
    format: 'csv' | 'json' = 'csv'
  ): Promise<string> {
    const leaderboard = await this.getStaffLeaderboard(cafeId, 30);

    if (format === 'json') {
      return JSON.stringify(leaderboard, null, 2);
    }

    // CSV format
    const headers = ['Staff Name', 'Role', 'Orders Processed', 'Avg Prep Time (s)', 'Satisfaction', 'Efficiency Score', 'Rank'];
    const rows = leaderboard.map(entry => [
      entry.staff_name,
      entry.role,
      entry.orders_processed.toString(),
      entry.average_preparation_time_seconds.toString(),
      entry.customer_satisfaction_rating.toString(),
      entry.efficiency_score.toString(),
      entry.rank.toString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }
}