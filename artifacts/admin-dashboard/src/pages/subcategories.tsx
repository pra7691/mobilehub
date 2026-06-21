import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSubcategories, useCreateSubcategory, useUpdateSubcategory, useDeleteSubcategory,
  useListCategories, getListSubcategoriesQueryKey, type Subcategory,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Layers, Plus, MoreHorizontal, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslate } from "@/hooks/useTranslate";

export default function Subcategories() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameHi, setNameHi] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionHi, setDescriptionHi] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const { data, isLoading } = useListSubcategories({ page, limit: 20, search: search || undefined, categoryId: filterCategoryId || undefined });
  const { data: categoriesData } = useListCategories({ limit: 100 });
  const createMutation = useCreateSubcategory();
  const updateMutation = useUpdateSubcategory();
  const deleteMutation = useDeleteSubcategory();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSubcategoriesQueryKey() });
  const { translateBatch, translating } = useTranslate();

  const openCreate = () => {
    setEditingId(null); setNameEn(""); setNameHi(""); setDescriptionEn(""); setDescriptionHi("");
    setCategoryId(""); setDisplayOrder(0); setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (sub: Subcategory) => {
    setEditingId(sub.id);
    setNameEn((sub as any).nameEn ?? sub.name);
    setNameHi((sub as any).nameHi ?? "");
    setDescriptionEn((sub as any).descriptionEn ?? sub.description ?? "");
    setDescriptionHi((sub as any).descriptionHi ?? "");
    setCategoryId(sub.categoryId); setDisplayOrder(sub.displayOrder); setIsActive(sub.isActive);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!nameEn.trim()) { toast.error("English name is required"); return; }
    if (!categoryId) { toast.error("Category is required"); return; }
    const payload = {
      name: nameEn.trim(),
      nameEn: nameEn.trim(),
      nameHi: nameHi.trim() || undefined,
      description: descriptionEn || undefined,
      descriptionEn: descriptionEn.trim() || undefined,
      descriptionHi: descriptionHi.trim() || undefined,
      categoryId, displayOrder, isActive,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast.success("Subcategory updated"); },
        onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast.success("Subcategory created"); },
        onError: (e: any) => toast.error(e?.message ?? "Failed to create"),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast.success("Subcategory deleted"); },
      onError: (e: any) => { setDeleteId(null); toast.error(e?.message ?? "Failed to delete"); },
    });
  };

  const meta = data?.meta;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const categories = categoriesData?.data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="text-cyan-400" size={22} />
          <div>
            <h1 className="text-xl font-semibold text-white">Subcategories</h1>
            <p className="text-sm text-gray-400">{meta?.total ?? 0} subcategories</p>
          </div>
        </div>
        <Button onClick={openCreate} className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium gap-2">
          <Plus size={16} /> New Subcategory
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search subcategories..." className="pl-9 bg-gray-800 border-gray-700 text-white" />
        </div>
        <Select value={filterCategoryId} onValueChange={v => { setFilterCategoryId(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-white">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="all" className="text-gray-300">All categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id} className="text-gray-300">{c.icon} {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-400">Category</TableHead>
              <TableHead className="text-gray-400">Name (EN)</TableHead>
              <TableHead className="text-gray-400">Hindi</TableHead>
              <TableHead className="text-gray-400 text-center">Order</TableHead>
              <TableHead className="text-gray-400 text-center">Tasks</TableHead>
              <TableHead className="text-gray-400">Status</TableHead>
              <TableHead className="text-gray-400 w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="border-gray-800">
                {Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-700" /></TableCell>
                ))}
              </TableRow>
            )) : !data?.data.length ? (
              <TableRow className="border-gray-800">
                <TableCell colSpan={7} className="text-center text-gray-500 py-12">No subcategories yet.</TableCell>
              </TableRow>
            ) : data.data.map(sub => (
              <TableRow key={sub.id} className="border-gray-800 hover:bg-gray-800/50">
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span>{sub.category?.icon ?? "📁"}</span>
                    <span className="text-gray-300">{sub.category?.name ?? sub.categoryId}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-white">{(sub as any).nameEn ?? sub.name}</TableCell>
                <TableCell className="text-gray-400 text-sm">{(sub as any).nameHi || "—"}</TableCell>
                <TableCell className="text-center text-gray-400">{sub.displayOrder}</TableCell>
                <TableCell className="text-center"><Badge variant="outline" className="border-gray-600 text-gray-300">{sub.taskCount}</Badge></TableCell>
                <TableCell>
                  <Badge className={sub.isActive ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-gray-500/10 text-gray-400 border-gray-500/20"}>
                    {sub.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white"><MoreHorizontal size={16} /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-gray-800 border-gray-700">
                      <DropdownMenuItem onClick={() => openEdit(sub)} className="text-gray-300 hover:text-white cursor-pointer gap-2"><Pencil size={14} /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteId(sub.id)} className="text-red-400 hover:text-red-300 cursor-pointer gap-2"><Trash2 size={14} /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Page {meta.page} of {meta.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="border-gray-700 text-gray-300"><ChevronLeft size={14} /></Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)} className="border-gray-700 text-gray-300"><ChevronRight size={14} /></Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Subcategory" : "New Subcategory"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category <span className="text-red-400">*</span></Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {categories.filter(c => c.isActive).map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-gray-300">{c.icon} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs defaultValue="en">
              <TabsList className="bg-gray-800 border border-gray-700">
                <TabsTrigger value="en" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black">🇬🇧 English</TabsTrigger>
                <TabsTrigger value="hi" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-black">🇮🇳 हिंदी</TabsTrigger>
              </TabsList>
              <TabsContent value="en" className="space-y-3 mt-3">
                <div className="space-y-1.5">
                  <Label>Name (English) <span className="text-red-400">*</span></Label>
                  <Input value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder="Product Photography" className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description (English)</Label>
                  <Textarea value={descriptionEn} onChange={e => setDescriptionEn(e.target.value)} placeholder="Capture retail product images from multiple angles..." className="bg-gray-800 border-gray-700 text-white resize-none" rows={3} />
                </div>
              </TabsContent>
              <TabsContent value="hi" className="space-y-3 mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={translating || !nameEn.trim()}
                  onClick={async () => {
                    const [translatedName, translatedDesc] = await translateBatch([nameEn, descriptionEn]);
                    setNameHi(translatedName);
                    setDescriptionHi(translatedDesc);
                  }}
                  className="gap-1.5 border-gray-700 text-gray-300 hover:text-white"
                >
                  {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                  Translate from English
                </Button>
                <div className="space-y-1.5">
                  <Label>नाम (हिंदी)</Label>
                  <Input dir="auto" value={nameHi} onChange={e => setNameHi(e.target.value)} placeholder="प्रोडक्ट फोटोग्राफी" className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label>विवरण (हिंदी)</Label>
                  <Textarea dir="auto" value={descriptionHi} onChange={e => setDescriptionHi(e.target.value)} placeholder="कई कोणों से खुदरा उत्पाद की छवियां कैप्चर करें..." className="bg-gray-800 border-gray-700 text-white resize-none" rows={3} />
                </div>
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Display Order</Label>
                <Input type="number" value={displayOrder} onChange={e => setDisplayOrder(+e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={0} />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <Label>Active</Label>
                <div className="flex items-center h-9 gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <span className="text-sm text-gray-400">{isActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-gray-400">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-cyan-500 hover:bg-cyan-400 text-black">
              {isSaving ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-gray-900 border-gray-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subcategory?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">Subcategories with active tasks cannot be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-700 text-gray-300">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
