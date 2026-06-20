import { useState } from "react";
import { useListWalletTransactions, ListWalletTransactionsType } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";

export default function WalletTransactions() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<ListWalletTransactionsType | "all">("all");
  const limit = 20;

  const { data, isLoading } = useListWalletTransactions({ 
    page, 
    limit,
    type: typeFilter !== "all" ? typeFilter : undefined
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallet Transactions</h1>
          <p className="text-sm text-muted-foreground">Ledger of all credits and debits across the platform.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={typeFilter} onValueChange={(v: any) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[160px] bg-card">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="credit">Credits Only</SelectItem>
              <SelectItem value="debit">Debits Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Type</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Description</TableHead>
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
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
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
              data?.data?.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    {tx.type === 'credit' ? (
                      <div className="bg-emerald-500/10 p-2 rounded-full flex items-center justify-center">
                        <ArrowDownRight className="h-4 w-4 text-emerald-500" />
                      </div>
                    ) : (
                      <div className="bg-destructive/10 p-2 rounded-full flex items-center justify-center">
                        <ArrowUpRight className="h-4 w-4 text-destructive" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {tx.type === 'credit' 
                      ? <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">Credit</Badge>
                      : <Badge variant="outline" className="text-destructive border-destructive/30">Debit</Badge>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{tx.user?.phoneNumber || "Unknown"}</div>
                    {tx.user?.name && <div className="text-xs text-muted-foreground">{tx.user.name}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {tx.description || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm" title={new Date(tx.createdAt).toLocaleString()}>
                      {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell className={`text-right font-mono font-medium ${tx.type === 'credit' ? 'text-emerald-500' : 'text-foreground'}`}>
                    {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
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
            Showing <span className="font-medium">{data.data.length}</span> of <span className="font-medium">{data.meta.total}</span> transactions
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
    </div>
  );
}
