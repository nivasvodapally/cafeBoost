import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireRole } from "@/components/RequireRole";
import { RequireStaff } from "@/components/RequireStaff";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/hooks/useAuth";
import { GuestSessionGuard } from "@/components/GuestSessionGuard";

import CustomerLanding from "./pages/CustomerLanding";
import Landing from "./pages/Landing"; // SaaS landing for cafe owners
import Auth from "./pages/Auth"; // customer auth
import OwnerAuth from "./pages/OwnerAuth";
import ResetPassword from "./pages/ResetPassword";
import ClaimAccount from "./pages/ClaimAccount";
import Discover from "./pages/Discover";
import CafePublic from "./pages/CafePublic";
import OwnerSetup from "./pages/OwnerSetup";
import Dashboard from "./pages/Dashboard";
import OwnerOrders from "./pages/owner/Orders";
import OwnerBookings from "./pages/owner/Bookings";
import OwnerCustomers from "./pages/owner/Customers";
import OwnerLoyalty from "./pages/owner/Loyalty";
import OwnerMenu from "./pages/owner/Menu";
import OwnerQR from "./pages/owner/QR";
import OwnerStaff from "./pages/owner/Staff";
import OwnerSettings from "./pages/owner/Settings";
import OwnerPayments from "./pages/owner/Payments";
import OwnerLiveOps from "./pages/owner/LiveOps";
import KDSPage from "./pages/KDS";
import StaffJoin from "./pages/staff/Join";
import StaffDashboard from "./pages/staff/Dashboard";
import StaffHistory from "./pages/staff/History";
import StaffMe from "./pages/staff/Me";
import StaffShift from "./pages/staff/Shift";
import CustomerHome from "./pages/app/Home";
import CustomerMenu from "./pages/app/Menu";
import CustomerOrders from "./pages/app/Orders";
import CustomerProfile from "./pages/app/Profile";
import CustomerRewards from "./pages/app/Rewards";
import CustomerBook from "./pages/app/Book";
import CustomerInvoice from "./pages/app/Invoice";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" richColors closeButton />
      <HashRouter>
        <AuthProvider>
          <ErrorBoundary>
            <GuestSessionGuard />
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
              <Route path="/owner/staff" element={<RequireRole role="owner"><OwnerStaff /></RequireRole>} />
              <Route path="/owner/payments" element={<RequireRole role="owner"><OwnerPayments /></RequireRole>} />
              <Route path="/owner/live" element={<RequireRole role="owner"><OwnerLiveOps /></RequireRole>} />
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
              <Route path="/app/orders/:id/invoice" element={<RequireRole role="customer"><CustomerInvoice /></RequireRole>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
