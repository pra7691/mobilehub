import React, { useState } from "react";
import {
  useGetAdminBanners,
  usePostAdminBanners,
  usePatchAdminBannersId,
  useDeleteAdminBannersId,
  usePatchAdminBannersIdStatus,
  usePostAdminBannersReorder,
  getGetAdminBannersQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Plus, Pencil, Trash2, Image as ImageIcon, Eye, ArrowUp, ArrowDown,
} from "lucide-react";

interface AdminBanner {
  id: string;
  imageUrl: string;
  mobileImageUrl?: string | null;
  titleEn?: string | null;
  titleHi?: string | null;
  descriptionEn?: string | null;
  descriptionHi?: string | null;
  displayOrder: number;
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_FORM = {
  imageUrl: "",
  mobileImageUrl: "",
  titleEn: "",
  titleHi: "",
  descriptionEn: "",
  descriptionHi: "",
  displayOrder: 0,
  isActive: true,
  startDate: "",
  endDate: "",
};

function toDateInput(iso?: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function BannerImagePreview({ url, title, description }: { url: string; title?: string; description?: string }) {
  if (!url) return null;
  return (
    <div className="rounded-lg overflow-hidden relative bg-muted" style={{ aspectRatio: "16/7" }}>
      <img
        src={url}
        alt="preview"
        className="w-full h-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      {(title || description) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          {title && <p className="text-white font-semibold text-sm leading-tight">{title}</p>}
          {description && <p className="text-white/80 text-xs mt-0.5 leading-snug">{description}</p>}
        </div>
      )}
    </div>
  );
}

export default function BannersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewBanner, setPreviewBanner] = useState<AdminBanner | null>(null);
  const [editing, setEditing] = useState<AdminBanner | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data, isLoading } = useGetAdminBanners({ limit: 100 });
  const banners: AdminBanner[] = (data as any)?.data ?? [];

  const createMutation = usePostAdminBanners();
  const updateMutation = usePatchAdminBannersId();
  const statusMutation = usePatchAdminBannersIdStatus();
  const deleteMutation = useDeleteAdminBannersId();
  const reorderMutation = usePostAdminBannersReorder();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetAdminBannersQueryKey() });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, displayOrder: banners.length });
    setDialogOpen(true);
  }

  function openEdit(b: AdminBanner) {
    setEditing(b);
    setForm({
      imageUrl: b.imageUrl,
      mobileImageUrl: b.mobileImageUrl ?? "",
      titleEn: b.titleEn ?? "",
      titleHi: b.titleHi ?? "",
      descriptionEn: b.descriptionEn ?? "",
      descriptionHi: b.descriptionHi ?? "",
      displayOrder: b.displayOrder,
      isActive: b.isActive,
      startDate: toDateInput(b.startDate),
      endDate: toDateInput(b.endDate),
    });
    setDialogOpen(true);
  }

  function set(key: keyof typeof form, value: string | boolean | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const payload = {
      imageUrl: form.imageUrl.trim(),
      mobileImageUrl: form.mobileImageUrl.trim() || undefined,
      titleEn: form.titleEn.trim() || undefined,
      titleHi: form.titleHi.trim() || undefined,
      descriptionEn: form.descriptionEn.trim() || undefined,
      descriptionHi: form.descriptionHi.trim() || undefined,
      displayOrder: Number(form.displayOrder),
      isActive: form.isActive,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    };

    if (!payload.imageUrl) {
      toast({ title: "Image URL is required", variant: "destructive" });
      return;
    }

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Banner updated" }); setDialogOpen(false); invalidate(); },
          onError: () => toast({ title: "Failed to update banner", variant: "destructive" }),
        },
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => { toast({ title: "Banner created" }); setDialogOpen(false); invalidate(); },
          onError: () => toast({ title: "Failed to create banner", variant: "destructive" }),
        },
      );
    }
  }

  function handleToggle(b: AdminBanner) {
    statusMutation.mutate(
      { id: b.id, data: { isActive: !b.isActive } },
      {
        onSuccess: () => { toast({ title: b.isActive ? "Banner disabled" : "Banner enabled" }); invalidate(); },
        onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
      },
    );
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => { toast({ title: "Banner deleted" }); setDeleteId(null); invalidate(); },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      },
    );
  }

  function moveOrder(b: AdminBanner, dir: -1 | 1) {
    const sorted = [...banners].sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = sorted.findIndex((x) => x.id === b.id);
    const target = sorted[idx + dir];
    if (!target) return;
    reorderMutation.mutate(
      {
        data: {
          items: [
            { id: b.id, displayOrder: target.displayOrder },
            { id: target.id, displayOrder: b.displayOrder },
          ],
        },
      },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ title: "Failed to reorder", variant: "destructive" }),
      },
    );
  }

  const sorted = [...banners].sort((a, b) => a.displayOrder - b.displayOrder);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const previewUrl = form.mobileImageUrl || form.imageUrl;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Banners</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage home screen banners shown to mobile users. Tapping a banner does nothing.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add Banner
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : banners.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No banners yet. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Order</TableHead>
                <TableHead className="w-24">Preview</TableHead>
                <TableHead>Title (EN)</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead className="w-24">Start</TableHead>
                <TableHead className="w-24">End</TableHead>
                <TableHead className="text-right w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((b, idx) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="flex flex-col items-center gap-0.5">
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5"
                        disabled={idx === 0} onClick={() => moveOrder(b, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <span className="text-xs text-muted-foreground">{b.displayOrder}</span>
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5"
                        disabled={idx === sorted.length - 1} onClick={() => moveOrder(b, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="w-20 h-10 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                      {b.mobileImageUrl || b.imageUrl ? (
                        <img
                          src={b.mobileImageUrl ?? b.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[200px]">
                      <p className="font-medium truncate text-sm">
                        {b.titleEn || <span className="text-muted-foreground italic text-xs">No title</span>}
                      </p>
                      {b.descriptionEn && (
                        <p className="text-xs text-muted-foreground truncate">{b.descriptionEn}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch checked={b.isActive} onCheckedChange={() => handleToggle(b)} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.startDate ? b.startDate.slice(0, 10) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.endDate ? b.endDate.slice(0, 10) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewBanner(b)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(b.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Banner" : "New Banner"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="image">
            <TabsList className="mb-4">
              <TabsTrigger value="image">Images & Settings</TabsTrigger>
              <TabsTrigger value="en">English Text</TabsTrigger>
              <TabsTrigger value="hi">Hindi Text</TabsTrigger>
            </TabsList>

            <TabsContent value="image" className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  Image URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="https://example.com/banner.jpg"
                  value={form.imageUrl}
                  onChange={(e) => set("imageUrl", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Mobile Image URL{" "}
                  <span className="text-muted-foreground text-xs">(optional — overrides above on mobile)</span>
                </Label>
                <Input
                  placeholder="https://example.com/banner-mobile.jpg"
                  value={form.mobileImageUrl}
                  onChange={(e) => set("mobileImageUrl", e.target.value)}
                />
              </div>
              {previewUrl && (
                <BannerImagePreview url={previewUrl} title={form.titleEn} description={form.descriptionEn} />
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Display Order</Label>
                  <Input
                    type="number" min={0} value={form.displayOrder}
                    onChange={(e) => set("displayOrder", parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} id="isActiveSwitch" />
                  <Label htmlFor="isActiveSwitch">Active</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="en" className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title (English)</Label>
                <Input
                  placeholder="Optional title overlay"
                  value={form.titleEn}
                  onChange={(e) => set("titleEn", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description (English)</Label>
                <Textarea
                  placeholder="Optional short description"
                  value={form.descriptionEn}
                  onChange={(e) => set("descriptionEn", e.target.value)}
                  rows={3}
                />
              </div>
              {previewUrl && (
                <BannerImagePreview url={previewUrl} title={form.titleEn} description={form.descriptionEn} />
              )}
            </TabsContent>

            <TabsContent value="hi" className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title (Hindi)</Label>
                <Input
                  placeholder="वैकल्पिक शीर्षक"
                  value={form.titleHi}
                  onChange={(e) => set("titleHi", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description (Hindi)</Label>
                <Textarea
                  placeholder="वैकल्पिक विवरण"
                  value={form.descriptionHi}
                  onChange={(e) => set("descriptionHi", e.target.value)}
                  rows={3}
                />
              </div>
              {previewUrl && (
                <BannerImagePreview url={previewUrl} title={form.titleHi || form.titleEn} description={form.descriptionHi || form.descriptionEn} />
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Save Changes" : "Create Banner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete banner?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the banner from the mobile app. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview dialog */}
      <Dialog open={!!previewBanner} onOpenChange={(o) => !o && setPreviewBanner(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Banner Preview</DialogTitle>
          </DialogHeader>
          {previewBanner && (
            <BannerImagePreview
              url={previewBanner.mobileImageUrl ?? previewBanner.imageUrl}
              title={previewBanner.titleEn ?? undefined}
              description={previewBanner.descriptionEn ?? undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
