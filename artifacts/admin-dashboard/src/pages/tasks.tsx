import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask, useDuplicateTask,
  useListCategories, useListSubcategories,
  getListTasksQueryKey,
  type Task,
  type CreateTaskRequest,
  type UpdateTaskRequest,
  CreateTaskRequestCollectionType,
  CreateTaskRequestPreferredCamera,
  CreateTaskRequestPreferredLens,
  CreateTaskRequestRequiredOrientation,
  CreateTaskRequestStatus,
  ListTasksCollectionType,
  TaskStatus,
} from "@workspace/api-client-react";
import { formatINR } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListTodo, Plus, MoreHorizontal, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Copy, Eye, Video, Image, Mic, X, Plus as PlusIcon, CheckCircle2, XCircle, Languages, Loader2 } from "lucide-react";
import { useTranslate } from "@/hooks/useTranslate";
import { toast } from "sonner";

const COLLECTION_TYPE_COLORS: Record<string, string> = {
  VIDEO: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  IMAGE: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  AUDIO: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  inactive: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};
const COLLECTION_ICONS = { VIDEO: Video, IMAGE: Image, AUDIO: Mic };

type FormData = {
  title: string; titleHi: string;
  description: string; descriptionHi: string;
  detailedInstructions: string; detailedInstructionsHi: string;
  dos: string[]; donts: string[];
  dosHi: string[]; dontsHi: string[];
  categoryId: string; subcategoryId: string;
  collectionType: string; paymentAmount: string; currency: string;
  sampleMediaUrl: string;
  minimumDurationSeconds: string; maximumDurationSeconds: string;
  minimumImageCount: string; maximumImageCount: string;
  preferredFps: string; minimumFps: string;
  preferredCamera: string; preferredLens: string; requiredOrientation: string;
  audioRequired: boolean; pauseAllowed: boolean;
  maxSubmissionsPerUser: string; maxTotalSubmissions: string;
  startDate: string; endDate: string;
  displayOrder: string; status: string;
};

const defaultForm = (): FormData => ({
  title: "", titleHi: "", description: "", descriptionHi: "",
  detailedInstructions: "", detailedInstructionsHi: "",
  dos: [], donts: [], dosHi: [], dontsHi: [],
  categoryId: "", subcategoryId: "", collectionType: "IMAGE", paymentAmount: "0", currency: "INR",
  sampleMediaUrl: "", minimumDurationSeconds: "", maximumDurationSeconds: "",
  minimumImageCount: "", maximumImageCount: "", preferredFps: "", minimumFps: "",
  preferredCamera: "ANY", preferredLens: "ANY", requiredOrientation: "ANY",
  audioRequired: false, pauseAllowed: true,
  maxSubmissionsPerUser: "", maxTotalSubmissions: "", startDate: "", endDate: "",
  displayOrder: "0", status: "draft",
});

function taskToForm(t: Task): FormData {
  return {
    title: (t as any).titleEn ?? t.title,
    titleHi: (t as any).titleHi ?? "",
    description: (t as any).descriptionEn ?? t.description ?? "",
    descriptionHi: (t as any).descriptionHi ?? "",
    detailedInstructions: (t as any).detailedInstructionsEn ?? t.detailedInstructions ?? "",
    detailedInstructionsHi: (t as any).detailedInstructionsHi ?? "",
    dos: (t as any).dosEn ?? t.dos ?? [],
    donts: (t as any).dontsEn ?? t.donts ?? [],
    dosHi: (t as any).dosHi ?? [],
    dontsHi: (t as any).dontsHi ?? [],
    categoryId: t.categoryId, subcategoryId: t.subcategoryId ?? "",
    collectionType: t.collectionType, paymentAmount: String(t.paymentAmount),
    currency: t.currency, sampleMediaUrl: t.sampleMediaUrl ?? "",
    minimumDurationSeconds: t.minimumDurationSeconds != null ? String(t.minimumDurationSeconds) : "",
    maximumDurationSeconds: t.maximumDurationSeconds != null ? String(t.maximumDurationSeconds) : "",
    minimumImageCount: t.minimumImageCount != null ? String(t.minimumImageCount) : "",
    maximumImageCount: t.maximumImageCount != null ? String(t.maximumImageCount) : "",
    preferredFps: t.preferredFps != null ? String(t.preferredFps) : "",
    minimumFps: t.minimumFps != null ? String(t.minimumFps) : "",
    preferredCamera: t.preferredCamera, preferredLens: t.preferredLens, requiredOrientation: t.requiredOrientation,
    audioRequired: t.audioRequired, pauseAllowed: t.pauseAllowed,
    maxSubmissionsPerUser: t.maxSubmissionsPerUser != null ? String(t.maxSubmissionsPerUser) : "",
    maxTotalSubmissions: t.maxTotalSubmissions != null ? String(t.maxTotalSubmissions) : "",
    startDate: t.startDate ? t.startDate.slice(0, 16) : "",
    endDate: t.endDate ? t.endDate.slice(0, 16) : "",
    displayOrder: String(t.displayOrder), status: t.status,
  };
}

function formToPayload(f: FormData): CreateTaskRequest {
  const opt = (v: string) => v !== "" ? v : undefined;
  const optNum = (v: string) => v !== "" ? Number(v) : undefined;
  return {
    title: f.title,
    ...(f.titleHi ? { titleHi: f.titleHi } : {}),
    description: opt(f.description),
    ...(f.descriptionHi ? { descriptionHi: f.descriptionHi } : {}),
    detailedInstructions: opt(f.detailedInstructions),
    ...(f.detailedInstructionsHi ? { detailedInstructionsHi: f.detailedInstructionsHi } : {}),
    dos: f.dos, donts: f.donts,
    ...(f.dosHi.length ? { dosHi: f.dosHi } : {}),
    ...(f.dontsHi.length ? { dontsHi: f.dontsHi } : {}),
    categoryId: f.categoryId, subcategoryId: opt(f.subcategoryId),
    collectionType: f.collectionType as any,
    paymentAmount: Number(f.paymentAmount), currency: f.currency,
    sampleMediaUrl: opt(f.sampleMediaUrl),
    minimumDurationSeconds: optNum(f.minimumDurationSeconds),
    maximumDurationSeconds: optNum(f.maximumDurationSeconds),
    minimumImageCount: optNum(f.minimumImageCount),
    maximumImageCount: optNum(f.maximumImageCount),
    preferredFps: optNum(f.preferredFps), minimumFps: optNum(f.minimumFps),
    preferredCamera: f.preferredCamera as any, preferredLens: f.preferredLens as any,
    requiredOrientation: f.requiredOrientation as any,
    audioRequired: f.audioRequired, pauseAllowed: f.pauseAllowed,
    maxSubmissionsPerUser: optNum(f.maxSubmissionsPerUser),
    maxTotalSubmissions: optNum(f.maxTotalSubmissions),
    startDate: opt(f.startDate), endDate: opt(f.endDate),
    displayOrder: Number(f.displayOrder), status: f.status as any,
  };
}

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => { if (input.trim()) { onChange([...items, input.trim()]); setInput(""); } };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={`Add ${label.toLowerCase()} and press Enter`} className="bg-gray-800 border-gray-700 text-white text-sm" />
        <Button type="button" size="sm" onClick={add} className="bg-gray-700 hover:bg-gray-600 text-white"><PlusIcon size={14} /></Button>
      </div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 bg-gray-800/50 rounded px-2 py-1 text-sm">
            {label.includes("Dos") ? <CheckCircle2 size={13} className="text-green-400 shrink-0" /> : <XCircle size={13} className="text-red-400 shrink-0" />}
            <span className="text-gray-200 flex-1">{item}</span>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400"><X size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterSubcategoryId, setFilterSubcategoryId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm());
  const setField = (k: keyof FormData, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useListTasks({
    page, limit: 20,
    search: search || undefined,
    categoryId: filterCategoryId || undefined,
    subcategoryId: filterSubcategoryId || undefined,
    status: filterStatus as any || undefined,
    collectionType: filterType as any || undefined,
  });
  const { data: categoriesData } = useListCategories({ limit: 100 });
  const { data: subcategoriesData } = useListSubcategories({ categoryId: form.categoryId || filterCategoryId || undefined, limit: 100 });

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const duplicateMutation = useDuplicateTask();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
  const { translateBatch, translating } = useTranslate();

  const openCreate = () => { setEditingId(null); setForm(defaultForm()); setDialogOpen(true); };
  const openEdit = (t: Task) => { setEditingId(t.id); setForm(taskToForm(t)); setDialogOpen(true); };

  const handleSave = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.categoryId) { toast.error("Category is required"); return; }
    const payload = formToPayload(form);
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload as UpdateTaskRequest }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast.success("Task updated"); },
        onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { invalidate(); setDialogOpen(false); toast.success("Task created"); },
        onError: (e: any) => toast.error(e?.message ?? "Failed to create"),
      });
    }
  };

  const handleDuplicate = (id: string) => {
    duplicateMutation.mutate({ id }, {
      onSuccess: () => { invalidate(); toast.success("Task duplicated as draft"); },
      onError: (e: any) => toast.error(e?.message ?? "Failed to duplicate"),
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast.success("Task deleted"); },
      onError: (e: any) => { setDeleteId(null); toast.error(e?.message ?? "Failed to delete"); },
    });
  };

  const meta = data?.meta;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const categories = categoriesData?.data ?? [];
  const subcategories = subcategoriesData?.data ?? [];

  const isVideoOrAudio = form.collectionType === "VIDEO" || form.collectionType === "AUDIO";
  const isImage = form.collectionType === "IMAGE";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="text-cyan-400" size={22} />
          <div>
            <h1 className="text-xl font-semibold text-white">Tasks</h1>
            <p className="text-sm text-gray-400">{meta?.total ?? 0} tasks</p>
          </div>
        </div>
        <Button onClick={openCreate} className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium gap-2">
          <Plus size={16} /> New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search tasks..." className="pl-9 bg-gray-800 border-gray-700 text-white" />
        </div>
        <Select value={filterCategoryId} onValueChange={v => { setFilterCategoryId(v === "all" ? "" : v); setFilterSubcategoryId(""); setPage(1); }}>
          <SelectTrigger className="w-44 bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="all" className="text-gray-300">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-gray-300">{c.icon} {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36 bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="all" className="text-gray-300">All statuses</SelectItem>
            <SelectItem value="active" className="text-gray-300">Active</SelectItem>
            <SelectItem value="inactive" className="text-gray-300">Inactive</SelectItem>
            <SelectItem value="draft" className="text-gray-300">Draft</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={v => { setFilterType(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36 bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="all" className="text-gray-300">All types</SelectItem>
            <SelectItem value="VIDEO" className="text-gray-300">Video</SelectItem>
            <SelectItem value="IMAGE" className="text-gray-300">Image</SelectItem>
            <SelectItem value="AUDIO" className="text-gray-300">Audio</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableHead className="text-gray-400">Title</TableHead>
              <TableHead className="text-gray-400">Type</TableHead>
              <TableHead className="text-gray-400">Category / Subcategory</TableHead>
              <TableHead className="text-gray-400">Payment</TableHead>
              <TableHead className="text-gray-400">Status</TableHead>
              <TableHead className="text-gray-400 text-center">Submissions</TableHead>
              <TableHead className="text-gray-400 w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i} className="border-gray-800">
                {Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-700" /></TableCell>)}
              </TableRow>
            )) : !data?.data.length ? (
              <TableRow className="border-gray-800">
                <TableCell colSpan={7} className="text-center text-gray-500 py-12">No tasks yet. Create the first one.</TableCell>
              </TableRow>
            ) : data.data.map(t => {
              const Icon = COLLECTION_ICONS[t.collectionType as keyof typeof COLLECTION_ICONS] ?? Image;
              return (
                <TableRow key={t.id} className="border-gray-800 hover:bg-gray-800/50">
                  <TableCell>
                    <button onClick={() => setDetailTask(t)} className="text-left hover:text-cyan-400 transition-colors">
                      <div className="font-medium text-white">{t.title}</div>
                      {t.description && <div className="text-xs text-gray-400 truncate max-w-xs">{t.description}</div>}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge className={`gap-1 ${COLLECTION_TYPE_COLORS[t.collectionType] ?? ""}`}>
                      <Icon size={11} />{t.collectionType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="text-gray-300">{t.category?.icon} {t.category?.name ?? t.categoryId}</div>
                    {t.subcategory && <div className="text-gray-500 text-xs">{t.subcategory.name}</div>}
                  </TableCell>
                  <TableCell className="text-cyan-400 font-medium">{formatINR(Number(t.paymentAmount))}</TableCell>
                  <TableCell><Badge className={STATUS_COLORS[t.status] ?? ""}>{t.status}</Badge></TableCell>
                  <TableCell className="text-center"><Badge variant="outline" className="border-gray-600 text-gray-300">{t.submissionCount}</Badge></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white"><MoreHorizontal size={16} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-gray-800 border-gray-700">
                        <DropdownMenuItem onClick={() => setDetailTask(t)} className="text-gray-300 hover:text-white cursor-pointer gap-2"><Eye size={14} /> View</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(t)} className="text-gray-300 hover:text-white cursor-pointer gap-2"><Pencil size={14} /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(t.id)} className="text-gray-300 hover:text-white cursor-pointer gap-2"><Copy size={14} /> Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-gray-700" />
                        <DropdownMenuItem onClick={() => setDeleteId(t.id)} className="text-red-400 hover:text-red-300 cursor-pointer gap-2"><Trash2 size={14} /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="bg-gray-800 border border-gray-700 w-full">
              <TabsTrigger value="basic" className="flex-1 data-[state=active]:bg-gray-700">Basic</TabsTrigger>
              <TabsTrigger value="collection" className="flex-1 data-[state=active]:bg-gray-700">Collection</TabsTrigger>
              <TabsTrigger value="content" className="flex-1 data-[state=active]:bg-gray-700">Content</TabsTrigger>
              <TabsTrigger value="limits" className="flex-1 data-[state=active]:bg-gray-700">Limits</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label>Title <span className="text-red-400">*</span></Label>
                <Input value={form.title} onChange={e => setField("title", e.target.value)} placeholder="Capture Retail Product Front View" className="bg-gray-800 border-gray-700 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Category <span className="text-red-400">*</span></Label>
                  <Select value={form.categoryId} onValueChange={v => { setField("categoryId", v); setField("subcategoryId", ""); }}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Select category..." /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-gray-300">{c.icon} {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Subcategory</Label>
                  <Select value={form.subcategoryId} onValueChange={v => setField("subcategoryId", v === "none" ? "" : v)} disabled={!form.categoryId}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="none" className="text-gray-300">None</SelectItem>
                      {subcategories.map(s => <SelectItem key={s.id} value={s.id} className="text-gray-300">{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Payment Amount (₹)</Label>
                  <Input type="number" value={form.paymentAmount} onChange={e => setField("paymentAmount", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={0} step={0.01} />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <div className="flex h-10 items-center rounded-md border border-gray-700 bg-gray-800 px-3 text-sm text-white">
                    INR ₹
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setField("status", v)}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="draft" className="text-gray-300">Draft</SelectItem>
                      <SelectItem value="active" className="text-gray-300">Active</SelectItem>
                      <SelectItem value="inactive" className="text-gray-300">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Display Order</Label>
                <Input type="number" value={form.displayOrder} onChange={e => setField("displayOrder", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={0} />
              </div>
            </TabsContent>

            <TabsContent value="collection" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label>Collection Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["IMAGE", "VIDEO", "AUDIO"] as const).map(type => {
                    const Icon = COLLECTION_ICONS[type];
                    return (
                      <button key={type} type="button" onClick={() => setField("collectionType", type)}
                        className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${form.collectionType === type ? "border-cyan-500 bg-cyan-500/10 text-cyan-400" : "border-gray-700 text-gray-400 hover:border-gray-600"}`}>
                        <Icon size={16} />{type}
                      </button>
                    );
                  })}
                </div>
              </div>
              {isVideoOrAudio && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Min Duration (seconds)</Label>
                    <Input type="number" value={form.minimumDurationSeconds} onChange={e => setField("minimumDurationSeconds", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={0} placeholder="e.g. 30" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Duration (seconds)</Label>
                    <Input type="number" value={form.maximumDurationSeconds} onChange={e => setField("maximumDurationSeconds", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={0} placeholder="e.g. 60" />
                  </div>
                </div>
              )}
              {form.collectionType === "VIDEO" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Min FPS</Label>
                    <Input type="number" value={form.minimumFps} onChange={e => setField("minimumFps", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={0} placeholder="e.g. 24" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Preferred FPS</Label>
                    <Input type="number" value={form.preferredFps} onChange={e => setField("preferredFps", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={0} placeholder="e.g. 30" />
                  </div>
                </div>
              )}
              {isImage && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Min Image Count</Label>
                    <Input type="number" value={form.minimumImageCount} onChange={e => setField("minimumImageCount", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={1} placeholder="e.g. 1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Image Count</Label>
                    <Input type="number" value={form.maximumImageCount} onChange={e => setField("maximumImageCount", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={1} placeholder="e.g. 5" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Camera</Label>
                  <Select value={form.preferredCamera} onValueChange={v => setField("preferredCamera", v)}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="ANY" className="text-gray-300">Any</SelectItem>
                      <SelectItem value="REAR" className="text-gray-300">Rear</SelectItem>
                      <SelectItem value="FRONT" className="text-gray-300">Front (Selfie)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Lens</Label>
                  <Select value={form.preferredLens} onValueChange={v => setField("preferredLens", v)}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="ANY" className="text-gray-300">Any</SelectItem>
                      <SelectItem value="STANDARD" className="text-gray-300">Standard</SelectItem>
                      <SelectItem value="ULTRA_WIDE" className="text-gray-300">Ultra Wide</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Orientation</Label>
                  <Select value={form.requiredOrientation} onValueChange={v => setField("requiredOrientation", v)}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="ANY" className="text-gray-300">Any</SelectItem>
                      <SelectItem value="PORTRAIT" className="text-gray-300">Portrait</SelectItem>
                      <SelectItem value="LANDSCAPE" className="text-gray-300">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Sample Media URL</Label>
                <Input value={form.sampleMediaUrl} onChange={e => setField("sampleMediaUrl", e.target.value)} placeholder="https://example.com/sample.jpg" className="bg-gray-800 border-gray-700 text-white" />
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={form.audioRequired} onCheckedChange={v => setField("audioRequired", v)} />
                  <span className="text-sm text-gray-300">Audio Required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={form.pauseAllowed} onCheckedChange={v => setField("pauseAllowed", v)} />
                  <span className="text-sm text-gray-300">Pause Allowed</span>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="content" className="mt-4">
              <Tabs defaultValue="content-en">
                <TabsList className="bg-gray-700 border border-gray-600 w-full mb-4">
                  <TabsTrigger value="content-en" className="flex-1 data-[state=active]:bg-cyan-500 data-[state=active]:text-black text-xs">English</TabsTrigger>
                  <TabsTrigger value="content-hi" className="flex-1 data-[state=active]:bg-cyan-500 data-[state=active]:text-black text-xs">हिंदी</TabsTrigger>
                </TabsList>
                <TabsContent value="content-en" className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Title (English) <span className="text-red-400">*</span></Label>
                    <input value={form.title} onChange={e => setField("title", e.target.value)} placeholder="Capture Retail Product Front View" className="flex h-9 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-white shadow-sm transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Short Description (English)</Label>
                    <Textarea value={form.description} onChange={e => setField("description", e.target.value)} placeholder="Brief overview shown in task listings..." className="bg-gray-800 border-gray-700 text-white resize-none" rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Detailed Instructions (English)</Label>
                    <Textarea value={form.detailedInstructions} onChange={e => setField("detailedInstructions", e.target.value)} placeholder="Step-by-step instructions for field agents..." className="bg-gray-800 border-gray-700 text-white resize-none" rows={5} />
                  </div>
                  <ListEditor label="Dos ✓" items={form.dos} onChange={v => setField("dos", v)} />
                  <ListEditor label="Don'ts ✗" items={form.donts} onChange={v => setField("donts", v)} />
                </TabsContent>
                <TabsContent value="content-hi" className="space-y-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={translating || !form.title.trim()}
                    onClick={async () => {
                      const [titleHi, descriptionHi, detailedInstructionsHi, ...dosDontsHi] = await translateBatch([
                        form.title, form.description, form.detailedInstructions,
                        ...form.dos, ...form.donts,
                      ]);
                      const dosHi = dosDontsHi.slice(0, form.dos.length);
                      const dontsHi = dosDontsHi.slice(form.dos.length);
                      setField("titleHi", titleHi);
                      setField("descriptionHi", descriptionHi);
                      setField("detailedInstructionsHi", detailedInstructionsHi);
                      setField("dosHi", dosHi);
                      setField("dontsHi", dontsHi);
                    }}
                    className="gap-1.5 border-gray-700 text-gray-300 hover:text-white"
                  >
                    {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                    Translate from English
                  </Button>
                  <div className="space-y-1.5">
                    <Label>शीर्षक (हिंदी)</Label>
                    <input dir="auto" value={form.titleHi} onChange={e => setField("titleHi", e.target.value)} placeholder="रिटेल उत्पाद का फ्रंट व्यू कैप्चर करें" className="flex h-9 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-white shadow-sm transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>संक्षिप्त विवरण (हिंदी)</Label>
                    <Textarea dir="auto" value={form.descriptionHi} onChange={e => setField("descriptionHi", e.target.value)} placeholder="कार्य सूची में दिखाया गया संक्षिप्त विवरण..." className="bg-gray-800 border-gray-700 text-white resize-none" rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>विस्तृत निर्देश (हिंदी)</Label>
                    <Textarea dir="auto" value={form.detailedInstructionsHi} onChange={e => setField("detailedInstructionsHi", e.target.value)} placeholder="फील्ड एजेंटों के लिए चरण-दर-चरण निर्देश..." className="bg-gray-800 border-gray-700 text-white resize-none" rows={5} />
                  </div>
                  <ListEditor label="Dos ✓ (हिंदी)" items={form.dosHi} onChange={v => setField("dosHi", v)} />
                  <ListEditor label="Don'ts ✗ (हिंदी)" items={form.dontsHi} onChange={v => setField("dontsHi", v)} />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="limits" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Max Submissions per User</Label>
                  <Input type="number" value={form.maxSubmissionsPerUser} onChange={e => setField("maxSubmissionsPerUser", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={1} placeholder="Unlimited" />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Total Submissions</Label>
                  <Input type="number" value={form.maxTotalSubmissions} onChange={e => setField("maxTotalSubmissions", e.target.value)} className="bg-gray-800 border-gray-700 text-white" min={1} placeholder="Unlimited" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input type="datetime-local" value={form.startDate} onChange={e => setField("startDate", e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input type="datetime-local" value={form.endDate} onChange={e => setField("endDate", e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-gray-400">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-cyan-500 hover:bg-cyan-400 text-black">
              {isSaving ? "Saving..." : editingId ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={!!detailTask} onOpenChange={open => !open && setDetailTask(null)}>
        <SheetContent className="bg-gray-900 border-gray-800 text-white w-[500px] overflow-y-auto">
          {detailTask && (
            <>
              <SheetHeader className="pb-4">
                <div className="flex items-start justify-between gap-2">
                  <SheetTitle className="text-white text-lg leading-tight">{detailTask.title}</SheetTitle>
                  <div className="flex gap-2 shrink-0">
                    <Badge className={COLLECTION_TYPE_COLORS[detailTask.collectionType] ?? ""}>{detailTask.collectionType}</Badge>
                    <Badge className={STATUS_COLORS[detailTask.status] ?? ""}>{detailTask.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>{detailTask.category?.icon}</span>
                  <span>{detailTask.category?.name}</span>
                  {detailTask.subcategory && <><span className="text-gray-600">›</span><span>{detailTask.subcategory.name}</span></>}
                </div>
              </SheetHeader>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Payment</div>
                    <div className="text-xl font-bold text-cyan-400">{formatINR(Number(detailTask.paymentAmount))}</div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Submissions</div>
                    <div className="text-xl font-bold text-white">{detailTask.submissionCount}</div>
                  </div>
                </div>

                {detailTask.description && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Description</div>
                    <p className="text-sm text-gray-300">{detailTask.description}</p>
                  </div>
                )}

                {detailTask.detailedInstructions && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Detailed Instructions</div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{detailTask.detailedInstructions}</p>
                  </div>
                )}

                {detailTask.dos && detailTask.dos.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Dos ✓</div>
                    <ul className="space-y-1">
                      {detailTask.dos.map((d, i) => <li key={i} className="flex gap-2 text-sm text-green-300"><CheckCircle2 size={14} className="shrink-0 mt-0.5" />{d}</li>)}
                    </ul>
                  </div>
                )}

                {detailTask.donts && detailTask.donts.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Don'ts ✗</div>
                    <ul className="space-y-1">
                      {detailTask.donts.map((d, i) => <li key={i} className="flex gap-2 text-sm text-red-300"><XCircle size={14} className="shrink-0 mt-0.5" />{d}</li>)}
                    </ul>
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Requirements</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {detailTask.minimumDurationSeconds != null && <div className="text-gray-300">Min duration: <span className="text-white">{detailTask.minimumDurationSeconds}s</span></div>}
                    {detailTask.maximumDurationSeconds != null && <div className="text-gray-300">Max duration: <span className="text-white">{detailTask.maximumDurationSeconds}s</span></div>}
                    {detailTask.minimumImageCount != null && <div className="text-gray-300">Min images: <span className="text-white">{detailTask.minimumImageCount}</span></div>}
                    {detailTask.maximumImageCount != null && <div className="text-gray-300">Max images: <span className="text-white">{detailTask.maximumImageCount}</span></div>}
                    {detailTask.preferredCamera !== "ANY" && <div className="text-gray-300">Camera: <span className="text-white">{detailTask.preferredCamera}</span></div>}
                    {detailTask.preferredLens !== "ANY" && <div className="text-gray-300">Lens: <span className="text-white">{detailTask.preferredLens}</span></div>}
                    {detailTask.requiredOrientation !== "ANY" && <div className="text-gray-300">Orientation: <span className="text-white">{detailTask.requiredOrientation}</span></div>}
                    {detailTask.minimumFps != null && <div className="text-gray-300">Min FPS: <span className="text-white">{detailTask.minimumFps}</span></div>}
                    <div className="text-gray-300">Audio req'd: <span className="text-white">{detailTask.audioRequired ? "Yes" : "No"}</span></div>
                    <div className="text-gray-300">Pause allowed: <span className="text-white">{detailTask.pauseAllowed ? "Yes" : "No"}</span></div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button onClick={() => { setDetailTask(null); openEdit(detailTask); }} className="flex-1 bg-gray-700 hover:bg-gray-600"><Pencil size={14} className="mr-2" />Edit</Button>
                  <Button onClick={() => { setDetailTask(null); handleDuplicate(detailTask.id); }} className="flex-1 bg-gray-700 hover:bg-gray-600"><Copy size={14} className="mr-2" />Duplicate</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-gray-900 border-gray-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">This action cannot be undone.</AlertDialogDescription>
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
