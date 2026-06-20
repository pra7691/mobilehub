import { useState } from "react";
import {
  useGetAdminNotifications,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertCircle, Bell, CheckCircle, ChevronLeft, ChevronRight, Info, Search, X } from "lucide-react";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SUBMISSION_APPROVED: { label: "Approved", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  SUBMISSION_REJECTED: { label: "Rejected", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  RESUBMISSION_REQUIRED: { label: "Resubmit", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  NEW_TASK: { label: "New Task", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  APP_NOTICE: { label: "Notice", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  isRead: boolean;
  sentAt?: string | null;
  deliveryError?: string | null;
  createdAt: string;
  user?: { id: string; phoneNumber: string; name?: string | null } | null;
};

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [type, setType] = useState("all");
  const [isRead, setIsRead] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  const params: Record<string, string | number | boolean | undefined> = {
    page,
    limit: 20,
    type: type !== "all" ? type : undefined,
    userId: userId || undefined,
    isRead: isRead !== "all" ? isRead === "true" : undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const { data, isLoading } = useGetAdminNotifications(
    params as Parameters<typeof useGetAdminNotifications>[0],
  );

  const notifications = (data as { data?: Notification[] } | undefined)?.data ?? [];
  const meta = (data as { meta?: { total: number; totalPages: number; page: number } } | undefined)?.meta;

  function clearFilters() {
    setType("all");
    setUserId("");
    setIsRead("all");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-cyan-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Notification Logs</h1>
          <p className="text-sm text-gray-400">View all push notifications sent to users</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-[#141414] border-[#1f1f1f]">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="relative col-span-2 md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Filter by User ID"
                value={userId}
                onChange={(e) => { setUserId(e.target.value); setPage(1); }}
                className="pl-9 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-600 h-9"
              />
            </div>

            <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
              <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white h-9">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="SUBMISSION_APPROVED">Approved</SelectItem>
                <SelectItem value="SUBMISSION_REJECTED">Rejected</SelectItem>
                <SelectItem value="RESUBMISSION_REQUIRED">Resubmit</SelectItem>
                <SelectItem value="NEW_TASK">New Task</SelectItem>
                <SelectItem value="APP_NOTICE">Notice</SelectItem>
              </SelectContent>
            </Select>

            <Select value={isRead} onValueChange={(v) => { setIsRead(v); setPage(1); }}>
              <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white h-9">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="true">Read</SelectItem>
                <SelectItem value="false">Unread</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white h-9"
              placeholder="From"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white h-9"
              placeholder="To"
            />
          </div>

          {(type !== "all" || userId || isRead !== "all" || from || to) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">Active filters:</span>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-gray-400 hover:text-white">
                <X className="w-3 h-3 mr-1" /> Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table + Detail Panel */}
      <div className="flex gap-4">
        <Card className="flex-1 bg-[#141414] border-[#1f1f1f] overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#1f1f1f] hover:bg-transparent">
                  <TableHead className="text-gray-400 w-32">Type</TableHead>
                  <TableHead className="text-gray-400">User</TableHead>
                  <TableHead className="text-gray-400">Title</TableHead>
                  <TableHead className="text-gray-400 w-24">Read</TableHead>
                  <TableHead className="text-gray-400 w-24">Delivery</TableHead>
                  <TableHead className="text-gray-400 w-36">Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : notifications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                      No notifications found
                    </TableCell>
                  </TableRow>
                ) : (
                  notifications.map((n) => {
                    const typeInfo = TYPE_LABELS[n.type];
                    const hasError = !!n.deliveryError && n.deliveryError !== "no_active_tokens";
                    return (
                      <TableRow
                        key={n.id}
                        className={`border-[#1f1f1f] cursor-pointer transition-colors ${selectedNotif?.id === n.id ? "bg-cyan-500/5" : "hover:bg-[#1a1a1a]"}`}
                        onClick={() => setSelectedNotif(n)}
                      >
                        <TableCell>
                          <Badge className={`text-xs ${typeInfo?.color ?? "bg-gray-500/10 text-gray-400"}`}>
                            {typeInfo?.label ?? n.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-300 text-sm font-mono">
                          {n.user?.phoneNumber ?? n.userId.slice(0, 12) + "…"}
                        </TableCell>
                        <TableCell className="text-gray-200 text-sm max-w-[200px] truncate">
                          {n.title}
                        </TableCell>
                        <TableCell>
                          {n.isRead ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-cyan-400 block" />
                          )}
                        </TableCell>
                        <TableCell>
                          {hasError ? (
                            <AlertCircle className="w-4 h-4 text-red-400" />
                          ) : n.sentAt ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <span className="text-gray-600 text-xs">Pending</span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-400 text-xs">
                          {n.sentAt ? new Date(n.sentAt).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#1f1f1f]">
                <span className="text-xs text-gray-500">
                  Page {meta.page} of {meta.totalPages} · {meta.total} total
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="border-[#2a2a2a] bg-transparent text-gray-300 h-8 w-8 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= meta.totalPages}
                    className="border-[#2a2a2a] bg-transparent text-gray-300 h-8 w-8 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Panel */}
        {selectedNotif && (
          <Card className="w-80 bg-[#141414] border-[#1f1f1f] flex-shrink-0 self-start">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-sm font-semibold text-white">Detail</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedNotif(null)}
                  className="h-6 w-6 p-0 text-gray-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs mb-1">Type</p>
                <Badge className={`text-xs ${TYPE_LABELS[selectedNotif.type]?.color ?? ""}`}>
                  {TYPE_LABELS[selectedNotif.type]?.label ?? selectedNotif.type}
                </Badge>
              </div>

              <div>
                <p className="text-gray-500 text-xs mb-1">User</p>
                <p className="text-gray-300 font-mono text-xs">
                  {selectedNotif.user?.name ?? "—"}<br />
                  {selectedNotif.user?.phoneNumber ?? selectedNotif.userId}
                </p>
              </div>

              <div>
                <p className="text-gray-500 text-xs mb-1">Title</p>
                <p className="text-white font-medium">{selectedNotif.title}</p>
              </div>

              <div>
                <p className="text-gray-500 text-xs mb-1">Body</p>
                <p className="text-gray-300 leading-relaxed">{selectedNotif.body}</p>
              </div>

              {selectedNotif.relatedEntityType && (
                <div>
                  <p className="text-gray-500 text-xs mb-1">Related</p>
                  <p className="text-gray-300 text-xs">
                    {selectedNotif.relatedEntityType}: <span className="font-mono">{selectedNotif.relatedEntityId}</span>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-gray-500 text-xs mb-1">Read</p>
                  <p className={selectedNotif.isRead ? "text-green-400 text-xs" : "text-gray-400 text-xs"}>
                    {selectedNotif.isRead ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Sent</p>
                  <p className="text-gray-300 text-xs">
                    {selectedNotif.sentAt ? new Date(selectedNotif.sentAt).toLocaleString() : "Pending"}
                  </p>
                </div>
              </div>

              {selectedNotif.deliveryError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-xs font-semibold">Delivery Error</p>
                  </div>
                  <p className="text-red-300 text-xs leading-relaxed break-all">
                    {selectedNotif.deliveryError}
                  </p>
                </div>
              )}

              <div>
                <p className="text-gray-500 text-xs mb-1">Created</p>
                <p className="text-gray-400 text-xs">{new Date(selectedNotif.createdAt).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
