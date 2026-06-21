import { useState } from "react";
import {
  useAdminListSubmissions,
  useAdminGetSubmission,
  useAdminApproveSubmission,
  useAdminRejectSubmission,
  useAdminRequestResubmission,
  getAdminGetSubmissionQueryKey,
  getAdminListSubmissionsQueryKey,
  type Submission,
  type SubmissionMedia,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, Search, Filter, Image, Video, Mic, X, ExternalLink,
  Info, CheckCircle, XCircle, RefreshCw, Loader2,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { formatINR } from "@/lib/utils";

type SubmissionStatusValue =
  | "DRAFT" | "UPLOADING" | "UNDER_REVIEW" | "APPROVED"
  | "REJECTED" | "RESUBMISSION_REQUIRED" | "UPLOAD_FAILED";

type CollectionTypeValue = "VIDEO" | "IMAGE" | "AUDIO";

type ReviewTab = "approve" | "reject" | "resubmit";
type ConfirmAction = "approve" | "reject" | "resubmit";

const STATUS_BADGE: Record<SubmissionStatusValue, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-500/15 text-slate-400 border-none" },
  UPLOADING: { label: "Uploading", className: "bg-cyan-500/15 text-cyan-400 border-none" },
  UNDER_REVIEW: { label: "Under Review", className: "bg-amber-500/15 text-amber-400 border-none" },
  APPROVED: { label: "Approved", className: "bg-emerald-500/15 text-emerald-500 border-none" },
  REJECTED: { label: "Rejected", className: "bg-red-500/15 text-red-500 border-none" },
  RESUBMISSION_REQUIRED: { label: "Resubmit", className: "bg-orange-500/15 text-orange-400 border-none" },
  UPLOAD_FAILED: { label: "Upload Failed", className: "bg-red-900/30 text-red-400 border-none" },
};

const COLLECTION_ICON: Record<CollectionTypeValue, React.ReactNode> = {
  VIDEO: <Video className="h-3.5 w-3.5" />,
  IMAGE: <Image className="h-3.5 w-3.5" />,
  AUDIO: <Mic className="h-3.5 w-3.5" />,
};

function getStatusBadge(status: string) {
  const cfg = STATUS_BADGE[status as SubmissionStatusValue] ?? STATUS_BADGE["DRAFT"];
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

function getTaskTitle(sub: Submission): string {
  return (sub.taskSnapshot as { title?: string } | undefined)?.title ?? "Unknown Task";
}

type TaskSnapshot = {
  title?: string;
  collectionType?: string;
  paymentAmount?: number;
  currency?: string;
  minimumDurationSeconds?: number;
  maximumDurationSeconds?: number;
  minimumImageCount?: number;
  maximumImageCount?: number;
  category?: { name: string };
  subcategory?: { name: string };
};

export default function Submissions() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<SubmissionStatusValue | "all">("UNDER_REVIEW");
  const [collectionFilter, setCollectionFilter] = useState<CollectionTypeValue | "all">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [userIdInput, setUserIdInput] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [taskIdInput, setTaskIdInput] = useState("");
  const [taskIdFilter, setTaskIdFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reviewTab, setReviewTab] = useState<ReviewTab>("approve");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const [approvedAmount, setApprovedAmount] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [resubmissionReason, setResubmissionReason] = useState("");
  const [resubmitNote, setResubmitNote] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const limit = 15;
  const queryClient = useQueryClient();

  const { data, isLoading } = useAdminListSubmissions({
    page, limit,
    status: statusFilter !== "all" ? statusFilter : undefined,
    collectionType: collectionFilter !== "all" ? collectionFilter : undefined,
    search: search || undefined,
    userId: userIdFilter || undefined,
    taskId: taskIdFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: selectedSub, isLoading: detailLoading } = useAdminGetSubmission(
    selectedId ?? "",
    { query: { enabled: !!selectedId, queryKey: getAdminGetSubmissionQueryKey(selectedId ?? "") } }
  );

  const approveMutation = useAdminApproveSubmission();
  const rejectMutation = useAdminRejectSubmission();
  const resubmitMutation = useAdminRequestResubmission();

  const isSubmitting =
    approveMutation.isPending || rejectMutation.isPending || resubmitMutation.isPending;

  function openDetail(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
    setReviewTab("approve");
    setConfirmAction(null);
    setApprovedAmount("");
    setApproveNote("");
    setRejectionReason("");
    setRejectNote("");
    setResubmissionReason("");
    setResubmitNote("");
    setReviewSuccess(null);
    setReviewError(null);
  }

  async function executeConfirmedAction() {
    if (confirmAction === "approve") await handleApprove();
    else if (confirmAction === "reject") await handleReject();
    else if (confirmAction === "resubmit") await handleResubmit();
    setConfirmAction(null);
  }

  function handleSearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  async function handleApprove() {
    if (!selectedId) return;
    setReviewError(null);
    setReviewSuccess(null);
    try {
      await approveMutation.mutateAsync({
        id: selectedId,
        data: {
          approvedAmount: approvedAmount ? parseFloat(approvedAmount) : undefined,
          adminNote: approveNote || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getAdminListSubmissionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getAdminGetSubmissionQueryKey(selectedId) });
      setReviewSuccess("Submission approved and wallet credited.");
    } catch {
      setReviewError("Failed to approve submission. Please try again.");
    }
  }

  async function handleReject() {
    if (!selectedId || !rejectionReason.trim()) return;
    setReviewError(null);
    setReviewSuccess(null);
    try {
      await rejectMutation.mutateAsync({
        id: selectedId,
        data: {
          rejectionReason: rejectionReason.trim(),
          adminNote: rejectNote || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getAdminListSubmissionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getAdminGetSubmissionQueryKey(selectedId) });
      setReviewSuccess("Submission rejected.");
    } catch {
      setReviewError("Failed to reject submission. Please try again.");
    }
  }

  async function handleResubmit() {
    if (!selectedId || !resubmissionReason.trim()) return;
    setReviewError(null);
    setReviewSuccess(null);
    try {
      await resubmitMutation.mutateAsync({
        id: selectedId,
        data: {
          resubmissionReason: resubmissionReason.trim(),
          adminNote: resubmitNote.trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getAdminListSubmissionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getAdminGetSubmissionQueryKey(selectedId) });
      setReviewSuccess("Resubmission requested. User has been notified.");
    } catch {
      setReviewError("Failed to request resubmission. Please try again.");
    }
  }

  const taskSnapshot = selectedSub?.taskSnapshot as TaskSnapshot | undefined;
  const snapshotAmount = selectedSub?.paymentAmountSnapshot;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <p className="text-sm text-muted-foreground">View and review incoming field data submissions.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 pr-9 bg-card"
            placeholder="Search by ID, phone, task…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          {searchInput && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={clearSearch}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as SubmissionStatusValue | "all"); setPage(1); }}>
          <SelectTrigger className="w-[180px] bg-card">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="RESUBMISSION_REQUIRED">Resubmit Required</SelectItem>
            <SelectItem value="UPLOAD_FAILED">Upload Failed</SelectItem>
            <SelectItem value="UPLOADING">Uploading</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
          </SelectContent>
        </Select>

        <Select value={collectionFilter} onValueChange={(v) => { setCollectionFilter(v as CollectionTypeValue | "all"); setPage(1); }}>
          <SelectTrigger className="w-[150px] bg-card">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="IMAGE">Image</SelectItem>
            <SelectItem value="VIDEO">Video</SelectItem>
            <SelectItem value="AUDIO">Audio</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Secondary filter row: user, task, date range */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative">
          <Input
            className="pl-3 pr-3 bg-card w-[170px] text-sm"
            placeholder="User ID…"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setUserIdFilter(userIdInput.trim()); setPage(1); }
            }}
            onBlur={() => { if (userIdInput.trim() !== userIdFilter) { setUserIdFilter(userIdInput.trim()); setPage(1); } }}
          />
        </div>
        <div className="relative">
          <Input
            className="pl-3 pr-3 bg-card w-[170px] text-sm"
            placeholder="Task ID…"
            value={taskIdInput}
            onChange={(e) => setTaskIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setTaskIdFilter(taskIdInput.trim()); setPage(1); }
            }}
            onBlur={() => { if (taskIdInput.trim() !== taskIdFilter) { setTaskIdFilter(taskIdInput.trim()); setPage(1); } }}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            title="From date"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            title="To date"
          />
        </div>
        {(userIdFilter || taskIdFilter || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setUserIdInput(""); setUserIdFilter("");
              setTaskIdInput(""); setTaskIdFilter("");
              setDateFrom(""); setDateTo("");
              setPage(1);
            }}
          >
            <X className="h-3.5 w-3.5 mr-1" />Clear filters
          </Button>
        )}
        {search && (
          <Button variant="ghost" size="sm" onClick={clearSearch}>
            <X className="h-3.5 w-3.5 mr-1" />Clear search
          </Button>
        )}
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Task</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Reward</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No submissions found.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((sub) => (
                <TableRow
                  key={sub.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => openDetail(sub.id)}
                >
                  <TableCell>
                    <div className="font-medium text-foreground">{getTaskTitle(sub)}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{sub.id.substring(0, 8)}…</div>
                  </TableCell>
                  <TableCell>
                    {(sub as { taskSnapshot?: { category?: { name: string }; subcategory?: { name: string } } }).taskSnapshot?.category?.name
                      ? <div className="text-sm">{(sub as { taskSnapshot?: { category?: { name: string }; subcategory?: { name: string } } }).taskSnapshot!.category!.name}</div>
                      : <span className="text-muted-foreground text-xs">—</span>}
                    {(sub as { taskSnapshot?: { subcategory?: { name: string } } }).taskSnapshot?.subcategory?.name && (
                      <div className="text-xs text-muted-foreground">{(sub as { taskSnapshot?: { subcategory?: { name: string } } }).taskSnapshot!.subcategory!.name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{sub.user?.phoneNumber ?? "—"}</div>
                    {sub.user?.name && <div className="text-xs text-muted-foreground">{sub.user.name}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      {COLLECTION_ICON[sub.collectionType as CollectionTypeValue]}
                      <span className="text-xs">{sub.collectionType}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm" title={new Date(sub.submittedAt ?? sub.createdAt).toLocaleString()}>
                      {formatDistanceToNow(new Date(sub.submittedAt ?? sub.createdAt), { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(sub.status)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {formatINR(sub.paymentAmountSnapshot)}
                  </TableCell>
                  <TableCell>
                    <Info className="h-4 w-4 text-muted-foreground" />
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
            <span className="font-medium">{data.meta.total}</span> submissions
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.meta.totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto bg-card border-border">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg">Submission Detail</SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : selectedSub ? (
            <div className="space-y-6 text-sm">
              <section className="space-y-2">
                <div className="flex items-center gap-3">
                  {getStatusBadge(selectedSub.status)}
                  <span className="text-xs text-muted-foreground font-mono">{selectedSub.id}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <DetailRow label="User" value={selectedSub.user?.phoneNumber ?? "—"} />
                  {selectedSub.user?.name && <DetailRow label="Name" value={selectedSub.user.name} />}
                  <DetailRow label="Collection" value={selectedSub.collectionType} />
                  <DetailRow label="Created" value={format(new Date(selectedSub.createdAt), "dd MMM yyyy HH:mm")} />
                  {selectedSub.submittedAt && (
                    <DetailRow label="Submitted" value={format(new Date(selectedSub.submittedAt), "dd MMM yyyy HH:mm")} />
                  )}
                  {selectedSub.uploadCompletedAt && (
                    <DetailRow label="Upload completed" value={format(new Date(selectedSub.uploadCompletedAt), "dd MMM yyyy HH:mm")} />
                  )}
                  {selectedSub.failureReason && (
                    <DetailRow label="Failure" value={selectedSub.failureReason} />
                  )}
                </div>
              </section>

              {/* ── Review action panel (only for UNDER_REVIEW) ── */}
              {selectedSub.status === "UNDER_REVIEW" && (
                <section>
                  <SectionTitle>Review Action</SectionTitle>
                  <div className="bg-background rounded-lg border border-border overflow-hidden">
                    {/* Tab bar */}
                    <div className="flex border-b border-border">
                      {(["approve", "reject", "resubmit"] as ReviewTab[]).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => { setReviewTab(tab); setReviewSuccess(null); setReviewError(null); }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                            reviewTab === tab
                              ? tab === "approve"
                                ? "bg-emerald-500/10 text-emerald-500 border-b-2 border-emerald-500"
                                : tab === "reject"
                                  ? "bg-red-500/10 text-red-500 border-b-2 border-red-500"
                                  : "bg-orange-500/10 text-orange-400 border-b-2 border-orange-400"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                          }`}
                        >
                          {tab === "approve" && <CheckCircle className="h-3.5 w-3.5" />}
                          {tab === "reject" && <XCircle className="h-3.5 w-3.5" />}
                          {tab === "resubmit" && <RefreshCw className="h-3.5 w-3.5" />}
                          {tab === "approve" ? "Approve" : tab === "reject" ? "Reject" : "Request Resubmission"}
                        </button>
                      ))}
                    </div>

                    {/* Feedback messages */}
                    {reviewSuccess && (
                      <div className="mx-3 mt-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-500">
                        {reviewSuccess}
                      </div>
                    )}
                    {reviewError && (
                      <div className="mx-3 mt-3 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-500">
                        {reviewError}
                      </div>
                    )}

                    {/* Approve form */}
                    {reviewTab === "approve" && (
                      <div className="p-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            Approved Amount (leave blank for {snapshotAmount != null ? formatINR(snapshotAmount) : "—"})
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={snapshotAmount?.toFixed(2)}
                            value={approvedAmount}
                            onChange={(e) => setApprovedAmount(e.target.value)}
                            className="bg-card h-8 text-sm"
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Admin Note (optional)</Label>
                          <Textarea
                            placeholder="Internal note…"
                            value={approveNote}
                            onChange={(e) => setApproveNote(e.target.value)}
                            rows={2}
                            className="bg-card text-sm resize-none"
                            disabled={isSubmitting}
                          />
                        </div>
                        <Button
                          size="sm"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => setConfirmAction("approve")}
                          disabled={isSubmitting || !!reviewSuccess}
                        >
                          {approveMutation.isPending ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Approving…</>
                          ) : (
                            <><CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve & Credit Wallet</>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Reject form */}
                    {reviewTab === "reject" && (
                      <div className="p-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Rejection Reason <span className="text-red-500">*</span></Label>
                          <Textarea
                            placeholder="Explain why this submission is being rejected…"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            rows={3}
                            className="bg-card text-sm resize-none"
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Admin Note (optional)</Label>
                          <Textarea
                            placeholder="Internal note…"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            rows={2}
                            className="bg-card text-sm resize-none"
                            disabled={isSubmitting}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full"
                          onClick={() => setConfirmAction("reject")}
                          disabled={isSubmitting || !rejectionReason.trim() || !!reviewSuccess}
                        >
                          {rejectMutation.isPending ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Rejecting…</>
                          ) : (
                            <><XCircle className="h-3.5 w-3.5 mr-1" /> Reject Submission</>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Request resubmission form */}
                    {reviewTab === "resubmit" && (
                      <div className="p-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Feedback for user <span className="text-red-500">*</span></Label>
                          <Textarea
                            placeholder="Tell the user what needs to be corrected or resubmitted…"
                            value={resubmissionReason}
                            onChange={(e) => setResubmissionReason(e.target.value)}
                            rows={3}
                            className="bg-card text-sm resize-none"
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Admin Note (optional, not shown to user)</Label>
                          <Textarea
                            placeholder="Internal note…"
                            value={resubmitNote}
                            onChange={(e) => setResubmitNote(e.target.value)}
                            rows={2}
                            className="bg-card text-sm resize-none"
                            disabled={isSubmitting}
                          />
                        </div>
                        <Button
                          size="sm"
                          className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                          onClick={() => setConfirmAction("resubmit")}
                          disabled={isSubmitting || !resubmissionReason.trim() || !!reviewSuccess}
                        >
                          {resubmitMutation.isPending ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Sending…</>
                          ) : (
                            <><RefreshCw className="h-3.5 w-3.5 mr-1" /> Request Resubmission</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Review result for concluded submissions */}
              {(selectedSub.status === "APPROVED" || selectedSub.status === "REJECTED" || selectedSub.status === "RESUBMISSION_REQUIRED") && (
                <section>
                  <SectionTitle>Review</SectionTitle>
                  <div className="bg-background rounded-lg border border-border p-3 space-y-1.5">
                    {selectedSub.approvedAmount != null && (
                      <DetailRow label="Approved amount" value={formatINR(Number(selectedSub.approvedAmount))} />
                    )}
                    {selectedSub.rejectionReason && (
                      <div>
                        <span className="text-xs text-muted-foreground">Rejection reason: </span>
                        <span className="text-xs text-red-400 font-medium">{selectedSub.rejectionReason}</span>
                      </div>
                    )}
                    {selectedSub.resubmissionReason && (
                      <div>
                        <span className="text-xs text-muted-foreground">Feedback: </span>
                        <span className="text-xs text-orange-400 font-medium">{selectedSub.resubmissionReason}</span>
                      </div>
                    )}
                    {selectedSub.adminNote && <DetailRow label="Admin note" value={selectedSub.adminNote} />}
                    {selectedSub.reviewedBy && <DetailRow label="Reviewed by" value={selectedSub.reviewedBy} />}
                    {selectedSub.reviewedAt && <DetailRow label="Reviewed at" value={format(new Date(selectedSub.reviewedAt), "dd MMM yyyy HH:mm")} />}
                  </div>
                </section>
              )}

              {/* Task snapshot */}
              {taskSnapshot && (
                <section>
                  <SectionTitle>Task Snapshot</SectionTitle>
                  <div className="bg-background rounded-lg border border-border p-3 space-y-1">
                    <p className="font-medium text-foreground">{taskSnapshot.title ?? "—"}</p>
                    <div className="grid grid-cols-2 gap-1 text-muted-foreground mt-2">
                      {taskSnapshot.category && <DetailRow label="Category" value={taskSnapshot.category.name} />}
                      {taskSnapshot.subcategory && <DetailRow label="Subcategory" value={taskSnapshot.subcategory.name} />}
                      <DetailRow
                        label="Reward"
                        value={taskSnapshot.paymentAmount != null ? formatINR(taskSnapshot.paymentAmount) : "—"}
                      />
                      {taskSnapshot.minimumDurationSeconds != null && (
                        <DetailRow label="Min duration" value={`${taskSnapshot.minimumDurationSeconds}s`} />
                      )}
                      {taskSnapshot.maximumDurationSeconds != null && (
                        <DetailRow label="Max duration" value={`${taskSnapshot.maximumDurationSeconds}s`} />
                      )}
                      {taskSnapshot.minimumImageCount != null && (
                        <DetailRow label="Min images" value={String(taskSnapshot.minimumImageCount)} />
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Capture metadata */}
              {(selectedSub.durationSeconds != null ||
                selectedSub.imageCount != null ||
                selectedSub.deviceModel ||
                selectedSub.devicePlatform) && (
                <section>
                  <SectionTitle>Capture Info</SectionTitle>
                  <div className="bg-background rounded-lg border border-border p-3 grid grid-cols-2 gap-1 text-muted-foreground">
                    {selectedSub.durationSeconds != null && (
                      <DetailRow label="Duration" value={`${selectedSub.durationSeconds}s`} />
                    )}
                    {selectedSub.imageCount != null && (
                      <DetailRow label="Images" value={String(selectedSub.imageCount)} />
                    )}
                    {selectedSub.totalFileSize != null && (
                      <DetailRow label="Total size" value={`${(Number(selectedSub.totalFileSize) / (1024 * 1024)).toFixed(1)} MB`} />
                    )}
                    {selectedSub.devicePlatform && (
                      <DetailRow label="Platform" value={selectedSub.devicePlatform} />
                    )}
                    {selectedSub.deviceModel && (
                      <DetailRow label="Device" value={selectedSub.deviceModel} />
                    )}
                    {(selectedSub.captureMetadata as Record<string, string> | undefined)?.cameraUsed && (
                      <DetailRow label="Camera" value={(selectedSub.captureMetadata as Record<string, string>).cameraUsed} />
                    )}
                    {(selectedSub.captureMetadata as Record<string, string> | undefined)?.orientation && (
                      <DetailRow label="Orientation" value={(selectedSub.captureMetadata as Record<string, string>).orientation} />
                    )}
                  </div>
                </section>
              )}

              {/* Media files */}
              {selectedSub.media && selectedSub.media.length > 0 && (
                <section>
                  <SectionTitle>Media ({selectedSub.media.length})</SectionTitle>
                  <div className="space-y-2">
                    {selectedSub.media.map((m: SubmissionMedia & { readUrl?: string }, i: number) => (
                      <div
                        key={m.id}
                        className="bg-background border border-border rounded-lg p-3 space-y-2"
                      >
                        {/* Metadata row */}
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                            {m.mediaType === "VIDEO" ? (
                              <Video className="h-4 w-4" />
                            ) : m.mediaType === "AUDIO" ? (
                              <Mic className="h-4 w-4" />
                            ) : (
                              <Image className="h-4 w-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground">File {i + 1}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {m.mimeType}
                              {m.fileSize != null && ` · ${(Number(m.fileSize) / (1024 * 1024)).toFixed(1)} MB`}
                              {m.durationSeconds != null && ` · ${m.durationSeconds}s`}
                            </p>
                            <Badge className={
                              m.uploadStatus === "UPLOADED"
                                ? "bg-emerald-500/15 text-emerald-500 border-none text-xs mt-1"
                                : m.uploadStatus === "FAILED"
                                  ? "bg-red-500/15 text-red-500 border-none text-xs mt-1"
                                  : "bg-slate-500/15 text-slate-400 border-none text-xs mt-1"
                            }>
                              {m.uploadStatus}
                            </Badge>
                          </div>
                          {/* Image: clickable thumbnail → lightbox gallery */}
                          {m.uploadStatus === "UPLOADED" && m.readUrl && m.mediaType === "IMAGE" && (() => {
                            const imageUrls = (selectedSub.media ?? [])
                              .filter((x) => x.uploadStatus === "UPLOADED" && x.readUrl && x.mediaType === "IMAGE")
                              .map((x) => x.readUrl as string);
                            const idx = imageUrls.indexOf(m.readUrl);
                            return (
                              <button
                                type="button"
                                className="flex-shrink-0 focus:outline-none"
                                onClick={(e) => { e.stopPropagation(); setLightboxUrls(imageUrls); setLightboxIndex(idx >= 0 ? idx : 0); }}
                              >
                                <img
                                  src={m.readUrl}
                                  alt={`Media ${i + 1}`}
                                  className="w-16 h-16 object-cover rounded border border-border hover:opacity-80 transition-opacity cursor-zoom-in"
                                />
                              </button>
                            );
                          })()}
                        </div>
                        {/* Embedded video player */}
                        {m.uploadStatus === "UPLOADED" && m.readUrl && m.mediaType === "VIDEO" && (
                          <video
                            src={m.readUrl}
                            controls
                            className="w-full rounded max-h-64 bg-black"
                            preload="metadata"
                          />
                        )}
                        {/* Embedded audio player */}
                        {m.uploadStatus === "UPLOADED" && m.readUrl && m.mediaType === "AUDIO" && (
                          <audio
                            src={m.readUrl}
                            controls
                            className="w-full"
                            preload="metadata"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Image lightbox */}
      <Dialog open={lightboxUrls.length > 0} onOpenChange={(open) => { if (!open) setLightboxUrls([]); }}>
        <DialogContent className="max-w-4xl w-full p-0 bg-black border-border overflow-hidden">
          {lightboxUrls.length > 0 && (
            <div className="relative flex items-center justify-center min-h-[60vh] max-h-[85vh]">
              <img
                src={lightboxUrls[lightboxIndex]}
                alt={`Image ${lightboxIndex + 1} of ${lightboxUrls.length}`}
                className="max-w-full max-h-[85vh] object-contain"
              />
              {lightboxUrls.length > 1 && (
                <>
                  <button
                    type="button"
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
                    onClick={() => setLightboxIndex((prev) => (prev - 1 + lightboxUrls.length) % lightboxUrls.length)}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
                    onClick={() => setLightboxIndex((prev) => (prev + 1) % lightboxUrls.length)}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                    {lightboxIndex + 1} / {lightboxUrls.length}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for review actions */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve" && "Approve Submission?"}
              {confirmAction === "reject" && "Reject Submission?"}
              {confirmAction === "resubmit" && "Request Resubmission?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve" && "This will approve the submission and credit the user's wallet. This action cannot be undone."}
              {confirmAction === "reject" && "This will permanently reject the submission. The user will be notified. This action cannot be undone."}
              {confirmAction === "resubmit" && "This will notify the user to resubmit their work with the provided feedback."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void executeConfirmedAction()}
              disabled={isSubmitting}
              className={
                confirmAction === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : confirmAction === "reject"
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
              }
            >
              {isSubmitting ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Processing…</>
              ) : confirmAction === "approve" ? (
                "Approve & Credit"
              ) : confirmAction === "reject" ? (
                "Reject Submission"
              ) : (
                "Send Request"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </h3>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-span-1">
      <span className="text-xs text-muted-foreground">{label}: </span>
      <span className="text-xs text-foreground font-medium">{value}</span>
    </div>
  );
}
