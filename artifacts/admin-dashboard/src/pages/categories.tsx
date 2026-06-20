import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  getListCategoriesQueryKey, type Category,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FolderTree, Plus, MoreHorizontal, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const EMOJI_SUGGESTIONS = ["📸","🎙️","🎥","🔍","🛒","🏠","🌿","🚗","🍕","👔","💻","📚","🏋️","🎮","✈️","🎨","🔬","📊","🌍","🏥"];

export default function Categories() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const { data, isLoading } = useListCategories({ page, limit: 20, search: search || undefined });
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

  const openCreate = () => {
    setEditingId(null); setName(""); setDescription(""); setIcon(""); setCoverImageUrl(""); setDisplayOrder(0); setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingId(cat.id); setName(cat.name); setDescription(cat.description ?? ""); setIcon(cat.icon ?? "");
    setCoverImageUrl(cat.coverImageUrl ?? ""); setDisplayOrder(cat.displayOrder); setIsActive(cat.isActive);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const payload = { name: name.trim(), description: description || undefined, icon: icon || undefined, coverImageUrl: coverImageUrl || undefined, displayOrder, isActive };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast.success("Category updated"); },
        onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast.success("Category created"); },
        onError: (e: any) => toast.error(e?.message ?? "Failed to create"),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast.success("Category deleted"); },
      onError: (e: any) => { setDeleteId(null); toast.error(e?.message ?? "Failed to delete"); },
    });
  };

  const meta = data?.meta;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderTree className="text-cyan-400" size={22} />
          <div>
            <h1 className="text-xl font-semibold text-white">Categories</h1>
            <p className="text-sm text-gray-400">{meta?.total ?? 0} categories</p>
          </div>
        </div>
        <Button onClick={openCreate} className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium gap-2">
          <Plus size={16} /> New Category
        </Button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search categories..." className="pl-9 bg-gray-800 border-gray-700 text-white" />
      </div>

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-400">Icon</TableHead>
              <TableHead className="text-gray-400">Name</TableHead>
              <TableHead className="text-gray-400">Description</TableHead>
              <TableHead className="text-gray-400 text-center">Order</TableHead>
              <TableHead className="text-gray-400 text-center">Subcategories</TableHead>
              <TableHead className="text-gray-400 text-center">Tasks</TableHead>
              <TableHead className="text-gray-400">Status</TableHead>
              <TableHead className="text-gray-400 w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="border-gray-800">
                {Array.from({ length: 8 }).map((__, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-700" /></TableCell>
                ))}
              </TableRow>
            )) : !data?.data.length ? (
              <TableRow className="border-gray-800">
                <TableCell colSpan={8} className="text-center text-gray-500 py-12">
                  No categories yet. Create the first one.
                </TableCell>
              </TableRow>
            ) : data.data.map(cat => (
              <TableRow key={cat.id} className="border-gray-800 hover:bg-gray-800/50">
                <TableCell className="text-2xl">{cat.icon || "📁"}</TableCell>
                <TableCell className="font-medium text-white">{cat.name}</TableCell>
                <TableCell className="text-gray-400 text-sm max-w-xs truncate">{cat.description || "—"}</TableCell>
                <TableCell className="text-center text-gray-400">{cat.displayOrder}</TableCell>
                <TableCell className="text-center"><Badge variant="outline" className="border-gray-600 text-gray-300">{cat.subcategoryCount}</Badge></TableCell>
                <TableCell className="text-center"><Badge variant="outline" className="border-gray-600 text-gray-300">{cat.taskCount}</Badge></TableCell>
                <TableCell>
                  <Badge className={cat.isActive ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-gray-500/10 text-gray-400 border-gray-500/20"}>
                    {cat.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white"><MoreHorizontal size={16} /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-gray-800 border-gray-700">
                      <DropdownMenuItem onClick={() => openEdit(cat)} className="text-gray-300 hover:text-white cursor-pointer gap-2">
                        <Pencil size={14} /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteId(cat.id)} className="text-red-400 hover:text-red-300 cursor-pointer gap-2">
                        <Trash2 size={14} /> Delete
                      </DropdownMenuItem>
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
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="border-gray-700 text-gray-300">
              <ChevronLeft size={14} />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)} className="border-gray-700 text-gray-300">
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Icon (emoji)</Label>
              <div className="flex gap-2 items-center">
                <Input value={icon} onChange={e => setIcon(e.target.value)} placeholder="📸" className="bg-gray-800 border-gray-700 text-white w-20 text-2xl text-center" maxLength={4} />
                <div className="flex flex-wrap gap-1 flex-1">
                  {EMOJI_SUGGESTIONS.map(e => (
                    <button key={e} onClick={() => setIcon(e)} className="text-xl hover:bg-gray-700 rounded p-0.5 transition-colors" type="button">{e}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-400">*</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Photography" className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Capture high-quality images for AI datasets..." className="bg-gray-800 border-gray-700 text-white resize-none" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Cover Image URL</Label>
              <Input value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} placeholder="https://..." className="bg-gray-800 border-gray-700 text-white" />
            </div>
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
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will soft-delete the category. Categories with active subcategories or tasks cannot be deleted.
            </AlertDialogDescription>
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
