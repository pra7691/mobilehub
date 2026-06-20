import React, { useState } from "react";
import {
  useAdminListFaq,
  useAdminCreateFaq,
  useAdminUpdateFaq,
  useAdminDeleteFaq,
  useAdminReorderFaq,
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
import { Loader2, Plus, Pencil, Trash2, GripVertical, HelpCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
}

export default function FaqPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [form, setForm] = useState({ question: "", answer: "", displayOrder: 0, isActive: true });

  const { data, isLoading } = useAdminListFaq({ limit: 100, search: search || undefined });
  const faqs: FaqItem[] = (data as { data?: FaqItem[] })?.data ?? [];

  const createMutation = useAdminCreateFaq();
  const updateMutation = useAdminUpdateFaq();
  const deleteMutation = useAdminDeleteFaq();
  const reorderMutation = useAdminReorderFaq();

  function openCreate() {
    setEditing(null);
    setForm({ question: "", answer: "", displayOrder: faqs.length, isActive: true });
    setDialogOpen(true);
  }

  function openEdit(faq: FaqItem) {
    setEditing(faq);
    setForm({ question: faq.question, answer: faq.answer, displayOrder: faq.displayOrder, isActive: faq.isActive });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.question.trim() || !form.answer.trim()) {
      toast({ title: "Validation Error", description: "Question and answer are required.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: { question: form.question, answer: form.answer, displayOrder: form.displayOrder, isActive: form.isActive } },
        {
          onSuccess: () => { toast({ title: "Updated" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }); },
          onError: () => toast({ title: "Error", description: "Failed to update FAQ.", variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: { question: form.question, answer: form.answer, displayOrder: form.displayOrder, isActive: form.isActive } },
        {
          onSuccess: () => { toast({ title: "Created" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }); },
          onError: () => toast({ title: "Error", description: "Failed to create FAQ.", variant: "destructive" }),
        }
      );
    }
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => { toast({ title: "Deleted" }); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }); },
        onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
      }
    );
  }

  function handleToggleActive(faq: FaqItem) {
    updateMutation.mutate(
      { id: faq.id, data: { isActive: !faq.isActive } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }),
        onError: () => toast({ title: "Error", description: "Failed to toggle.", variant: "destructive" }),
      }
    );
  }

  function handleMoveUp(idx: number) {
    if (idx === 0) return;
    const reordered = [...faqs];
    const temp = reordered[idx];
    reordered[idx] = reordered[idx - 1];
    reordered[idx - 1] = temp;
    const items = reordered.map((f, i) => ({ id: f.id, displayOrder: i }));
    reorderMutation.mutate(
      { data: { items } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }) }
    );
  }

  function handleMoveDown(idx: number) {
    if (idx === faqs.length - 1) return;
    const reordered = [...faqs];
    const temp = reordered[idx];
    reordered[idx] = reordered[idx + 1];
    reordered[idx + 1] = temp;
    const items = reordered.map((f, i) => ({ id: f.id, displayOrder: i }));
    reorderMutation.mutate(
      { data: { items } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }) }
    );
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HelpCircle className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">FAQ</h1>
            <p className="text-muted-foreground text-sm">Manage frequently asked questions shown in the mobile app.</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Add FAQ
        </Button>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search FAQs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : faqs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <HelpCircle className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
          <p className="text-muted-foreground">No FAQs yet. Click "Add FAQ" to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {faqs.map((faq, idx) => (
            <div
              key={faq.id}
              className="flex items-start gap-3 bg-card border border-border rounded-lg px-4 py-3"
            >
              <div className="flex flex-col gap-1 mt-1">
                <button
                  onClick={() => handleMoveUp(idx)}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Move up"
                >
                  <GripVertical className="h-4 w-4 rotate-180" />
                </button>
                <button
                  onClick={() => handleMoveDown(idx)}
                  disabled={idx === faqs.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Move down"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground font-mono">#{faq.displayOrder + 1}</span>
                  <Badge variant={faq.isActive ? "default" : "secondary"} className="text-xs">
                    {faq.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="font-medium text-foreground text-sm">{faq.question}</p>
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{faq.answer}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={faq.isActive}
                  onCheckedChange={() => handleToggleActive(faq)}
                  aria-label="Toggle active"
                />
                <Button size="icon" variant="ghost" onClick={() => openEdit(faq)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(faq.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Question <span className="text-destructive">*</span></Label>
              <Input
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                placeholder="What is Capto?"
              />
            </div>
            <div className="space-y-2">
              <Label>Answer <span className="text-destructive">*</span></Label>
              <Textarea
                rows={4}
                value={form.answer}
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                placeholder="Capto is a mobile data-collection platform…"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(e) => setForm((f) => ({ ...f, displayOrder: +e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  />
                  <span className="text-sm text-muted-foreground">{form.isActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save Changes" : "Create FAQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete FAQ?</AlertDialogTitle>
            <AlertDialogDescription>This FAQ will be removed from the mobile app. This action cannot be undone.</AlertDialogDescription>
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
