import { useState, useRef } from "react";
import { useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderTree, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

export default function Categories() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data, isLoading } = useListCategories({ page, limit: 20 });
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const openCreateDialog = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEditDialog = (category: any) => {
    setEditingId(category.id);
    setName(category.name);
    setDescription(category.description || "");
    setIsActive(category.isActive);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name) return;
    
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: { name, description, isActive } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
            setDialogOpen(false);
          }
        }
      );
    } else {
      createMutation.mutate(
        { data: { name, description, isActive } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
            setDialogOpen(false);
          }
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this category?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          }
        }
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">Top-level grouping for data collection tasks.</p>
        </div>
        
        <Button onClick={openCreateDialog} className="shrink-0 font-medium">
          <Plus className="h-4 w-4 mr-2" />
          New Category
        </Button>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[300px]">Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Subcategories</TableHead>
              <TableHead className="text-right">Tasks</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-60 mt-1" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <FolderTree className="h-8 w-8 mb-2 opacity-50" />
                    <p>No categories created yet.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{cat.name}</div>
                    {cat.description && <div className="text-xs text-muted-foreground truncate max-w-md">{cat.description}</div>}
                  </TableCell>
                  <TableCell>
                    {cat.isActive 
                      ? <Badge variant="default" className="bg-primary/15 text-primary hover:bg-primary/25 border-none font-medium">Active</Badge> 
                      : <Badge variant="secondary" className="bg-muted text-muted-foreground border-none font-medium">Inactive</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-right font-medium">{cat.subcategoryCount}</TableCell>
                  <TableCell className="text-right font-medium">{cat.taskCount}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(cat)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(cat.id)} className="text-destructive focus:text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px] border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Category" : "Create Category"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="bg-background" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background min-h-[100px]" />
            </div>
            <div className="flex items-center justify-between mt-2 p-3 border border-border rounded-lg bg-background/50">
              <div className="space-y-0.5">
                <Label>Active Status</Label>
                <div className="text-xs text-muted-foreground">Visible to mobile users</div>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name || createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Save Changes" : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
