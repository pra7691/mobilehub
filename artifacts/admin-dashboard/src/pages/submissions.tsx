import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  ChevronLeft, ChevronRight, Search, Filter, Image, Video, Mic, X, ExternalLink, Info,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, format } from "date-fns";

type SubmissionStatusValue =
  | "DRAFT" | "UPLOADING" | "UNDER_REVIEW" | "APPROVED"
  | "REJECTED" | "RESUBMISSION_REQUIRED" | "UPLOAD_FAILED";

type CollectionTypeValue = "VIDEO" | "IMAGE" | "AUDIO";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionMode, setActionMode] = useState<"approve" | "reject" | "resubmit" | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [adminNoteInput, setAdminNoteInput] = useState("");
  const limit = 15;

  const queryClient = useQueryClient();
  const { mutate: approve, isPending: approving } = useAdminApproveSubmission();
  const { mutate: reject, isPending: rejecting } = useAdminRejectSubmission();
  const { mutate: requestResubmission, isPending: requestingResubmission } = useAdminRequestResubmission();
  const isActionPending = approving || rejecting || requestingResubmission;

  function resetAction() {
    setActionMode(null);
    setAmountInput("");
    setReasonInput("");
    setAdminNoteInput("");
  }

  function handleActionSuccess() {
    void queryClient.invalidateQueries({ queryKey: getAdminListSubmissionsQueryKey() });
    if (selectedId) {
      void queryClient.invalidateQueries({ queryKey: getAdminGetSubmissionQueryKey(selectedId) });
    }
    resetAction();
  }

  function submitApprove() {
    if (!selectedId) return;
    approve(
      {
        id: selectedId,
        data: {
          approvedAmount: amountInput ? parseFloat(amountInput) : undefined,
          adminNote: adminNoteInput || undefined,
        },
      },
      { onSuccess: handleActionSuccess },
    );
  }

  function submitReject() {
    if (!selectedId || !reasonInput.trim()) return;
    reject(
      {
        id: selectedId,
        data: { rejectionReason: reasonInput.trim(), adminNote: adminNoteInput || undefined },
      },
      { onSuccess: handleActionSuccess },
    );
  }

  function submitResubmission() {
    if (!selectedId || !reasonInput.trim()) return;
    requestResubmission(
      { id: selectedId, data: { resubmissionReason: reasonInput.trim() } },
      { onSuccess: handleActionSuccess },
    );
  }

  const { data, isLoading } = useAdminListSubmissions({
    page, limit,
    status: statusFilter !== "all" ? statusFilter : undefined,
    collectionType: collectionFilter !== "all" ? collectionFilter : undefined,
    search: search || undefined,
  });

  const { data: selectedSub, isLoading: detailLoading } = useAdminGetSubmission(
    selectedId ?? "",
    { query: { enabled: !!selectedId, queryKey: getAdminGetSubmissionQueryKey(selectedId ?? "") } }
  );

  function openDetail(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
    resetAction();
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

  const taskSnapshot = selectedSub?.taskSnapshot as TaskSnapshot | undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <p className="text-sm text-muted-foreground">View incoming field data submissions.</p>
      </div>

      {/* Filters */}
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
            <SelectItem value="IMAGE">📷 Image</SelectItem>
            <SelectItem value="VIDEO">🎥 Video</SelectItem>
            <SelectItem value="AUDIO">🎙️ Audio</SelectItem>
          </SelectContent>
        </Select>

        {search && (
          <Button variant="ghost" size="sm" onClick={clearSearch}>
            <X className="h-3.5 w-3.5 mr-1" />Clear search
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Task</TableHead>
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
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
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
                    {sub.currencySnapshot === "INR" ? "₹" : "$"}{sub.paymentAmountSnapshot.toFixed(2)}
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

      {/* Pagination */}
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

      {/* Detail panel */}
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
              {/* Status + IDs */}
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

              {/* Action buttons for UNDER_REVIEW submissions */}
              {selectedSub.status === "UNDER_REVIEW" && (
                <section>
                  <SectionTitle>Actions</SectionTitle>
                  {!actionMode ? (
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                        onClick={() => setActionMode("approve")}
                      >
                        ✓ Approve
                      </Button>
                      <Button
                        size="sm"
                        className="bg-orange-600 hover:bg-orange-700 text-white border-none"
                        onClick={() => setActionMode("resubmit")}
                      >
                        ↩ Request Resubmission
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setActionMode("reject")}
                      >
                        ✕ Reject
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-background border border-border rounded-lg p-3">
                      {actionMode === "approve" && (
                        <>
                          <p className="text-xs font-semibold text-foreground">Approve Submission</p>
                          <div>
                            <label className="text-xs text-muted-foreground">Override Amount (optional — defaults to ₹{selectedSub.paymentAmountSnapshot?.toFixed(2)})</label>
                            <Input
                              className="mt-1 bg-card"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={String(selectedSub.paymentAmountSnapshot?.toFixed(2) ?? "")}
                              value={amountInput}
                              onChange={(e) => setAmountInput(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Admin Note (internal, optional)</label>
                            <Input className="mt-1 bg-card" placeholder="Internal note…" value={adminNoteInput} onChange={(e) => setAdminNoteInput(e.target.value)} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-none" onClick={submitApprove} disabled={isActionPending}>
                              {approving ? "Approving…" : "Confirm Approve"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={resetAction} disabled={isActionPending}>Cancel</Button>
                          </div>
                        </>
                      )}
                      {actionMode === "reject" && (
                        <>
                          <p className="text-xs font-semibold text-foreground">Reject Submission</p>
                          <div>
                            <label className="text-xs text-muted-foreground">Rejection Reason *</label>
                            <Input className="mt-1 bg-card" placeholder="Reason for rejection…" value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Admin Note (internal, optional)</label>
                            <Input className="mt-1 bg-card" placeholder="Internal note…" value={adminNoteInput} onChange={(e) => setAdminNoteInput(e.target.value)} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="destructive" onClick={submitReject} disabled={isActionPending || !reasonInput.trim()}>
                              {rejecting ? "Rejecting…" : "Confirm Reject"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={resetAction} disabled={isActionPending}>Cancel</Button>
                          </div>
                        </>
                      )}
                      {actionMode === "resubmit" && (
                        <>
                          <p className="text-xs font-semibold text-foreground">Request Resubmission</p>
                          <div>
                            <label className="text-xs text-muted-foreground">Feedback for Agent *</label>
                            <Input className="mt-1 bg-card" placeholder="What needs to be corrected…" value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white border-none" onClick={submitResubmission} disabled={isActionPending || !reasonInput.trim()}>
                              {requestingResubmission ? "Sending…" : "Send Feedback"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={resetAction} disabled={isActionPending}>Cancel</Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Review result for concluded submissions */}
              {(selectedSub.status === "APPROVED" || selectedSub.status === "REJECTED" || selectedSub.status === "RESUBMISSION_REQUIRED") && (
                <section>
                  <SectionTitle>Review</SectionTitle>
                  <div className="bg-background rounded-lg border border-border p-3 space-y-1.5">
                    {selectedSub.approvedAmount != null && (
                      <DetailRow label="Approved amount" value={`${selectedSub.currencySnapshot === "INR" ? "₹" : "$"}${Number(selectedSub.approvedAmount).toFixed(2)}`} />
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
                        value={`${taskSnapshot.currency === "INR" ? "₹" : "$"}${taskSnapshot.paymentAmount?.toFixed(2) ?? "—"}`}
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
                        className="flex items-center gap-3 bg-background border border-border rounded-lg p-3"
                      >
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
                        {m.uploadStatus === "UPLOADED" && m.readUrl && (
                          <>
                            {m.mediaType === "IMAGE" && (
                              <a
                                href={m.readUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <img
                                  src={m.readUrl}
                                  alt={`Media ${i + 1}`}
                                  className="w-14 h-14 object-cover rounded border border-border"
                                />
                              </a>
                            )}
                            {(m.mediaType === "VIDEO" || m.mediaType === "AUDIO") && (
                              <a
                                href={m.readUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </>
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
