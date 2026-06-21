import { useState } from "react";
import {
  useListWalletTransactions,
  ListWalletTransactionsSourceType,
  type WalletTransaction,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight, Filter, Search, X,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, format } from "date-fns";

type TxType = "CREDIT" | "DEBIT" | "ADJUSTMENT";

const TYPE_CONFIG: Record<TxType, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  CREDIT: {
    label: "Credit",
    badgeClass: "text-emerald-500 border-emerald-500/30",
    icon: <ArrowDownRight className="h-4 w-4 text-emerald-500" />,
  },
  DEBIT: {
    label: "Debit",
    badgeClass: "text-destructive border-destructive/30",
    icon: <ArrowUpRight className="h-4 w-4 text-destructive" />,
  },
  ADJUSTMENT: {
    label: "Adjustment",
    badgeClass: "text-amber-400 border-amber-400/30",
    icon: <ArrowDownRight className="h-4 w-4 text-amber-400" />,
  },
};

const SOURCE_LABEL: Record<string, string> = {
  SUBMISSION_APPROVAL: "Submission approved",
  MANUAL: "Manual adjustment",
  REFUND: "Refund",
  WITHDRAWAL: "Withdrawal",
};

export default function WalletTransactions() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<TxType | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<ListWalletTransactionsSourceType | "all">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const limit = 20;

  const { data, isLoading } = useListWalletTransactions({
    page,
    limit,
    type: typeFilter !== "all" ? typeFilter : undefined,
    sourceType: sourceFilter !== "all" ? sourceFilter : undefined,
    search: search || undefined,
  });

  function handleSearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wallet Transactions</h1>
        <p className="text-sm text-muted-foreground">Ledger of all credits and debits across the platform.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 pr-9 bg-card"
            placeholder="Search by user phone or ID…"
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

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as TxType | "all"); setPage(1); }}>
          <SelectTrigger className="w-[160px] bg-card">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="CREDIT">Credits Only</SelectItem>
            <SelectItem value="DEBIT">Debits Only</SelectItem>
            <SelectItem value="ADJUSTMENT">Adjustments</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as ListWalletTransactionsSourceType | "all"); setPage(1); }}>
          <SelectTrigger className="w-[190px] bg-card">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="SUBMISSION">Submission</SelectItem>
            <SelectItem value="ADMIN_ADJUSTMENT">Admin Adjustment</SelectItem>
          </SelectContent>
        </Select>

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
              <TableHead className="w-[44px]" />
              <TableHead>Type</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((tx: WalletTransaction) => {
                const cfg = TYPE_CONFIG[tx.type as TxType] ?? TYPE_CONFIG["CREDIT"];
                const sourceLabel = SOURCE_LABEL[tx.sourceType ?? ""] ?? tx.sourceType ?? "—";
                return (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className={`p-2 rounded-full flex items-center justify-center w-8 h-8 ${
                        tx.type === "CREDIT" ? "bg-emerald-500/10"
                          : tx.type === "DEBIT" ? "bg-destructive/10"
                          : "bg-amber-500/10"
                      }`}>
                        {cfg.icon}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cfg.badgeClass}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{tx.user?.phoneNumber ?? "—"}</div>
                      {tx.user?.name && <div className="text-xs text-muted-foreground">{tx.user.name}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>{sourceLabel}</div>
                      {tx.note && (
                        <div className="text-xs truncate max-w-[200px] mt-0.5">{tx.note}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm" title={format(new Date(tx.createdAt), "dd MMM yyyy HH:mm")}>
                        {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-mono font-medium ${
                      tx.type === "CREDIT" ? "text-emerald-500"
                        : tx.type === "DEBIT" ? "text-foreground"
                        : "text-amber-400"
                    }`}>
                      {tx.type === "CREDIT" ? "+" : tx.type === "DEBIT" ? "−" : "±"}
                      ₹{tx.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium">{data.data.length}</span> of{" "}
            <span className="font-medium">{data.meta.total}</span> transactions
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
    </div>
  );
}
