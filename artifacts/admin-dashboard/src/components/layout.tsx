import React from "react";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { useLogout } from "@workspace/api-client-react";
import { Activity, Users, FolderTree, FileQuestion, SendToBack, Wallet, Settings, LogOut, Hexagon, Moon, Sun, HelpCircle, Bell, BellRing, Bug, Banknote, GitBranch, Image as ImageIcon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const logoutMutation = useLogout();
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        logout();
      }
    });
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: Activity },
    { href: "/users", label: "Users", icon: Users },
    { href: "/categories", label: "Categories", icon: FolderTree },
    { href: "/subcategories", label: "Subcategories", icon: FolderTree },
    { href: "/tasks", label: "Tasks", icon: FileQuestion },
    { href: "/submissions", label: "Submissions", icon: SendToBack },
    { href: "/wallet-transactions", label: "Wallet", icon: Wallet },
    { href: "/payouts", label: "Payouts", icon: Banknote },
    { href: "/referrals", label: "Referrals", icon: GitBranch },
    { href: "/banners", label: "Banners", icon: ImageIcon },
    { href: "/otp-settings", label: "OTP Settings", icon: Settings },
    { href: "/faq", label: "FAQ", icon: HelpCircle },
    { href: "/notices", label: "Notices", icon: Bell },
    { href: "/notifications", label: "Notifications", icon: BellRing },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/error-logs", label: "Error Logs", icon: Bug },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar className="border-r border-border bg-card">
          <SidebarHeader className="p-4 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2 font-bold text-lg text-primary tracking-tight">
              <Hexagon className="h-5 w-5 fill-primary text-primary" />
              CAPTO
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-border">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 flex items-center gap-4 border-b border-border px-4 bg-card shrink-0">
            <SidebarTrigger />
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="h-9 w-9"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </header>
          <div className="flex-1 overflow-auto p-6 md:p-8">
            <div className="mx-auto max-w-6xl w-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
