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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Loader2, Plus, Pencil, Trash2, GripVertical, HelpCircle, Languages } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@/hooks/useTranslate";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  questionEn?: string | null;
  questionHi?: string | null;
  answerEn?: string | null;
  answerHi?: string | null;
  displayOrder: number;
  isActive: boolean;
}

export default function FaqPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { translateBatch, translating } = useTranslate();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [form, setForm] = useState({
    questionEn: "", questionHi: "", answerEn: "", answerHi: "",
    displayOrder: 0, isActive: true,
  });

  const { data, isLoading } = useAdminListFaq({ limit: 100, search: search || undefined });
  const faqs: FaqItem[] = (data as { data?: FaqItem[] })?.data ?? [];

  const createMutation = useAdminCreateFaq();
  const updateMutation = useAdminUpdateFaq();
  const deleteMutation = useAdminDeleteFaq();
  const reorderMutation = useAdminReorderFaq();

  function openCreate() {
    setEditing(null);
    setForm({ questionEn: "", questionHi: "", answerEn: "", answerHi: "", displayOrder: faqs.length, isActive: true });
    setDialogOpen(true);
  }

  function openEdit(faq: FaqItem) {
    setEditing(faq);
    setForm({
      questionEn: faq.questionEn ?? faq.question,
      questionHi: faq.questionHi ?? "",
      answerEn: faq.answerEn ?? faq.answer,
      answerHi: faq.answerHi ?? "",
      displayOrder: faq.displayOrder,
      isActive: faq.isActive,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.questionEn.trim() || !form.answerEn.trim()) {
      toast({ title: "Validation Error", description: "English question and answer are required.", variant: "destructive" });
      return;
    }
    const payload = {
      question: form.questionEn,
      questionEn: form.questionEn,
      questionHi: form.questionHi || undefined,
      answer: form.answerEn,
      answerEn: form.answerEn,
      answerHi: form.answerHi || undefined,
      displayOrder: form.displayOrder,
      isActive: form.isActive,
    };
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Updated" }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }); },
          onError: () => toast({ title: "Error", description: "Failed to update FAQ.", variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
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
    const temp = reordered[idx]; reordered[idx] = reordered[idx - 1]; reordered[idx - 1] = temp;
    reorderMutation.mutate({ data: { items: reordered.map((f, i) => ({ id: f.id, displayOrder: i })) } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }) });
  }

  function handleMoveDown(idx: number) {
    if (idx === faqs.length - 1) return;
    const reordered = [...faqs];
    const temp = reordered[idx]; reordered[idx] = reordered[idx + 1]; reordered[idx + 1] = temp;
    reorderMutation.mutate({ data: { items: reordered.map((f, i) => ({ id: f.id, displayOrder: i })) } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] }) });
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
        <Input placeholder="Search FAQs…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : faqs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <HelpCircle className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
          <p className="text-muted-foreground">No FAQs yet. Click "Add FAQ" to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {faqs.map((faq, idx) => (
            <div key={faq.id} className="flex items-start gap-3 bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex flex-col gap-1 mt-1">
                <button onClick={() => handleMoveUp(idx)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up">
                  <GripVertical className="h-4 w-4 rotate-180" />
                </button>
                <button onClick={() => handleMoveDown(idx)} disabled={idx === faqs.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down">
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground font-mono">#{faq.displayOrder + 1}</span>
                  <Badge variant={faq.isActive ? "default" : "secondary"} className="text-xs">{faq.isActive ? "Active" : "Inactive"}</Badge>
                  {faq.questionHi && <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">हिंदी ✓</Badge>}
                </div>
                <p className="font-medium text-foreground text-sm">{faq.questionEn ?? faq.question}</p>
                {faq.questionHi && <p className="text-amber-400/70 text-xs mt-0.5" dir="auto">{faq.questionHi}</p>}
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{faq.answerEn ?? faq.answer}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={faq.isActive} onCheckedChange={() => handleToggleActive(faq)} aria-label="Toggle active" />
                <Button size="icon" variant="ghost" onClick={() => openEdit(faq)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(faq.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Tabs defaultValue="en">
              <TabsList>
                <TabsTrigger value="en">🇬🇧 English</TabsTrigger>
                <TabsTrigger value="hi">🇮🇳 हिंदी</TabsTrigger>
              </TabsList>
              <TabsContent value="en" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label>Question (English) <span className="text-destructive">*</span></Label>
                  <Input value={form.questionEn} onChange={(e) => setForm(f => ({ ...f, questionEn: e.target.value }))} placeholder="What is Capto?" />
                </div>
                <div className="space-y-2">
                  <Label>Answer (English) <span className="text-destructive">*</span></Label>
                  <Textarea rows={4} value={form.answerEn} onChange={(e) => setForm(f => ({ ...f, answerEn: e.target.value }))} placeholder="Capto is a mobile data-collection platform…" />
                </div>
              </TabsContent>
              <TabsContent value="hi" className="space-y-3 mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={translating || !form.questionEn.trim()}
                  onClick={async () => {
                    const [questionHi, answerHi] = await translateBatch([form.questionEn, form.answerEn]);
                    setForm(f => ({ ...f, questionHi, answerHi }));
                  }}
                  className="gap-1.5"
                >
                  {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                  Translate from English
                </Button>
                <div className="space-y-2">
                  <Label>प्रश्न (हिंदी)</Label>
                  <Input dir="auto" value={form.questionHi} onChange={(e) => setForm(f => ({ ...f, questionHi: e.target.value }))} placeholder="Capto क्या है?" />
                </div>
                <div className="space-y-2">
                  <Label>उत्तर (हिंदी)</Label>
                  <Textarea dir="auto" rows={4} value={form.answerHi} onChange={(e) => setForm(f => ({ ...f, answerHi: e.target.value }))} placeholder="Capto एक मोबाइल डेटा-संग्रह प्लेटफॉर्म है…" />
                </div>
              </TabsContent>
            </Tabs>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input type="number" min={0} value={form.displayOrder} onChange={(e) => setForm(f => ({ ...f, displayOrder: +e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />
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
