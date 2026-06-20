import { useState } from "react";
import { useListTasks, useListCategories, useListSubcategories, useCreateTask, useUpdateTask, useDeleteTask, getListTasksQueryKey, ListTasksStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight, Filter, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function Tasks() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<ListTasksStatus | "all">("all");
  const limit = 15;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined);
  const [reward, setReward] = useState<number>(0);
  const [taskStatus, setTaskStatus] = useState<ListTasksStatus>("draft");

  const { data, isLoading } = useListTasks({ 
    page, 
    limit, 
    search: debouncedSearch || undefined,
    status: status !== "all" ? status : undefined
  });

  const { data: categoriesData } = useListCategories({ limit: 100 });
  const { data: subcategoriesData } = useListSubcategories({ 
    limit: 100, 
    categoryId: categoryId || undefined 
  });

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
    setPage(1);
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setInstructions("");
    setCategoryId(categoriesData?.data?.[0]?.id || "");
    setSubcategoryId(undefined);
    setReward(0);
    setTaskStatus("draft");
    setDialogOpen(true);
  };

  const openEditDialog = (task: any) => {
    setEditingId(task.id);
    setTitle(task.title);
    setDescription(task.description || "");
    setInstructions(task.instructions || "");
    setCategoryId(task.categoryId);
    setSubcategoryId(task.subcategoryId || undefined);
    setReward(task.reward);
    setTaskStatus(task.status);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!title || !categoryId) return;
    
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: { title, description, instructions, categoryId, subcategoryId, reward, status: taskStatus } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            setDialogOpen(false);
          }
        }
      );
    } else {
      createMutation.mutate(
        { data: { title, description, instructions, categoryId, subcategoryId, reward, status: taskStatus } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            setDialogOpen(false);
          }
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          }
        }
      );
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'active': return <Badge className="bg-primary/15 text-primary hover:bg-primary/25 border-none font-medium">Active</Badge>;
      case 'draft': return <Badge variant="secondary" className="bg-muted text-muted-foreground border-none font-medium">Draft</Badge>;
      case 'inactive': return <Badge variant="secondary" className="bg-muted text-muted-foreground border-none font-medium">Inactive</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">Manage data collection assignments.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[150px] bg-card">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <form onSubmit={handleSearch} className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search tasks..."
              className="pl-8 bg-card"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          <Button onClick={openCreateDialog} className="shrink-0 font-medium">
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[300px]">Task Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Reward</TableHead>
              <TableHead className="text-right">Submissions</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No tasks found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((task) => (
                <TableRow key={task.id} className="group cursor-pointer">
                  <TableCell>
                    <div className="font-medium text-foreground">{task.title}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                      {task.description || "No description"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{task.category?.name}</div>
                    {task.subcategory && <div className="text-xs text-muted-foreground">↳ {task.subcategory.name}</div>}
                  </TableCell>
                  <TableCell>{getStatusBadge(task.status)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium text-emerald-500">
                    ${task.reward.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {task.submissionCount}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(task)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(task.id)} className="text-destructive focus:text-destructive">
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

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium">{data.data.length}</span> of <span className="font-medium">{data.meta.total}</span> tasks
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => p + 1)}
              disabled={page >= data.meta.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[550px] border-border bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Task" : "Create Task"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select value={categoryId} onValueChange={(val) => { setCategoryId(val); setSubcategoryId(undefined); }}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesData?.data?.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="subcategory">Subcategory (Optional)</Label>
                <Select value={subcategoryId || "none"} onValueChange={(val) => setSubcategoryId(val === "none" ? undefined : val)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {subcategoriesData?.data?.map(subcat => (
                      <SelectItem key={subcat.id} value={subcat.id}>{subcat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="reward">Reward Amount ($)</Label>
                <Input 
                  id="reward" 
                  type="number" 
                  step="0.01" 
                  min="0"
                  value={reward} 
                  onChange={(e) => setReward(parseFloat(e.target.value) || 0)} 
                  className="bg-background" 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select value={taskStatus} onValueChange={(val: any) => setTaskStatus(val)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                className="bg-background min-h-[80px]" 
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea 
                id="instructions" 
                value={instructions} 
                onChange={(e) => setInstructions(e.target.value)} 
                className="bg-background min-h-[120px]" 
                placeholder="Detailed steps for the user..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!title || !categoryId || createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
