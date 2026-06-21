import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";

// Components
import { Layout } from "@/components/layout";

// Pages
import Dashboard from "@/pages/dashboard";
import Login from "@/pages/login";
import Users from "@/pages/users";
import Categories from "@/pages/categories";
import Subcategories from "@/pages/subcategories";
import Tasks from "@/pages/tasks";
import Submissions from "@/pages/submissions";
import WalletTransactions from "@/pages/wallet-transactions";
import OtpSettings from "@/pages/otp-settings";
import FaqPage from "@/pages/faq";
import NoticesPage from "@/pages/notices";
import NotificationsPage from "@/pages/notifications";
import SettingsPage from "@/pages/settings";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" />;
  
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/" /> : <Login />}
      </Route>
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/users" component={() => <ProtectedRoute component={Users} />} />
      <Route path="/categories" component={() => <ProtectedRoute component={Categories} />} />
      <Route path="/subcategories" component={() => <ProtectedRoute component={Subcategories} />} />
      <Route path="/tasks" component={() => <ProtectedRoute component={Tasks} />} />
      <Route path="/submissions" component={() => <ProtectedRoute component={Submissions} />} />
      <Route path="/wallet-transactions" component={() => <ProtectedRoute component={WalletTransactions} />} />
      <Route path="/otp-settings" component={() => <ProtectedRoute component={OtpSettings} />} />
      <Route path="/faq" component={() => <ProtectedRoute component={FaqPage} />} />
      <Route path="/notices" component={() => <ProtectedRoute component={NoticesPage} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={NotificationsPage} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={SettingsPage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="dark" storageKey="capto-theme">
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
