import React, { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireRole } from "@/components/RequireRole";
import { RequireStaff } from "@/components/RequireStaff";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/hooks/useAuth";

const CustomerLanding = lazy(() => import("./pages/CustomerLanding"));
const Landing = lazy(() => import("./pages/Landing")); // SaaS landing for cafe owners
const Auth = lazy(() => import("./pages/Auth")); // customer auth
const OwnerAuth = lazy(() => import("./pages/OwnerAuth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ClaimAccount = lazy(() => import("./pages/ClaimAccount"));
const Discover = lazy(() => import("./pages/Discover"));
const CafePublic = lazy(() => import("./pages/CafePublic"));
const OwnerSetup = lazy(() => import("./pages/OwnerSetup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const OwnerOrders = lazy(() => import("./pages/owner/Orders"));
const OwnerBookings = lazy(() => import("./pages/owner/Bookings"));
const OwnerCustomers = lazy(() => import("./pages/owner/Customers"));
const OwnerLoyalty = lazy(() => import("./pages/owner/Loyalty"));
const OwnerMenu = lazy(() => import("./pages/owner/Menu"));
const OwnerQR = lazy(() => import("./pages/owner/QR"));
const OwnerStaff = lazy(() => import("./pages/owner/Staff"));
const OwnerSettings = lazy(() => import("./pages/owner/Settings"));
const OwnerPayments = lazy(() => import("./pages/owner/Payments"));
const OwnerTableQRManagement = lazy(() => import("./pages/owner/TableQRManagement"));
const KDSPage = lazy(() => import("./pages/KDS"));
const StaffJoin = lazy(() => import("./pages/staff/Join"));
const StaffDashboard = lazy(() => import("./pages/staff/Dashboard"));
const StaffHistory = lazy(() => import("./pages/staff/History"));
const StaffMe = lazy(() => import("./pages/staff/Me"));
const StaffShift = lazy(() => import("./pages/staff/Shift"));
const CustomerHome = lazy(() => import("./pages/app/Home"));
const CustomerMenu = lazy(() => import("./pages/app/Menu"));
const CustomerOrders = lazy(() => import("./pages/app/Orders"));
const CustomerProfile = lazy(() => import("./pages/app/Profile"));
const CustomerRewards = lazy(() => import("./pages/app/Rewards"));
const CustomerBook = lazy(() => import("./pages/app/Book"));
const CustomerBookings = lazy(() => import("./pages/app/Bookings"));
const CustomerInvoice = lazy(() => import("./pages/app/Invoice"));
const CustomerFavorites = lazy(() => import("./pages/app/Favorites"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300_000, // Increased from 120s to 300s (5 minutes) for better performance
      gcTime: 600_000, // 10 minutes cache time (default is 5 minutes, increased for better cache)
      refetchOnWindowFocus: false,
      retry: 1,
    }
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" richColors closeButton />
      <HashRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }>
              <Routes>
                {/* Public — customer-first */}
                <Route path="/" element={<CustomerLanding />} />
                <Route path="/for-cafes" element={<Landing />} />
                <Route path="/for-cafes/auth" element={<OwnerAuth />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/staff/join" element={<StaffJoin />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/claim-account" element={<ClaimAccount />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/cafe/:slug" element={<CafePublic />} />
                <Route path="/cafe/:slug/table/:tableNo" element={<CafePublic />} />

                {/* Owner */}
                <Route path="/owner-setup" element={<RequireRole role="owner"><OwnerSetup /></RequireRole>} />
                <Route path="/dashboard" element={<RequireRole role="owner"><Dashboard /></RequireRole>} />
                <Route path="/owner/orders" element={<RequireRole role="owner"><OwnerOrders /></RequireRole>} />
                <Route path="/owner/bookings" element={<RequireRole role="owner"><OwnerBookings /></RequireRole>} />
                <Route path="/owner/customers" element={<RequireRole role="owner"><OwnerCustomers /></RequireRole>} />
                <Route path="/owner/loyalty" element={<RequireRole role="owner"><OwnerLoyalty /></RequireRole>} />
                <Route path="/owner/menu" element={<RequireRole role="owner"><OwnerMenu /></RequireRole>} />
                <Route path="/owner/qr" element={<RequireRole role="owner"><OwnerQR /></RequireRole>} />
                <Route path="/owner/table-qr" element={<RequireRole role="owner"><OwnerTableQRManagement /></RequireRole>} />
                <Route path="/owner/staff" element={<RequireRole role="owner"><OwnerStaff /></RequireRole>} />
                <Route path="/owner/payments" element={<RequireRole role="owner"><OwnerPayments /></RequireRole>} />
                <Route path="/owner/live" element={<Navigate to="/owner/orders" replace />} />
                <Route path="/owner/settings" element={<RequireRole role="owner"><OwnerSettings /></RequireRole>} />

                {/* Staff */}
                <Route path="/staff" element={<RequireStaff><StaffDashboard /></RequireStaff>} />
                <Route path="/staff/history" element={<RequireStaff><StaffHistory /></RequireStaff>} />
                <Route path="/staff/me" element={<RequireStaff><StaffMe /></RequireStaff>} />
                <Route path="/staff/shift" element={<RequireStaff><StaffShift /></RequireStaff>} />

                {/* KDS — paired kitchen device, no login */}
                <Route path="/kds" element={<KDSPage />} />

                {/* Customer (includes guest/anonymous users) */}
                <Route path="/app" element={<RequireRole role="customer"><CustomerHome /></RequireRole>} />
                <Route path="/app/menu" element={<RequireRole role="customer"><CustomerMenu /></RequireRole>} />
                <Route path="/app/orders" element={<RequireRole role="customer"><CustomerOrders /></RequireRole>} />
                <Route path="/app/profile" element={<RequireRole role="customer"><CustomerProfile /></RequireRole>} />
                <Route path="/app/rewards" element={<RequireRole role="customer"><CustomerRewards /></RequireRole>} />
                <Route path="/app/book" element={<RequireRole role="customer"><CustomerBook /></RequireRole>} />
                <Route path="/app/bookings" element={<RequireRole role="customer"><CustomerBookings /></RequireRole>} />
                <Route path="/app/favorites" element={<RequireRole role="customer"><CustomerFavorites /></RequireRole>} />
                <Route path="/app/orders/:id/invoice" element={<RequireRole role="customer"><CustomerInvoice /></RequireRole>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
