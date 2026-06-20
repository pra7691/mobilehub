import { useState } from "react";
import { useListSubmissions, useUpdateSubmissionStatus, getListSubmissionsQueryKey, ListSubmissionsStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Search, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";

export default function Submissions() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ListSubmissionsStatus | "all">("under_review");
  const limit = 15;

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data, isLoading } = useListSubmissions({ 
    page, 
    limit,
    status: statusFilter !== "all" ? statusFilter : undefined
  });

  const updateStatusMutation = useUpdateSubmissionStatus();

  const handleApprove = (id: string) => {
    updateStatusMutation.mutate(
      { id, data: { status: "approved" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });
        }
      }
    );
  };

  const openRejectDialog = (id: string) => {
    setActiveSubmissionId(id);
    setReviewNote("");
    setRejectDialogOpen(true);
  };

  const handleReject = () => {
    if (!activeSubmissionId || !reviewNote) return;
    
    updateStatusMutation.mutate(
      { id: activeSubmissionId, data: { status: "rejected", reviewNote } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });
          setRejectDialogOpen(false);
        }
      }
    );
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'approved': return <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-none">Approved</Badge>;
      case 'rejected': return <Badge variant="destructive" className="bg-destructive/15 text-destructive hover:bg-destructive/25 border-none">Rejected</Badge>;
      case 'under_review': return <Badge className="bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 border-none">Under Review</Badge>;
      case 'pending': return <Badge variant="secondary" className="bg-muted text-muted-foreground border-none">Pending</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
          <p className="text-sm text-muted-foreground">Review and approve incoming data.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[180px] bg-card">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Task</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Reward</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No submissions found matching the criteria.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{sub.task?.title || "Unknown Task"}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">ID: {sub.id.substring(0,8)}...</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{sub.user?.phoneNumber || "Unknown User"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm" title={new Date(sub.createdAt).toLocaleString()}>
                      {formatDistanceToNow(new Date(sub.createdAt), { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(sub.status)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    ${sub.rewardAmount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {(sub.status === "pending" || sub.status === "under_review") && (
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => openRejectDialog(sub.id)}
                          disabled={updateStatusMutation.isPending}
                        >
                          <XCircle className="h-4 w-4" />
                          <span className="sr-only">Reject</span>
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                          onClick={() => handleApprove(sub.id)}
                          disabled={updateStatusMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="sr-only">Approve</span>
                        </Button>
                      </div>
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
            Showing <span className="font-medium">{data.data.length}</span> of <span className="font-medium">{data.meta.total}</span> submissions
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => p + 1)}
              disabled={page >= data.meta.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[425px] border-border bg-card">
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this submission. The user will see this note.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea 
              placeholder="e.g. Photo is too blurry, missing required details..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              className="bg-background min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!reviewNote || updateStatusMutation.isPending}>
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
