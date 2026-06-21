import { useGetDashboardStats, useGetSubmissionTrends, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileQuestion, SendToBack, Wallet, ArrowUpRight, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { formatINR } from "@/lib/utils";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: trendsData, isLoading: trendsLoading } = useGetSubmissionTrends();
  const { data: activityData, isLoading: activityLoading } = useGetRecentActivity();

  const statsItems = [
    { title: "Total Users", value: stats?.totalUsers, icon: Users, subtext: `${stats?.activeUsers || 0} active` },
    { title: "Active Tasks", value: stats?.activeTasks, icon: FileQuestion, subtext: `of ${stats?.totalTasks || 0} total` },
    { title: "Submissions", value: stats?.totalSubmissions, icon: SendToBack, subtext: `${stats?.pendingSubmissions || 0} pending` },
    { title: "Total Earned Today", value: stats?.totalEarnedToday ? formatINR(stats.totalEarnedToday) : "₹0.00", icon: Wallet, subtext: `Total bal: ${stats?.totalWalletBalance ? formatINR(stats.totalWalletBalance) : '₹0.00'}` }
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Real-time pulse of the Capto platform.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsItems.map((item, i) => (
          <Card key={i} className="bg-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
                <item.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col gap-1">
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <span className="text-3xl font-bold tracking-tight">{item.value ?? '-'}</span>
                )}
                <p className="text-xs text-muted-foreground">{item.subtext}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-5 bg-card">
          <CardHeader>
            <CardTitle>Submission Trends</CardTitle>
            <CardDescription>Daily submission volume over the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {trendsLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Activity className="h-8 w-8 text-muted-foreground animate-pulse" />
              </div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendsData?.data || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={30}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      labelFormatter={(val) => new Date(val).toLocaleDateString()}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorCount)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2 bg-card">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest platform actions.</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-4">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-6">
                {activityData?.data?.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4">
                    <div className="bg-secondary p-2 rounded-full mt-0.5">
                      <ArrowUpRight className="h-3 w-3 text-secondary-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                {(!activityData?.data || activityData.data.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
