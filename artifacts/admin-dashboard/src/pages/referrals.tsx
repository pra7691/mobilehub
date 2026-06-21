import { useState } from "react";
import {
  useAdminListReferrals,
  useAdminGetReferralStats,
  useAdminCancelReferral,
  AdminListReferralsStatus,
} from "@workspace/api-client-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Search, X, Gift, Users, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type ReferralStatus = "REGISTERED" | "REWARDED" | "CANCELLED";

interface AdminReferralUser {
  id: string;
  phoneNumber: string;
  name?: string | null;
  phoneNumberMasked: string;
}

interface AdminReferral {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  status: ReferralStatus;
  registeredAt: string;
  qualifiedAt?: string | null;
  rewardedAt?: string | null;
  rewardAmount?: number | null;
  note?: string | null;
  rewardWalletTransactionId?: string | null;
  firstQualifiedSubmissionId?: string | null;
  createdAt: string;
  updatedAt: string;
  referrer?: AdminReferralUser | null;
  referred?: AdminReferralUser | null;
}

interface ReferralStats {
  total: number;
  registered: number;
  rewarded: number;
  cancelled: number;
  totalRewardsPaid: number;
}

function statusBadge(status: ReferralStatus) {
  switch (status) {
    case "REWARDED":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-500 border-none">
          Rewarded
        </Badge>
      );
    case "CANCELLED":
      return (
        <Badge variant="destructive" className="bg-destructive/15 text-destructive border-none">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground border-none">
          Registered
        </Badge>
      );
  }
}

function fmt(dt?: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatsCard({ label, value, icon: Icon, className }: {
  label: string; value: string | number; icon: React.ElementType; className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[55%] break-all">{value ?? "—"}</span>
    </div>
  );
}

export default function ReferralsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [referralCode, setReferralCode] = useState("");
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [referrerPhone, setReferrerPhone] = useState("");
  const [referrerPhoneInput, setReferrerPhoneInput] = useState("");
  const [selectedReferral, setSelectedReferral] = useState<AdminReferral | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminReferral | null>(null);

  const limit = 15;

  const { data: stats } = useAdminGetReferralStats() as { data: ReferralStats | undefined };
  const { data, isLoading } = useAdminListReferrals({
    page,
    limit,
    status: status ? (status as AdminListReferralsStatus) : undefined,
    referralCode: referralCode || undefined,
    referrerPhone: referrerPhone || undefined,
  }) as { data: { data: AdminReferral[]; meta: { total: number; totalPages: number } } | undefined; isLoading: boolean };

  const cancelMutation = useAdminCancelReferral();

  const totalPages = data?.meta?.totalPages ?? 1;

  function applyFilters() {
    setReferralCode(referralCodeInput);
    setReferrerPhone(referrerPhoneInput);
    setPage(1);
  }

  function clearFilters() {
    setStatus("");
    setReferralCode("");
    setReferralCodeInput("");
    setReferrerPhone("");
    setReferrerPhoneInput("");
    setPage(1);
  }

  const hasFilters = status || referralCode || referrerPhone;

  function handleCancel() {
    if (!cancelTarget) return;
    cancelMutation.mutate(
      { id: cancelTarget.id },
      {
        onSuccess: () => {
          toast({ title: "Referral cancelled" });
          setCancelTarget(null);
          setSelectedReferral(null);
          void queryClient.invalidateQueries({ queryKey: ["adminListReferrals"] });
          void queryClient.invalidateQueries({ queryKey: ["adminGetReferralStats"] });
        },
        onError: (e: unknown) => {
          const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to cancel";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground">Track referral activity and reward payouts.</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatsCard label="Total Referrals" value={stats.total} icon={Users} />
          <StatsCard label="Registered" value={stats.registered} icon={Gift} />
          <StatsCard label="Rewarded" value={stats.rewarded} icon={CheckCircle} />
          <StatsCard label="Total Paid Out" value={`₹${Number(stats.totalRewardsPaid).toFixed(2)}`} icon={Gift} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={status} onValueChange={(v) => { setStatus(v === "ALL" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="REGISTERED">Registered</SelectItem>
            <SelectItem value="REWARDED">Rewarded</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Referral code"
          className="w-36"
          value={referralCodeInput}
          onChange={(e) => setReferralCodeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        />
        <Input
          placeholder="Referrer phone"
          className="w-40"
          value={referrerPhoneInput}
          onChange={(e) => setReferrerPhoneInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        />
        <Button size="sm" variant="secondary" onClick={applyFilters} className="gap-1">
          <Search className="h-3.5 w-3.5" /> Search
        </Button>
        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={clearFilters} className="gap-1 text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Code</TableHead>
              <TableHead>Referrer</TableHead>
              <TableHead>Referred</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Reward</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : data?.data.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      No referrals found
                    </TableCell>
                  </TableRow>
                )
                : data?.data.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setSelectedReferral(r)}
                  >
                    <TableCell className="font-mono text-primary font-semibold">{r.referralCode}</TableCell>
                    <TableCell>{r.referrer?.phoneNumberMasked ?? "—"}</TableCell>
                    <TableCell>{r.referred?.phoneNumberMasked ?? "—"}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmt(r.registeredAt)}</TableCell>
                    <TableCell>
                      {r.rewardAmount != null
                        ? <span className="text-emerald-500 font-medium">₹{r.rewardAmount}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {data?.meta?.total ?? 0} total
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!selectedReferral} onOpenChange={(o) => !o && setSelectedReferral(null)}>
        <SheetContent className="w-[380px] sm:w-[460px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="font-mono text-primary">{selectedReferral?.referralCode}</span>
              {selectedReferral && statusBadge(selectedReferral.status)}
            </SheetTitle>
          </SheetHeader>

          {selectedReferral && (
            <div className="mt-4 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Referrer</p>
                <DetailRow label="Phone" value={selectedReferral.referrer?.phoneNumber} />
                <DetailRow label="Name" value={selectedReferral.referrer?.name} />
                <DetailRow label="User ID" value={selectedReferral.referrer?.id} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Referred User</p>
                <DetailRow label="Phone" value={selectedReferral.referred?.phoneNumber} />
                <DetailRow label="Name" value={selectedReferral.referred?.name} />
                <DetailRow label="User ID" value={selectedReferral.referred?.id} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Timeline</p>
                <DetailRow label="Registered" value={fmt(selectedReferral.registeredAt)} />
                <DetailRow label="Qualified" value={fmt(selectedReferral.qualifiedAt)} />
                <DetailRow label="Rewarded" value={fmt(selectedReferral.rewardedAt)} />
              </div>
              {selectedReferral.rewardAmount != null && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Reward</p>
                  <DetailRow label="Amount" value={<span className="text-emerald-500">₹{selectedReferral.rewardAmount}</span>} />
                  <DetailRow label="Wallet TX" value={selectedReferral.rewardWalletTransactionId} />
                  <DetailRow label="Submission" value={selectedReferral.firstQualifiedSubmissionId} />
                </div>
              )}
              {selectedReferral.note && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Note</p>
                  <p className="text-sm text-muted-foreground">{selectedReferral.note}</p>
                </div>
              )}

              {selectedReferral.status === "REGISTERED" && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-1 mt-2"
                  onClick={() => setCancelTarget(selectedReferral)}
                >
                  <XCircle className="h-4 w-4" />
                  Cancel Referral
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Cancel confirm dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this referral?</AlertDialogTitle>
            <AlertDialogDescription>
              Code <strong>{cancelTarget?.referralCode}</strong> will be marked cancelled and no reward will be
              paid. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
