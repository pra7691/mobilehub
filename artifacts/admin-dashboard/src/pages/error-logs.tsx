import React, { useState } from "react";
import { format } from "date-fns";
import { Bug, CheckCircle, Circle, ChevronDown, ChevronRight, X } from "lucide-react";
import {
  useAdminListMobileErrorLogs,
  useAdminResolveMobileErrorLog,
  useAdminUnresolveMobileErrorLog,
  getAdminListMobileErrorLogsQueryKey,
} from "@workspace/api-client-react";
import type { MobileErrorLogItem, MobileErrorLogDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const ERROR_TYPE_LABELS: Record<string, string> = {
  SUBMISSION_UPLOAD_FAILED: "Upload Failed",
  SUBMISSION_INITIATE_FAILED: "Initiate Failed",
  API_ERROR: "API Error",
  RENDER_ERROR: "Render Error",
  NETWORK_ERROR: "Network Error",
  DRAFT_SAVE_FAILED: "Draft Save Failed",
  UNKNOWN: "Unknown",
};

const ERROR_TYPE_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
  SUBMISSION_UPLOAD_FAILED: "destructive",
  SUBMISSION_INITIATE_FAILED: "destructive",
  API_ERROR: "destructive",
  RENDER_ERROR: "destructive",
  NETWORK_ERROR: "secondary",
  DRAFT_SAVE_FAILED: "secondary",
  UNKNOWN: "outline",
};

const PLATFORM_LABELS: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

type ResolvedFilter = "all" | "unresolved" | "resolved";

export default function ErrorLogsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [resolvedFilter, setResolvedFilter] = useState<ResolvedFilter>("all");
  const [errorTypeFilter, setErrorTypeFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveDialogId, setResolveDialogId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<MobileErrorLogDetail | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const params = {
    page: String(page),
    limit: "20",
    ...(resolvedFilter !== "all" ? { resolved: resolvedFilter === "resolved" ? "true" : "false" } : {}),
    ...(errorTypeFilter !== "all" ? { errorType: errorTypeFilter } : {}),
    ...(platformFilter !== "all" ? { platform: platformFilter } : {}),
  };

  const { data, isLoading } = useAdminListMobileErrorLogs(params);

  const resolveMutation = useAdminResolveMobileErrorLog({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListMobileErrorLogsQueryKey() });
        setResolveDialogId(null);
        setResolutionNote("");
        toast({ title: "Marked as resolved" });
      },
    },
  });

  const unresolveMutation = useAdminUnresolveMobileErrorLog({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListMobileErrorLogsQueryKey() });
        toast({ title: "Marked as unresolved" });
      },
    },
  });

  const handleResolve = () => {
    if (!resolveDialogId) return;
    resolveMutation.mutate({ id: resolveDialogId, data: { resolutionNote: resolutionNote || undefined } });
  };

  const handleUnresolve = (id: string) => {
    unresolveMutation.mutate({ id });
  };

  const handleToggleExpand = (item: MobileErrorLogItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      setExpandedDetail(null);
    } else {
      setExpandedId(item.id);
      // Cast the item to detail shape for inline expansion (detail fields may be absent)
      setExpandedDetail(item as unknown as MobileErrorLogDetail);
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bug className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Error Logs</h1>
            <p className="text-muted-foreground text-sm">
              Mobile app errors reported by field agents
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-base px-3 py-1">
          {total} total
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={resolvedFilter} onValueChange={(v) => { setResolvedFilter(v as ResolvedFilter); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select value={errorTypeFilter} onValueChange={(v) => { setErrorTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Error type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(ERROR_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
            <SelectItem value="android">Android</SelectItem>
          </SelectContent>
        </Select>

        {(resolvedFilter !== "all" || errorTypeFilter !== "all" || platformFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setResolvedFilter("all"); setErrorTypeFilter("all"); setPlatformFilter("all"); setPage(1); }}
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-8"></th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Error</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Platform</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">When</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No error logs found
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isExpanded = expandedId === item.id;
                const isResolved = !!item.resolvedAt;
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className={`border-b border-border hover:bg-muted/30 cursor-pointer transition-colors ${isExpanded ? "bg-muted/20" : ""}`}
                      onClick={() => handleToggleExpand(item)}
                    >
                      <td className="px-4 py-3 text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={ERROR_TYPE_VARIANT[item.errorType] ?? "outline"}>
                            {ERROR_TYPE_LABELS[item.errorType] ?? item.errorType}
                          </Badge>
                          {item.httpStatus != null && (
                            <span className="text-xs text-muted-foreground">HTTP {item.httpStatus}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1 max-w-xs">
                          {item.message}
                        </p>
                        {item.endpoint && (
                          <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
                            {item.httpMethod} {item.endpoint}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs capitalize">
                          {PLATFORM_LABELS[item.platform] ?? item.platform}
                        </span>
                        {item.appVersion && (
                          <p className="text-xs text-muted-foreground">v{item.appVersion}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.user ? (
                          <div>
                            <p className="text-xs font-medium">{item.user.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{item.user.phoneNumber}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.createdAt), "MMM d, HH:mm")}
                      </td>
                      <td className="px-4 py-3">
                        {isResolved ? (
                          <div className="flex items-center gap-1 text-xs text-green-500">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Resolved
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Circle className="h-3.5 w-3.5" />
                            Open
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {isResolved ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => handleUnresolve(item.id)}
                            disabled={unresolveMutation.isPending}
                          >
                            Unresolve
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => { setResolveDialogId(item.id); setResolutionNote(""); }}
                          >
                            Resolve
                          </Button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && expandedDetail && (
                      <tr className="border-b border-border bg-muted/10">
                        <td colSpan={7} className="px-8 py-4">
                          <ErrorLogDetail item={expandedDetail} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pages} ({total} total)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Resolve Dialog */}
      <Dialog
        open={!!resolveDialogId}
        onOpenChange={(open) => { if (!open) { setResolveDialogId(null); setResolutionNote(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Error Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Add an optional note about how this was resolved.
            </p>
            <Textarea
              placeholder="Resolution note (optional)"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogId(null)}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? "Resolving…" : "Mark Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ErrorLogDetail({ item }: { item: MobileErrorLogDetail }) {
  const resolvedAt = item.resolvedAt ? format(new Date(item.resolvedAt), "MMM d, yyyy HH:mm") : null;

  const allFields: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: "Error ID", value: item.id },
    { label: "Network State", value: item.networkState },
    { label: "Device Model", value: item.deviceModel },
    { label: "OS Version", value: item.osVersion },
    { label: "Collection Type", value: item.collectionType },
    { label: "Request ID", value: item.requestId },
    { label: "Resolved At", value: resolvedAt },
    { label: "Resolution Note", value: item.resolutionNote },
  ];
  const fields = allFields.filter(
    (f): f is { label: string; value: string | number } =>
      f.value != null && f.value !== ""
  );

  const metadata = item.metadata as Record<string, unknown> | null | undefined;
  const hasMetadata = metadata && typeof metadata === "object" && Object.keys(metadata).length > 0;

  return (
    <div className="space-y-3 text-xs">
      {fields.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-muted-foreground font-medium mb-0.5">{f.label}</p>
              <p className="font-mono break-all">{String(f.value)}</p>
            </div>
          ))}
        </div>
      )}

      {hasMetadata && (
        <div>
          <p className="text-muted-foreground font-medium mb-1">Metadata</p>
          <pre className="bg-muted rounded p-3 overflow-x-auto text-xs font-mono">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      )}

      {item.stackTrace && (
        <div>
          <p className="text-muted-foreground font-medium mb-1">Stack Trace</p>
          <pre className="bg-muted rounded p-3 overflow-x-auto text-xs font-mono max-h-48 whitespace-pre-wrap break-all">
            {item.stackTrace}
          </pre>
        </div>
      )}
    </div>
  );
}
