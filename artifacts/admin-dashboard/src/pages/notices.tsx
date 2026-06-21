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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Bell, Languages } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@/hooks/useTranslate";

interface Notice {
  id: string;
  title: string;
  content: string;
  titleEn?: string | null;
  titleHi?: string | null;
  contentEn?: string | null;
  contentHi?: string | null;
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
  const { translateBatch, translating } = useTranslate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({
    titleEn: "", titleHi: "", contentEn: "", contentHi: "",
    isActive: true, startsAt: "", endsAt: "",
  });

  const { data, isLoading } = useAdminListNotices();
  const notices: Notice[] = (data as { data?: Notice[] })?.data ?? [];

  const createMutation = useAdminCreateNotice();
  const updateMutation = useAdminUpdateNotice();
  const deleteMutation = useAdminDeleteNotice();

  function openCreate() {
    setEditing(null);
    setForm({ titleEn: "", titleHi: "", contentEn: "", contentHi: "", isActive: true, startsAt: "", endsAt: "" });
    setDialogOpen(true);
  }

  function openEdit(notice: Notice) {
    setEditing(notice);
    setForm({
      titleEn: notice.titleEn ?? notice.title,
      titleHi: notice.titleHi ?? "",
      contentEn: notice.contentEn ?? notice.content,
      contentHi: notice.contentHi ?? "",
      isActive: notice.isActive,
      startsAt: toDateInput(notice.startsAt),
      endsAt: toDateInput(notice.endsAt),
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.titleEn.trim() || !form.contentEn.trim()) {
      toast({ title: "Validation Error", description: "English title and content are required.", variant: "destructive" });
      return;
    }
    const payload = {
      title: form.titleEn,
      titleEn: form.titleEn,
      titleHi: form.titleHi || undefined,
      content: form.contentEn,
      contentEn: form.contentEn,
      contentHi: form.contentHi || undefined,
      isActive: form.isActive,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload }, {
        onSuccess: () => { toast({ title: "Updated" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }); },
        onError: () => toast({ title: "Error", description: "Failed to update notice.", variant: "destructive" }),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { toast({ title: "Created" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }); },
        onError: () => toast({ title: "Error", description: "Failed to create notice.", variant: "destructive" }),
      });
    }
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId }, {
      onSuccess: () => { toast({ title: "Deleted" }); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }); },
      onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
    });
  }

  function handleToggle(notice: Notice) {
    updateMutation.mutate({ id: notice.id, data: { isActive: !notice.isActive } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notices"] }) });
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
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New Notice</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
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
                    <span className="font-medium text-sm">{notice.titleEn ?? notice.title}</span>
                    {isLive && <Badge className="text-xs bg-emerald-500 text-white border-0">Live</Badge>}
                    <Badge variant={notice.isActive ? "default" : "secondary"} className="text-xs">{notice.isActive ? "Active" : "Inactive"}</Badge>
                    {notice.titleHi && <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">हिंदी ✓</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{notice.contentEn ?? notice.content}</p>
                  {notice.contentHi && <p className="text-xs text-amber-400/70 mt-0.5 line-clamp-1" dir="auto">{notice.contentHi}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {starts && `Starts: ${starts.toLocaleDateString()}`}
                    {starts && ends && " · "}
                    {ends && `Ends: ${ends.toLocaleDateString()}`}
                    {!starts && !ends && "No schedule (always active when enabled)"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={notice.isActive} onCheckedChange={() => handleToggle(notice)} />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(notice)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(notice.id)}><Trash2 className="h-4 w-4" /></Button>
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
            <Tabs defaultValue="en">
              <TabsList>
                <TabsTrigger value="en">🇬🇧 English</TabsTrigger>
                <TabsTrigger value="hi">🇮🇳 हिंदी</TabsTrigger>
              </TabsList>
              <TabsContent value="en" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label>Title (English) <span className="text-destructive">*</span></Label>
                  <Input value={form.titleEn} onChange={(e) => setForm(f => ({ ...f, titleEn: e.target.value }))} placeholder="Important Update" />
                </div>
                <div className="space-y-2">
                  <Label>Content (English) <span className="text-destructive">*</span></Label>
                  <Textarea rows={3} value={form.contentEn} onChange={(e) => setForm(f => ({ ...f, contentEn: e.target.value }))} placeholder="We have updated our…" />
                </div>
              </TabsContent>
              <TabsContent value="hi" className="space-y-3 mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={translating || !form.titleEn.trim()}
                  onClick={async () => {
                    const [titleHi, contentHi] = await translateBatch([form.titleEn, form.contentEn]);
                    setForm(f => ({ ...f, titleHi, contentHi }));
                  }}
                  className="gap-1.5"
                >
                  {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                  Translate from English
                </Button>
                <div className="space-y-2">
                  <Label>शीर्षक (हिंदी)</Label>
                  <Input dir="auto" value={form.titleHi} onChange={(e) => setForm(f => ({ ...f, titleHi: e.target.value }))} placeholder="महत्वपूर्ण अपडेट" />
                </div>
                <div className="space-y-2">
                  <Label>सामग्री (हिंदी)</Label>
                  <Textarea dir="auto" rows={3} value={form.contentHi} onChange={(e) => setForm(f => ({ ...f, contentHi: e.target.value }))} placeholder="हमने हमारी…" />
                </div>
              </TabsContent>
            </Tabs>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starts At <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm(f => ({ ...f, startsAt: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Ends At <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm(f => ({ ...f, endsAt: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />
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
