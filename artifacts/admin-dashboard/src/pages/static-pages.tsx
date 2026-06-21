import React, { useState } from "react";
import {
  useAdminListPages,
  useAdminCreatePage,
  useAdminUpdatePage,
  useAdminDeletePage,
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
import { Loader2, Plus, Pencil, Trash2, FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface StaticPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  titleEn?: string | null;
  titleHi?: string | null;
  contentEn?: string | null;
  contentHi?: string | null;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}

const SLUG_SUGGESTIONS = ["privacy-policy", "terms-and-conditions", "about-us", "help"];

export default function StaticPagesAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaticPage | null>(null);
  const [form, setForm] = useState({
    titleEn: "", titleHi: "", slug: "", contentEn: "", contentHi: "", isPublished: false,
  });

  const { data, isLoading } = useAdminListPages();
  const pages: StaticPage[] = (data as { data?: StaticPage[] })?.data ?? [];

  const createMutation = useAdminCreatePage();
  const updateMutation = useAdminUpdatePage();
  const deleteMutation = useAdminDeletePage();

  function openCreate() {
    setEditing(null);
    setForm({ titleEn: "", titleHi: "", slug: "", contentEn: "", contentHi: "", isPublished: false });
    setDialogOpen(true);
  }

  function openEdit(page: StaticPage) {
    setEditing(page);
    setForm({
      titleEn: page.titleEn ?? page.title,
      titleHi: page.titleHi ?? "",
      slug: page.slug,
      contentEn: page.contentEn ?? page.content,
      contentHi: page.contentHi ?? "",
      isPublished: page.isPublished,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.titleEn.trim() || !form.slug.trim() || !form.contentEn.trim()) {
      toast({ title: "Validation Error", description: "English title, slug, and content are required.", variant: "destructive" });
      return;
    }
    const slugClean = form.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const payload = {
      title: form.titleEn,
      titleEn: form.titleEn,
      titleHi: form.titleHi || undefined,
      slug: slugClean,
      content: form.contentEn,
      contentEn: form.contentEn,
      contentHi: form.contentHi || undefined,
      isPublished: form.isPublished,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload as any }, {
        onSuccess: () => { toast({ title: "Updated" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/pages"] }); },
        onError: (e: unknown) => {
          const msg = (e as any)?.response?.data?.message ?? "Failed to update page.";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      });
    } else {
      createMutation.mutate({ data: payload as any }, {
        onSuccess: () => { toast({ title: "Created" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/pages"] }); },
        onError: (e: unknown) => {
          const msg = (e as any)?.response?.data?.message ?? "Failed to create page.";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      });
    }
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId }, {
      onSuccess: () => { toast({ title: "Deleted" }); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["/api/admin/pages"] }); },
      onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
    });
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Static Pages</h1>
            <p className="text-muted-foreground text-sm">Manage Privacy Policy, Terms & Conditions, and other content pages.</p>
          </div>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New Page</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
          <p className="text-muted-foreground">No pages yet. Start by creating a Privacy Policy or Terms page.</p>
          <div className="flex gap-2 mt-4 flex-wrap justify-center">
            {SLUG_SUGGESTIONS.slice(0, 2).map((slug) => (
              <Button key={slug} size="sm" variant="outline" onClick={() => {
                setEditing(null);
                const label = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                setForm({ titleEn: label, titleHi: "", slug, contentEn: "", contentHi: "", isPublished: false });
                setDialogOpen(true);
              }}>
                Create {slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <div key={page.id} className="flex items-center gap-4 bg-card border border-border rounded-lg px-4 py-3">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{page.titleEn ?? page.title}</span>
                  <Badge variant={page.isPublished ? "default" : "secondary"} className="text-xs">{page.isPublished ? "Published" : "Draft"}</Badge>
                  <span className="text-xs text-muted-foreground">v{page.version}</span>
                  {page.titleHi && <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">हिंदी ✓</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">/{page.slug} · Updated {new Date(page.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" onClick={() => openEdit(page)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(page.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit: ${editing.titleEn ?? editing.title}` : "New Static Page"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label>Slug <span className="text-destructive">*</span></Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
                placeholder="privacy-policy"
                disabled={!!editing}
              />
              <p className="text-xs text-muted-foreground">URL: /public/pages/{form.slug || "..."}</p>
            </div>

            <Tabs defaultValue="en">
              <TabsList>
                <TabsTrigger value="en">🇬🇧 English</TabsTrigger>
                <TabsTrigger value="hi">🇮🇳 हिंदी</TabsTrigger>
              </TabsList>
              <TabsContent value="en" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label>Title (English) <span className="text-destructive">*</span></Label>
                  <Input value={form.titleEn} onChange={(e) => setForm(f => ({ ...f, titleEn: e.target.value }))} placeholder="Privacy Policy" />
                </div>
                <div className="space-y-2">
                  <Label>Content (English) <span className="text-destructive">*</span></Label>
                  <Textarea rows={14} value={form.contentEn} onChange={(e) => setForm(f => ({ ...f, contentEn: e.target.value }))} placeholder="Enter page content (plain text or markdown)…" className="font-mono text-xs resize-y" />
                </div>
              </TabsContent>
              <TabsContent value="hi" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label>शीर्षक (हिंदी)</Label>
                  <Input dir="auto" value={form.titleHi} onChange={(e) => setForm(f => ({ ...f, titleHi: e.target.value }))} placeholder="गोपनीयता नीति" />
                </div>
                <div className="space-y-2">
                  <Label>सामग्री (हिंदी)</Label>
                  <Textarea dir="auto" rows={14} value={form.contentHi} onChange={(e) => setForm(f => ({ ...f, contentHi: e.target.value }))} placeholder="पृष्ठ सामग्री दर्ज करें…" className="font-mono text-xs resize-y" />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-3">
              <Switch checked={form.isPublished} onCheckedChange={(v) => setForm(f => ({ ...f, isPublished: v }))} />
              <span className="text-sm">{form.isPublished ? "Published (visible to app users)" : "Draft (hidden from app)"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save Changes" : "Create Page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete page?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the page. Mobile users will no longer be able to view it.</AlertDialogDescription>
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
