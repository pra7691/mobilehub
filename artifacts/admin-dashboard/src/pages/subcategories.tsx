import { useState } from "react";
import { useListSubcategories, useListCategories, useCreateSubcategory, useUpdateSubcategory, useDeleteSubcategory, getListSubcategoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Subcategories() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: categoriesData } = useListCategories({ limit: 100 });
  const { data, isLoading } = useListSubcategories({ 
    page, 
    limit: 20,
    categoryId: filterCategory !== "all" ? filterCategory : undefined
  });
  
  const createMutation = useCreateSubcategory();
  const updateMutation = useUpdateSubcategory();
  const deleteMutation = useDeleteSubcategory();

  const openCreateDialog = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setCategoryId(filterCategory !== "all" ? filterCategory : (categoriesData?.data?.[0]?.id || ""));
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEditDialog = (subcat: any) => {
    setEditingId(subcat.id);
    setName(subcat.name);
    setDescription(subcat.description || "");
    setCategoryId(subcat.categoryId);
    setIsActive(subcat.isActive);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name || !categoryId) return;
    
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: { name, description, categoryId, isActive } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSubcategoriesQueryKey() });
            setDialogOpen(false);
          }
        }
      );
    } else {
      createMutation.mutate(
        { data: { name, description, categoryId, isActive } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSubcategoriesQueryKey() });
            setDialogOpen(false);
          }
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this subcategory?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSubcategoriesQueryKey() });
          }
        }
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subcategories</h1>
          <p className="text-sm text-muted-foreground">Granular grouping under categories.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-[200px] bg-card">
              <SelectValue placeholder="Filter by Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoriesData?.data?.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button onClick={openCreateDialog} className="shrink-0 font-medium">
            <Plus className="h-4 w-4 mr-2" />
            New
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[250px]">Name</TableHead>
              <TableHead>Parent Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Tasks</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No subcategories found.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((subcat) => (
                <TableRow key={subcat.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{subcat.name}</div>
                    {subcat.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{subcat.description}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {subcat.category?.name || "Unknown"}
                  </TableCell>
                  <TableCell>
                    {subcat.isActive 
                      ? <Badge variant="default" className="bg-primary/15 text-primary hover:bg-primary/25 border-none font-medium">Active</Badge> 
                      : <Badge variant="secondary" className="bg-muted text-muted-foreground border-none font-medium">Inactive</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-right font-medium">{subcat.taskCount}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(subcat)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(subcat.id)} className="text-destructive focus:text-destructive">
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
            <DialogTitle>{editingId ? "Edit Subcategory" : "Create Subcategory"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Parent Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesData?.data?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="bg-background" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background min-h-[80px]" />
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
            <Button onClick={handleSave} disabled={!name || !categoryId || createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Save Changes" : "Create Subcategory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
