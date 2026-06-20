import React, { useState } from "react";
import {
  useAdminListNotices,
  useAdminCreateNotice,
  useAdminUpdateNotice,
  useAdminDeleteNotice,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface Notice {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
}

function toDateInput(iso?: string | null) {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export default function NoticesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({ title: "", content: "", isActive: true, startsAt: "", endsAt: "" });

  const { data, isLoading } = useAdminListNotices();
  const notices: Notice[] = (data as { data?: Notice[] })?.data ?? [];

  const createMutation = useAdminCreateNotice();
  const updateMutation = useAdminUpdateNotice();
  const deleteMutation = useAdminDeleteNotice();

  function openCreate() {
    setEditing(null);
    setForm({ title: "", content: "", isActive: true, startsAt: "", endsAt: "" });
    setDialogOpen(true);
  }

  function openEdit(notice: Notice) {
    setEditing(notice);
    setForm({
      title: notice.title,
      content: notice.content,
      isActive: notice.isActive,
      startsAt: toDateInput(notice.startsAt),
      endsAt: toDateInput(notice.endsAt),
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      toast({ title: "Validation Error", description: "Title and content are required.", variant: "destructive" });
      return;
    }
    const payload = {
      title: form.title,
      content: form.content,
      isActive: form.isActive,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
    };
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Updated" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }); },
          onError: () => toast({ title: "Error", description: "Failed to update notice.", variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => { toast({ title: "Created" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }); },
          onError: () => toast({ title: "Error", description: "Failed to create notice.", variant: "destructive" }),
        }
      );
    }
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => { toast({ title: "Deleted" }); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }); },
        onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
      }
    );
  }

  function handleToggle(notice: Notice) {
    updateMutation.mutate(
      { id: notice.id, data: { isActive: !notice.isActive } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }) }
    );
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">App Notices</h1>
            <p className="text-muted-foreground text-sm">Broadcast announcements shown as dismissible banners in the mobile app.</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New Notice
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : notices.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Bell className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
          <p className="text-muted-foreground">No notices yet. Create one to broadcast a message to all app users.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notices.map((notice) => {
            const now = new Date();
            const starts = notice.startsAt ? new Date(notice.startsAt) : null;
            const ends = notice.endsAt ? new Date(notice.endsAt) : null;
            const isLive = notice.isActive && (!starts || starts <= now) && (!ends || ends >= now);

            return (
              <div key={notice.id} className="flex items-start gap-4 bg-card border border-border rounded-lg px-4 py-3">
                <Bell className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{notice.title}</span>
                    {isLive && <Badge className="text-xs bg-emerald-500 text-white border-0">Live</Badge>}
                    <Badge variant={notice.isActive ? "default" : "secondary"} className="text-xs">
                      {notice.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{notice.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {starts && `Starts: ${starts.toLocaleDateString()}`}
                    {starts && ends && " · "}
                    {ends && `Ends: ${ends.toLocaleDateString()}`}
                    {!starts && !ends && "No schedule (always active when enabled)"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={notice.isActive} onCheckedChange={() => handleToggle(notice)} />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(notice)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(notice.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Notice" : "New Notice"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Important Update" />
            </div>
            <div className="space-y-2">
              <Label>Content <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="We have updated our…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starts At <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Ends At <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              <span className="text-sm">{form.isActive ? "Active" : "Inactive"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete notice?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the notice from the mobile app.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
