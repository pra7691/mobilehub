import { useState } from "react";
import { useListUsers, useUpdateUserStatus, UserStatus } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface PendingAction {
  userId: string;
  phone: string;
  action: "disable" | "enable";
}

export default function Users() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const limit = 15;

  const queryClient = useQueryClient();
  const { data, isLoading } = useListUsers({ page, limit, search: debouncedSearch || undefined });
  const updateStatus = useUpdateUserStatus();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
    setPage(1);
  };

  const handleConfirm = async () => {
    if (!pending) return;
    const newStatus = pending.action === "disable" ? UserStatus.disabled : UserStatus.active;
    await updateStatus.mutateAsync(
      { id: pending.userId, data: { status: newStatus } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ["listUsers"] });
        },
      },
    );
    setPending(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="default" className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-none">
            Active
          </Badge>
        );
      case "inactive":
        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground border-none">
            Inactive
          </Badge>
        );
      case "suspended":
        return (
          <Badge variant="destructive" className="bg-destructive/15 text-destructive hover:bg-destructive/25 border-none">
            Suspended
          </Badge>
        );
      case "disabled":
        return (
          <Badge variant="destructive" className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border-none">
            Disabled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Manage mobile platform operators.</p>
        </div>

        <form onSubmit={handleSearch} className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search phone or name..."
            className="pl-8 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Earnings</TableHead>
              <TableHead className="text-right">Submissions</TableHead>
              <TableHead className="text-right">Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-7 w-16 ml-auto rounded" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((user) => (
                <TableRow key={user.id} className="group">
                  <TableCell>
                    <div className="font-medium text-foreground">{user.phoneNumber}</div>
                    {user.name && <div className="text-xs text-muted-foreground">{user.name}</div>}
                  </TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">₹{user.totalEarnings.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{user.totalSubmissions}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {user.status === UserStatus.disabled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                        onClick={() =>
                          setPending({ userId: user.id, phone: user.phoneNumber, action: "enable" })
                        }
                      >
                        Enable
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() =>
                          setPending({ userId: user.id, phone: user.phoneNumber, action: "disable" })
                        }
                      >
                        Disable
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium">{data.data.length}</span> of{" "}
            <span className="font-medium">{data.meta.total}</span> users
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= data.meta.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Disable / Enable confirmation dialog */}
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "disable" ? "Disable user?" : "Enable user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "disable"
                ? `Disabling ${pending.phone} will immediately block their access. They will see a full-screen blocked state on the mobile app. You can re-enable them at any time.`
                : `Re-enabling ${pending?.phone} will restore their full access to the mobile app immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={updateStatus.isPending}
              className={
                pending?.action === "disable"
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }
            >
              {updateStatus.isPending
                ? pending?.action === "disable"
                  ? "Disabling…"
                  : "Enabling…"
                : pending?.action === "disable"
                ? "Disable"
                : "Enable"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
