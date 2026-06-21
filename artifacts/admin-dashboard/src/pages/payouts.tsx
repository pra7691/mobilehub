import { useState } from "react";
import {
  useGetAdminPayouts,
  useGetAdminPayoutsId,
  usePostAdminPayoutsIdStartProcessing,
  usePostAdminPayoutsIdMarkPaid,
  usePostAdminPayoutsIdReject,
  getGetAdminPayoutsQueryKey,
  getGetAdminPayoutsIdQueryKey,
} from "@workspace/api-client-react";
import type { AdminPayoutItem, AdminPayoutDetail } from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Search, Loader2, CheckCircle2, XCircle, PlayCircle, X, Eye,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type PayoutStatus = "PENDING" | "PROCESSING" | "PAID" | "REJECTED" | "CANCELLED";

const STATUS_BADGE: Record<PayoutStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-amber-500/15 text-amber-400 border-none" },
  PROCESSING: { label: "Processing", className: "bg-blue-500/15 text-blue-400 border-none" },
  PAID: { label: "Paid", className: "bg-emerald-500/15 text-emerald-500 border-none" },
  REJECTED: { label: "Rejected", className: "bg-red-500/15 text-red-500 border-none" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-500/15 text-slate-400 border-none" },
};

function statusBadge(status: string) {
  const cfg = STATUS_BADGE[status as PayoutStatus] ?? STATUS_BADGE.PENDING;
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

// ─── Mark Paid Dialog ─────────────────────────────────────────────────────────
function MarkPaidDialog({
  payout, open, onClose,
}: { payout: AdminPayoutDetail | undefined; open: boolean; onClose: () => void }) {
  const [refId, setRefId] = useState("");
  const [note, setNote] = useState("");
  const markPaidMutation = usePostAdminPayoutsIdMarkPaid();
  const { toast } = useToast();
  const qc = useQueryClient();

  async function handleConfirm() {
    if (!payout || !refId.trim()) return;
    try {
      await markPaidMutation.mutateAsync({ id: payout.id, data: { payoutReferenceId: refId.trim(), adminNote: note.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: getGetAdminPayoutsQueryKey({}) });
      toast({ title: "Payout marked as paid" });
      setRefId(""); setNote("");
      onClose();
    } catch (e: unknown) {
      toast({ title: "Failed to mark as paid", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as Paid</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>UPI / Bank Reference ID *</Label>
            <Input
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="UTR or transaction ID"
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Admin note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any note for records"
              className="bg-background resize-none"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={markPaidMutation.isPending || !refId.trim()} className="gap-2">
            {markPaidMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject Dialog ────────────────────────────────────────────────────────────
function RejectDialog({
  payout, open, onClose,
}: { payout: AdminPayoutDetail | undefined; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const rejectMutation = usePostAdminPayoutsIdReject();
  const { toast } = useToast();
  const qc = useQueryClient();

  async function handleConfirm() {
    if (!payout || !reason.trim()) return;
    try {
      await rejectMutation.mutateAsync({ id: payout.id, data: { rejectionReason: reason.trim(), adminNote: note.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: getGetAdminPayoutsQueryKey({}) });
      toast({ title: "Payout rejected" });
      setReason(""); setNote("");
      onClose();
    } catch (e: unknown) {
      toast({ title: "Failed to reject payout", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject Payout</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Rejection reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this payout is being rejected"
              className="bg-background resize-none"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Admin note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" className="bg-background" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={rejectMutation.isPending || !reason.trim()} className="gap-2">
            {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject Payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({
  payoutId, open, onClose,
}: { payoutId: string | null; open: boolean; onClose: () => void }) {
  const { data: payout, isLoading, refetch } = useGetAdminPayoutsId(
    payoutId ?? "",
    {},
    { query: { enabled: !!payoutId, queryKey: getGetAdminPayoutsIdQueryKey(payoutId ?? "", {}) } },
  );
  const startProcessingMutation = usePostAdminPayoutsIdStartProcessing();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [revealUpi, setRevealUpi] = useState(false);

  const detail = payout as AdminPayoutDetail | undefined;

  async function handleStartProcessing() {
    if (!payoutId) return;
    try {
      await startProcessingMutation.mutateAsync({ id: payoutId });
      await qc.invalidateQueries({ queryKey: getGetAdminPayoutsQueryKey({}) });
      await refetch();
      toast({ title: "Moved to Processing" });
    } catch (e: unknown) {
      toast({ title: "Failed", description: (e as { message?: string })?.message, variant: "destructive" });
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent className="bg-card border-border w-full max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Payout Request</SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Status + amount */}
              <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Amount</p>
                  <p className="text-2xl font-bold">₹{Number(detail.amount).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{detail.currency}</p>
                </div>
                <div className="text-right">
                  {statusBadge(detail.status)}
                </div>
              </div>

              {/* User info */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">User</p>
                <div className="bg-background rounded-lg border border-border p-3 space-y-1">
                  <p className="text-sm font-medium">{detail.user?.phoneNumber}</p>
                  {detail.user?.name && <p className="text-xs text-muted-foreground">{detail.user.name}</p>}
                  <p className="text-xs text-muted-foreground font-mono">{detail.userId}</p>
                </div>
              </div>

              {/* UPI info */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">UPI ID</p>
                <div className="bg-background rounded-lg border border-border p-3 flex items-center gap-2">
                  <p className="text-sm font-mono flex-1">
                    {revealUpi && (detail as AdminPayoutDetail & { upiId?: string }).upiId
                      ? (detail as AdminPayoutDetail & { upiId?: string }).upiId
                      : detail.upiIdMasked}
                  </p>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setRevealUpi((v) => !v)}>
                    <Eye className="h-3 w-3" />{revealUpi ? "Hide" : "Reveal"}
                  </Button>
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-background rounded-lg border border-border p-3">
                  <p className="text-muted-foreground mb-1">Requested</p>
                  <p>{format(new Date(detail.requestedAt), "dd MMM yyyy, HH:mm")}</p>
                </div>
                {detail.paidAt && (
                  <div className="bg-background rounded-lg border border-border p-3">
                    <p className="text-muted-foreground mb-1">Paid</p>
                    <p>{format(new Date(detail.paidAt), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                )}
                {detail.processingStartedAt && (
                  <div className="bg-background rounded-lg border border-border p-3">
                    <p className="text-muted-foreground mb-1">Processing started</p>
                    <p>{format(new Date(detail.processingStartedAt), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                )}
                {detail.rejectedAt && (
                  <div className="bg-background rounded-lg border border-border p-3">
                    <p className="text-muted-foreground mb-1">Rejected</p>
                    <p>{format(new Date(detail.rejectedAt), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                )}
              </div>

              {/* Reference / notes */}
              {detail.payoutReferenceId && (
                <div className="bg-background rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Payment Reference</p>
                  <p className="text-sm font-mono">{detail.payoutReferenceId}</p>
                </div>
              )}
              {detail.rejectionReason && (
                <div className="bg-red-950/40 rounded-lg border border-red-900/50 p-3">
                  <p className="text-xs text-red-400 mb-1">Rejection reason</p>
                  <p className="text-sm text-red-300">{detail.rejectionReason}</p>
                </div>
              )}
              {detail.adminNote && (
                <div className="bg-background rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Admin note</p>
                  <p className="text-sm">{detail.adminNote}</p>
                </div>
              )}

              {/* ID */}
              <p className="text-xs text-muted-foreground font-mono break-all">ID: {detail.id}</p>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {detail.status === "PENDING" && (
                  <Button className="gap-2 flex-1" onClick={handleStartProcessing} disabled={startProcessingMutation.isPending}>
                    {startProcessingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Start Processing
                  </Button>
                )}
                {detail.status === "PROCESSING" && (
                  <Button className="gap-2 flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setMarkPaidOpen(true)}>
                    <CheckCircle2 className="h-4 w-4" /> Mark as Paid
                  </Button>
                )}
                {["PENDING", "PROCESSING"].includes(detail.status) && (
                  <Button variant="outline" className="gap-2 border-red-900/50 text-red-400 hover:bg-red-950/40 flex-1" onClick={() => setRejectOpen(true)}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <MarkPaidDialog payout={detail} open={markPaidOpen} onClose={() => { setMarkPaidOpen(false); refetch(); }} />
      <RejectDialog payout={detail} open={rejectOpen} onClose={() => { setRejectOpen(false); refetch(); }} />
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PayoutsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const limit = 15;

  const { data, isLoading } = useGetAdminPayouts({
    page,
    limit,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
  });

  const payouts = (data?.data ?? []) as AdminPayoutItem[];
  const meta = data?.meta;

  function openDetail(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
  }

  function handleSearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
        <p className="text-sm text-muted-foreground">Review and process withdrawal requests from field agents.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search phone / UPI / ID..."
            className="pl-9 bg-background"
          />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as PayoutStatus | "all"); setPage(1); }}>
          <SelectTrigger className="w-40 bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-card hover:bg-card">
              <TableHead>User</TableHead>
              <TableHead>UPI ID</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i} className="border-border">
                  {[...Array(5)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : payouts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No payout requests found
                </TableCell>
              </TableRow>
            ) : (
              payouts.map((p) => (
                <TableRow
                  key={p.id}
                  className="border-border cursor-pointer hover:bg-muted/30"
                  onClick={() => openDetail(p.id)}
                >
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{p.user?.phoneNumber}</p>
                      {p.user?.name && <p className="text-xs text-muted-foreground">{p.user.name}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">{p.upiIdMasked}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">₹{Number(p.amount).toFixed(2)}</span>
                  </TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(p.requestedAt), { addSuffix: true })}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{meta.total} total · page {page} of {meta.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <DetailPanel payoutId={selectedId} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}
