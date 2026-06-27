import React, { useState } from "react";
import {
  useListStorageProfiles,
  useCreateStorageProfile,
  useUpdateStorageProfile,
  useDeleteStorageProfile,
  useTestStorageProfile,
  useActivateStorageProfile,
  useDeactivateStorageProfile,
} from "@workspace/api-client-react";
import type {
  StorageProfile,
  CreateStorageProfileBody,
  UpdateStorageProfileBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
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
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  FlaskConical,
  CheckCircle,
  XCircle,
  Power,
  PowerOff,
  Database,
} from "lucide-react";
import { getListStorageProfilesQueryKey } from "@workspace/api-client-react";

const PROVIDER_LABELS: Record<string, string> = {
  REPLIT: "Replit Object Storage",
  AWS_S3: "AWS S3",
  CLOUDFLARE_R2: "Cloudflare R2",
  DO_SPACES: "DigitalOcean Spaces",
};

type ProviderType = "REPLIT" | "AWS_S3" | "CLOUDFLARE_R2" | "DO_SPACES";

const S3_PROVIDERS: ProviderType[] = ["AWS_S3", "CLOUDFLARE_R2", "DO_SPACES"];

function providerBadge(type: string) {
  const colors: Record<string, string> = {
    REPLIT: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    AWS_S3: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    CLOUDFLARE_R2: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    DO_SPACES: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return colors[type] ?? "bg-zinc-700 text-zinc-300";
}

function testBadge(result: string | null | undefined) {
  if (!result) return null;
  if (result === "ok")
    return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">✓ Connected</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">✗ Failed</Badge>;
}

// ─── Profile Form ─────────────────────────────────────────────────────────────

interface ProfileFormState {
  name: string;
  providerType: ProviderType;
  keyPrefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint: string;
  accountId: string;
}

const defaultForm = (): ProfileFormState => ({
  name: "",
  providerType: "REPLIT",
  keyPrefix: "",
  accessKeyId: "",
  secretAccessKey: "",
  region: "",
  bucket: "",
  endpoint: "",
  accountId: "",
});

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  existing?: StorageProfile | null;
}

function ProfileDialog({ open, onClose, existing }: ProfileDialogProps) {
  const isEdit = !!existing;
  const [form, setForm] = useState<ProfileFormState>(defaultForm);
  const [showSecret, setShowSecret] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  React.useEffect(() => {
    if (open) {
      setForm(
        existing
          ? {
              name: existing.name,
              providerType: existing.providerType as ProviderType,
              keyPrefix: existing.keyPrefix ?? "",
              accessKeyId: "",
              secretAccessKey: "",
              region: "",
              bucket: "",
              endpoint: "",
              accountId: "",
            }
          : defaultForm(),
      );
      setShowSecret(false);
    }
  }, [open, existing]);

  const createMutation = useCreateStorageProfile({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListStorageProfilesQueryKey() });
        toast({ title: "Profile created" });
        onClose();
      },
      onError: (e: unknown) => {
        toast({ title: "Failed to create profile", description: (e as Error).message, variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateStorageProfile({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListStorageProfilesQueryKey() });
        toast({ title: "Profile updated" });
        onClose();
      },
      onError: (e: unknown) => {
        toast({ title: "Failed to update profile", description: (e as Error).message, variant: "destructive" });
      },
    },
  });

  const isS3 = S3_PROVIDERS.includes(form.providerType);
  const needsEndpoint = form.providerType === "CLOUDFLARE_R2" || form.providerType === "DO_SPACES";
  const needsAccountId = form.providerType === "CLOUDFLARE_R2";
  const saving = createMutation.isPending || updateMutation.isPending;

  function set(k: keyof ProfileFormState, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (isEdit && existing) {
      const body: UpdateStorageProfileBody = {
        name: form.name,
        keyPrefix: form.keyPrefix || undefined,
        accessKeyId: form.accessKeyId || undefined,
        secretAccessKey: form.secretAccessKey || undefined,
        region: form.region || undefined,
        bucket: form.bucket || undefined,
        endpoint: form.endpoint || undefined,
        accountId: form.accountId || undefined,
      };
      updateMutation.mutate({ id: existing.id, data: body });
    } else {
      const body: CreateStorageProfileBody = {
        name: form.name,
        providerType: form.providerType as CreateStorageProfileBody["providerType"],
        keyPrefix: form.keyPrefix || undefined,
        accessKeyId: form.accessKeyId || undefined,
        secretAccessKey: form.secretAccessKey || undefined,
        region: form.region || undefined,
        bucket: form.bucket || undefined,
        endpoint: form.endpoint || undefined,
        accountId: form.accountId || undefined,
      };
      createMutation.mutate({ data: body });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-zinc-900 border-zinc-700 text-zinc-100">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Storage Profile" : "New Storage Profile"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="My S3 Bucket"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          {!isEdit && (
            <div className="space-y-1">
              <Label>Provider</Label>
              <Select value={form.providerType} onValueChange={(v) => set("providerType", v as ProviderType)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {(Object.entries(PROVIDER_LABELS) as [ProviderType, string][]).map(([v, label]) => (
                    <SelectItem key={v} value={v} className="text-zinc-100 focus:bg-zinc-700">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Key Prefix <span className="text-zinc-500 text-xs">(optional)</span></Label>
            <Input
              value={form.keyPrefix}
              onChange={(e) => set("keyPrefix", e.target.value)}
              placeholder="uploads/"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          {isS3 && (
            <>
              <div className="border-t border-zinc-700 pt-3">
                <p className="text-xs text-zinc-400 mb-3">Credentials are encrypted with AES-256-GCM at rest.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Access Key ID</Label>
                  <Input
                    value={form.accessKeyId}
                    onChange={(e) => set("accessKeyId", e.target.value)}
                    placeholder={isEdit ? "Leave blank to keep" : "AKIAIOSFODNN7EXAMPLE"}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Secret Access Key</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={form.secretAccessKey}
                      onChange={(e) => set("secretAccessKey", e.target.value)}
                      placeholder={isEdit ? "Leave blank to keep" : "••••••••"}
                      className="bg-zinc-800 border-zinc-700 pr-16"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 text-xs hover:text-zinc-200"
                    >
                      {showSecret ? "hide" : "show"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Region</Label>
                  <Input
                    value={form.region}
                    onChange={(e) => set("region", e.target.value)}
                    placeholder="us-east-1"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Bucket</Label>
                  <Input
                    value={form.bucket}
                    onChange={(e) => set("bucket", e.target.value)}
                    placeholder="my-bucket"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
              {needsEndpoint && (
                <div className="space-y-1">
                  <Label>Endpoint URL</Label>
                  <Input
                    value={form.endpoint}
                    onChange={(e) => set("endpoint", e.target.value)}
                    placeholder="https://xxx.r2.cloudflarestorage.com"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              )}
              {needsAccountId && (
                <div className="space-y-1">
                  <Label>Account ID <span className="text-zinc-500 text-xs">(Cloudflare)</span></Label>
                  <Input
                    value={form.accountId}
                    onChange={(e) => set("accountId", e.target.value)}
                    placeholder="abc123def456"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" className="text-zinc-400">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving} className="bg-cyan-600 hover:bg-cyan-500">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Profile Row ─────────────────────────────────────────────────────────────

interface ProfileRowProps {
  profile: StorageProfile;
  onEdit: (p: StorageProfile) => void;
  onDeleteRequest: (p: StorageProfile) => void;
}

function ProfileRow({ profile, onEdit, onDeleteRequest }: ProfileRowProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: getListStorageProfilesQueryKey() });

  const testMutation = useTestStorageProfile({
    mutation: {
      onSuccess: (data) => {
        invalidate();
        if (data.ok) {
          toast({ title: `Connected in ${data.durationMs}ms`, description: data.message });
        } else {
          toast({ title: "Connection failed", description: data.message, variant: "destructive" });
        }
      },
      onError: (e: unknown) => toast({ title: "Test failed", description: (e as Error).message, variant: "destructive" }),
    },
  });

  const activateMutation = useActivateStorageProfile({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Profile activated" }); },
      onError: (e: unknown) => toast({ title: "Activation failed", description: (e as Error).message, variant: "destructive" }),
    },
  });

  const deactivateMutation = useDeactivateStorageProfile({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Profile deactivated" }); },
      onError: (e: unknown) => toast({ title: "Deactivation failed", description: (e as Error).message, variant: "destructive" }),
    },
  });

  const busy =
    testMutation.isPending || activateMutation.isPending || deactivateMutation.isPending;

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors">
      <Database className="h-5 w-5 text-zinc-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-zinc-100 truncate">{profile.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded border font-mono ${providerBadge(profile.providerType)}`}>
            {profile.providerType}
          </span>
          {profile.isActive && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Active</Badge>
          )}
          {testBadge(profile.lastTestResult)}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5 flex gap-3">
          {profile.keyPrefix && <span>Prefix: <code className="text-zinc-400">{profile.keyPrefix}</code></span>}
          <span>{profile.mediaCount.toLocaleString()} media files</span>
          {profile.lastTestedAt && (
            <span>Tested {new Date(profile.lastTestedAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-zinc-400 hover:text-cyan-400"
          title="Test connection"
          disabled={busy}
          onClick={() => testMutation.mutate({ id: profile.id })}
        >
          {testMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
        </Button>
        {profile.isActive ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-zinc-400 hover:text-yellow-400"
            title="Deactivate"
            disabled={busy}
            onClick={() => deactivateMutation.mutate({ id: profile.id })}
          >
            {deactivateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PowerOff className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-zinc-400 hover:text-emerald-400"
            title="Activate"
            disabled={busy || profile.lastTestResult !== "ok"}
          >
            {activateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <button
                onClick={() => activateMutation.mutate({ id: profile.id })}
                className="flex items-center"
                disabled={profile.lastTestResult !== "ok"}
                title={profile.lastTestResult !== "ok" ? "Run a successful test first" : "Activate"}
              >
                <Power className="h-3.5 w-3.5" />
              </button>
            )}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100"
          title="Edit"
          onClick={() => onEdit(profile)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400"
          title="Delete"
          disabled={profile.isActive}
          onClick={() => onDeleteRequest(profile)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function StorageSettingsTab() {
  const { data: profiles, isLoading } = useListStorageProfiles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<StorageProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageProfile | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const deleteMutation = useDeleteStorageProfile({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListStorageProfilesQueryKey() });
        toast({ title: "Profile deleted" });
        setDeleteTarget(null);
      },
      onError: (e: unknown) => {
        toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
      },
    },
  });

  function openCreate() {
    setEditingProfile(null);
    setDialogOpen(true);
  }

  function openEdit(p: StorageProfile) {
    setEditingProfile(p);
    setDialogOpen(true);
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-zinc-100">Storage Profiles</CardTitle>
            <CardDescription className="text-zinc-400 mt-1">
              Configure where media uploads are stored. Only one profile can be active at a time.
              Credentials are encrypted with AES-256-GCM.
            </CardDescription>
          </div>
          <Button
            onClick={openCreate}
            className="bg-cyan-600 hover:bg-cyan-500 shrink-0"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Profile
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading profiles…
          </div>
        )}
        {!isLoading && (!profiles || profiles.length === 0) && (
          <div className="text-center py-8 text-zinc-500">
            No storage profiles configured.
          </div>
        )}
        {profiles?.map((p) => (
          <ProfileRow
            key={p.id}
            profile={p}
            onEdit={openEdit}
            onDeleteRequest={setDeleteTarget}
          />
        ))}

        <div className="pt-2 border-t border-zinc-800">
          <div className="flex items-start gap-3 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5 mt-0.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Test a profile before activating</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              <span>Active profiles cannot be deleted</span>
            </div>
          </div>
        </div>
      </CardContent>

      <ProfileDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        existing={editingProfile}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete storage profile?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete <strong className="text-zinc-200">{deleteTarget?.name}</strong>.
              Media files already uploaded will remain intact, but future uploads won't use this profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
