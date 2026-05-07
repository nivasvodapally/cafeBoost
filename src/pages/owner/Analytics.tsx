import { useEffect, useState, type ComponentType } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, Calendar, DollarSign, Users, Clock, TrendingUp, 
  Download, FileText, PieChart, ShoppingBag, Coffee, Loader2,
  ArrowUpRight, ArrowDownRight, CheckCircle, AlertCircle, ChefHat
} from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/currency";

type AnalyticsPeriod = 'today' | 'week' | 'month' | 'quarter';

type OperationalAnalytics = {
  total_orders: number;
  total_revenue_cents: number;
  avg_order_value_cents: number;
  orders_per_hour: number;
  peak_hour: string;
  table_turnover_rate: number;
  avg_preparation_time_minutes: number;
  waitlist_conversion_rate: number;
  most_popular_items: Array<{ name: string; count: number }>;
};

type FinancialAnalytics = {
  revenue_trend: number;
  revenue_by_payment_method: Array<{ method: string; amount_cents: number }>;
  refund_rate: number;
  average_tip_percentage: number;
  revenue_by_hour: Array<{ hour: number; revenue_cents: number }>;
  customer_lifetime_value: number;
  repeat_customer_rate: number;
};

type WaitlistAnalytics = {
  total_waitlist_entries: number;
  average_wait_time_minutes: number;
  conversion_rate: number;
  no_show_rate: number;
  peak_waitlist_hours: Array<{ hour: number; count: number }>;
};

type StaffPerformance = {
  staff_id: string;
  name: string;
  orders_handled: number;
  efficiency_score: number;
  avg_preparation_time_minutes: number;
  customer_rating: number;
};

export default function OwnerAnalytics() {
  const { cafe } = useOwnerCafe();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<AnalyticsPeriod>('week');
  const [operationalData, setOperationalData] = useState<OperationalAnalytics | null>(null);
  const [financialData, setFinancialData] = useState<FinancialAnalytics | null>(null);
  const [waitlistData, setWaitlistData] = useState<WaitlistAnalytics | null>(null);
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [exporting, setExporting] = useState(false);

  const fetchAnalytics = async () => {
    if (!cafe?.id) return;
    
    setLoading(true);
    try {
      // Fetch orders data
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('total_amount, created_at, status')
        .eq('cafe_id', cafe.id)
        .gte('created_at', new Date(Date.now() - (period === 'today' ? 24*60*60*1000 : period === 'week' ? 7*24*60*60*1000 : period === 'month' ? 30*24*60*60*1000 : 90*24*60*60*1000)).toISOString())
        .eq('status', 'completed');
      
      if (ordersError) throw ordersError;

      // Calculate basic operational metrics
      const totalOrders = ordersData?.length || 0;
      const totalRevenue = ordersData?.reduce((sum: number, order: Record<string, unknown>) => sum + ((order.total_amount as number) || 0), 0) || 0;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      
      // For demo purposes, create simulated data
      setOperationalData({
        total_orders: totalOrders,
        total_revenue_cents: totalRevenue * 100, // Convert to cents
        avg_order_value_cents: avgOrderValue * 100,
        orders_per_hour: totalOrders / (period === 'today' ? 24 : period === 'week' ? 168 : period === 'month' ? 720 : 2160),
        peak_hour: '12:00-13:00',
        table_turnover_rate: 2.5,
        avg_preparation_time_minutes: 15.3,
        waitlist_conversion_rate: 0.65,
        most_popular_items: [
          { name: "Cappuccino", count: 42 },
          { name: "Croissant", count: 28 },
          { name: "Sandwich", count: 23 },
          { name: "Latte", count: 19 },
          { name: "Tea", count: 15 }
        ]
      });

      // Simulate financial data
      setFinancialData({
        revenue_trend: 12.5,
        revenue_by_payment_method: [
          { method: 'UPI', amount_cents: 450000 },
          { method: 'Card', amount_cents: 280000 },
          { method: 'Cash', amount_cents: 120000 }
        ],
        refund_rate: 0.02,
        average_tip_percentage: 8.5,
        revenue_by_hour: Array.from({ length: 24 }, (_, i) => ({ 
          hour: i, 
          revenue_cents: Math.floor(Math.random() * 50000) + 10000 
        })),
        customer_lifetime_value: 2450,
        repeat_customer_rate: 0.72
      });

      // Simulate waitlist data
      setWaitlistData({
        total_waitlist_entries: 156,
        average_wait_time_minutes: 18.5,
        conversion_rate: 0.65,
        no_show_rate: 0.15,
        peak_waitlist_hours: [
          { hour: 12, count: 28 },
          { hour: 19, count: 32 },
          { hour: 20, count: 25 }
        ]
      });

      // Fetch staff performance
      const { data: staffData, error: staffError } = await supabase
        .from('cafe_staff')
        .select(`
          user_id,
          profiles:user_id (full_name)
        `)
        .eq('cafe_id', cafe.id)
        .eq('status', 'active');
      
      if (!staffError && staffData) {
        const performance = staffData.map((staff: Record<string, unknown>, index: number) => ({
          staff_id: staff.user_id,
          name: staff.profiles?.full_name || `Staff ${index + 1}`,
          orders_handled: Math.floor(Math.random() * 50) + 10,
          efficiency_score: Math.floor(Math.random() * 30) + 70,
          avg_preparation_time_minutes: Math.floor(Math.random() * 10) + 10,
          customer_rating: Math.floor(Math.random() * 20) + 80
        }));
        setStaffPerformance(performance);
      }

    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!cafe?.id) return;
    
    setExporting(true);
    try {
      // Create CSV content
      const headers = ['Metric', 'Value', 'Period'];
      const rows = [
        ['Total Orders', operationalData?.total_orders || 0, period],
        ['Total Revenue', fmtMoney((operationalData?.total_revenue_cents || 0) / 100), period],
        ['Average Order Value', fmtMoney((operationalData?.avg_order_value_cents || 0) / 100), period],
        ['Orders per Hour', operationalData?.orders_per_hour?.toFixed(1) || 0, period],
        ['Table Turnover Rate', operationalData?.table_turnover_rate?.toFixed(1) || 0, period],
        ['Avg Preparation Time', `${operationalData?.avg_preparation_time_minutes?.toFixed(1) || 0} min`, period],
        ['Waitlist Conversion', `${((waitlistData?.conversion_rate || 0) * 100).toFixed(1)}%`, period]
      ];
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics_${cafe.name}_${period}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Analytics exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export analytics');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [cafe?.id, period]);

  const periodLabels = {
    today: 'Today',
    week: 'Last 7 Days',
    month: 'Last 30 Days',
    quarter: 'Last 90 Days'
  };

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    trend, 
    subtitle,
    color = "default"
  }: {
    title: string;
    value: string | number;
    icon: ComponentType<{ className?: string }>;
    trend?: number;
    subtitle?: string;
    color?: "default" | "success" | "warning" | "danger";
  }) => {
    const colorClasses = {
      default: "bg-primary/10 text-primary",
      success: "bg-success/10 text-success",
      warning: "bg-warning/10 text-warning",
      danger: "bg-destructive/10 text-destructive"
    };

    return (
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold">{value}</h3>
              {trend !== undefined && (
                <Badge variant={trend >= 0 ? "default" : "destructive"} className="text-xs">
                  {trend >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                  {Math.abs(trend)}%
                </Badge>
              )}
            </div>
            {subtitle && <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-full ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <OwnerLayout title="Analytics" subtitle="Loading insights...">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Crunching the numbers...</p>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout 
      title="Analytics" 
      subtitle={`${periodLabels[period]} • ${cafe?.name || 'Your Cafe'}`}
      action={
        <Button onClick={handleExport} disabled={exporting} className="gap-2">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export CSV
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Period Selector */}
        <div className="flex items-center justify-between">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as AnalyticsPeriod)} className="w-full">
            <TabsList className="grid grid-cols-4 w-full max-w-md">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="quarter">Quarter</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Revenue"
            value={fmtMoney((operationalData?.total_revenue_cents || 0) / 100)}
            icon={DollarSign}
            trend={financialData?.revenue_trend}
            color="success"
          />
          <StatCard
            title="Orders"
            value={operationalData?.total_orders || 0}
            icon={ShoppingBag}
            subtitle={`${operationalData?.orders_per_hour?.toFixed(1) || 0}/hour`}
            color="default"
          />
          <StatCard
            title="Avg Order Value"
            value={fmtMoney((operationalData?.avg_order_value_cents || 0) / 100)}
            icon={TrendingUp}
            subtitle="Per order"
            color="warning"
          />
          <StatCard
            title="Table Turnover"
            value={`${operationalData?.table_turnover_rate?.toFixed(1) || 0}x`}
            icon={Coffee}
            subtitle="Per day"
            color="success"
          />
        </div>

        {/* Detailed Analytics Tabs */}
        <Tabs defaultValue="operational" className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="operational" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Operational
            </TabsTrigger>
            <TabsTrigger value="financial" className="gap-2">
              <DollarSign className="w-4 h-4" />
              Financial
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="gap-2">
              <Users className="w-4 h-4" />
              Waitlist
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-2">
              <ChefHat className="w-4 h-4" />
              Staff
            </TabsTrigger>
          </TabsList>

          {/* Operational Analytics */}
          <TabsContent value="operational" className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Operational Performance</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Average Preparation Time</p>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-2xl font-bold">
                        {operationalData?.avg_preparation_time_minutes?.toFixed(1) || 0} min
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Peak Hour</p>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xl font-semibold">
                        {operationalData?.peak_hour || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Waitlist Conversion</p>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span className="text-2xl font-bold">
                        {((waitlistData?.conversion_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={waitlistData?.conversion_rate ? waitlistData.conversion_rate * 100 : 0} className="mt-2" />
                  </div>
                </div>
              </div>
            </Card>

            {/* Popular Items */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Most Popular Items</h3>
              <div className="space-y-3">
                {operationalData?.most_popular_items?.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">{index + 1}</span>
                      </div>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <Badge variant="secondary">{item.count} orders</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* Financial Analytics */}
          <TabsContent value="financial" className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Financial Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Refund Rate</p>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-warning" />
                      <span className="text-2xl font-bold">
                        {((financialData?.refund_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Average Tip</p>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-success" />
                      <span className="text-2xl font-bold">
                        {financialData?.average_tip_percentage?.toFixed(1) || 0}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Repeat Customer Rate</p>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="text-2xl font-bold">
                        {((financialData?.repeat_customer_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={financialData?.repeat_customer_rate ? financialData.repeat_customer_rate * 100 : 0} className="mt-2" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Customer Lifetime Value</p>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-success" />
                      <span className="text-2xl font-bold">
                        {fmtMoney((financialData?.customer_lifetime_value || 0) / 100)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Payment Methods */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Revenue by Payment Method</h3>
              <div className="space-y-3">
                {financialData?.revenue_by_payment_method?.map((method, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-primary"></div>
                      <span className="font-medium">{method.method}</span>
                    </div>
                    <span className="font-bold">{fmtMoney(method.amount_cents / 100)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* Waitlist Analytics */}
          <TabsContent value="waitlist" className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Waitlist Performance</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Waitlist Entries</p>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="text-2xl font-bold">{waitlistData?.total_waitlist_entries || 0}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Average Wait Time</p>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-2xl font-bold">
                        {waitlistData?.average_wait_time_minutes?.toFixed(1) || 0} min
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">No-Show Rate</p>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-warning" />
                      <span className="text-2xl font-bold">
                        {((waitlistData?.no_show_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={waitlistData?.no_show_rate ? waitlistData.no_show_rate * 100 : 0} className="mt-2" />
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Staff Performance */}
          <TabsContent value="staff" className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Staff Performance</h3>
              <div className="space-y-4">
                {staffPerformance.map((staff) => (
                  <div key={staff.staff_id} className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <ChefHat className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{staff.name}</h4>
                          <p className="text-sm text-muted-foreground">{staff.orders_handled} orders handled</p>
                        </div>
                      </div>
                      <Badge variant={staff.efficiency_score >= 85 ? "default" : staff.efficiency_score >= 70 ? "secondary" : "destructive"}>
                        {staff.efficiency_score}% efficiency
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Prep Time</p>
                        <p className="font-bold">{staff.avg_preparation_time_minutes.toFixed(1)} min</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Customer Rating</p>
                        <p className="font-bold">{staff.customer_rating}/100</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Performance</p>
                        <Progress value={staff.efficiency_score} className="mt-1" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </OwnerLayout>
  );
}