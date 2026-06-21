import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminGetSettings,
  useAdminUpdateGeneralSettings,
  useAdminUpdateSettingsSupport,
  useAdminUpdateLegalContent,
  usePatchAdminSettingsPayout,
} from "@workspace/api-client-react";
import { Loader2, Eye, Save, Globe, Headphones, FileText, Banknote } from "lucide-react";

// ─── General Tab ─────────────────────────────────────────────────────────────

function GeneralTab() {
  const { data, isLoading } = useAdminGetSettings();
  const updateMutation = useAdminUpdateGeneralSettings();
  const { toast } = useToast();
  const [appName, setAppName] = useState("");

  useEffect(() => {
    if (data?.general?.appName) setAppName(data.general.appName);
  }, [data?.general?.appName]);

  const handleSave = () => {
    updateMutation.mutate(
      { data: { appName } },
      {
        onSuccess: () => toast({ title: "General settings saved" }),
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">General</CardTitle>
        <CardDescription>Basic app-wide settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="appName">App Name</Label>
          <Input
            id="appName"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="Capto"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="gap-2"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Support Tab ─────────────────────────────────────────────────────────────

function SupportTab() {
  const { data, isLoading } = useAdminGetSettings();
  const updateMutation = useAdminUpdateSettingsSupport();
  const { toast } = useToast();

  const [form, setForm] = useState({
    email: "",
    whatsappNumber: "",
    phoneNumber: "",
    workingHours: "",
    message: "",
  });

  useEffect(() => {
    if (data?.support) {
      setForm({
        email: data.support.email ?? "",
        whatsappNumber: data.support.whatsappNumber ?? "",
        phoneNumber: data.support.phoneNumber ?? "",
        workingHours: data.support.workingHours ?? "",
        message: data.support.message ?? "",
      });
    }
  }, [data?.support]);

  const handleSave = () => {
    updateMutation.mutate(
      {
        data: {
          email: form.email,
          whatsappNumber: form.whatsappNumber,
          phoneNumber: form.phoneNumber || undefined,
          workingHours: form.workingHours || undefined,
          message: form.message || undefined,
        },
      },
      {
        onSuccess: () => toast({ title: "Support settings saved" }),
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Support Settings</CardTitle>
        <CardDescription>
          Contact details shown to mobile users on the Support screen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <Field label="Support Email *" id="email">
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="support@example.com"
          />
        </Field>
        <Field label="WhatsApp Number" id="whatsapp">
          <Input
            id="whatsapp"
            value={form.whatsappNumber}
            onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
            placeholder="+91 98765 43210"
          />
        </Field>
        <Field label="Phone Number" id="phone">
          <Input
            id="phone"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            placeholder="+91 98765 43210"
          />
        </Field>
        <Field label="Working Hours" id="hours">
          <Input
            id="hours"
            value={form.workingHours}
            onChange={(e) => setForm({ ...form, workingHours: e.target.value })}
            placeholder="Mon–Fri, 10am–6pm IST"
          />
        </Field>
        <Field label="Support Message" id="message">
          <Textarea
            id="message"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Our team is here to help…"
            rows={3}
          />
        </Field>
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Legal Tab ────────────────────────────────────────────────────────────────

type LegalSlug = "privacy-policy" | "terms-and-conditions";

interface LegalDoc {
  title: string;
  content: string;
  isPublished: boolean;
  version: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

function LegalDocEditor({
  slug,
  label,
  initial,
}: {
  slug: LegalSlug;
  label: string;
  initial: LegalDoc;
}) {
  const updateMutation = useAdminUpdateLegalContent();
  const { toast } = useToast();
  const [form, setForm] = useState(initial);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setForm(initial);
  }, [initial.version, initial.updatedAt]);

  const handleSave = () => {
    updateMutation.mutate(
      {
        slug,
        data: {
          title: form.title,
          content: form.content,
          isPublished: form.isPublished,
        },
      },
      {
        onSuccess: (result) => {
          toast({ title: `${label} saved` });
          if (result) {
            setForm((f) => ({
              ...f,
              version: result.version ?? f.version,
              updatedAt: result.updatedAt ?? f.updatedAt,
              updatedBy: result.updatedBy ?? f.updatedBy,
            }));
          }
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{label}</CardTitle>
            {form.updatedAt && (
              <CardDescription className="mt-0.5">
                v{form.version} · Last updated{" "}
                {new Date(form.updatedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {form.updatedBy ? ` by ${form.updatedBy}` : ""}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={form.isPublished ? "default" : "secondary"}>
              {form.isPublished ? "Published" : "Draft"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Title" id={`${slug}-title`}>
          <Input
            id={`${slug}-title`}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label="Content" id={`${slug}-content`}>
          <Textarea
            id={`${slug}-content`}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={14}
            className="font-mono text-sm resize-y"
            placeholder="Write your content here. Plain text or Markdown."
          />
        </Field>
        <div className="flex items-center gap-3 pt-1">
          <Switch
            id={`${slug}-published`}
            checked={form.isPublished}
            onCheckedChange={(v) => setForm({ ...form, isPublished: v })}
          />
          <Label htmlFor={`${slug}-published`} className="cursor-pointer">
            Publish to mobile app
          </Label>
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        </div>
      </CardContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.title || label} — Preview</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground mt-2">
            {form.content || "No content yet."}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function LegalTab() {
  const { data, isLoading } = useAdminGetSettings();

  if (isLoading) return <LoadingSpinner />;

  const pp = data?.legal?.privacyPolicy ?? {
    title: "Privacy Policy",
    content: "",
    isPublished: false,
    version: 1,
    updatedAt: null,
    updatedBy: null,
  };

  const tc = data?.legal?.termsAndConditions ?? {
    title: "Terms & Conditions",
    content: "",
    isPublished: false,
    version: 1,
    updatedAt: null,
    updatedBy: null,
  };

  return (
    <div className="space-y-6">
      <LegalDocEditor slug="privacy-policy" label="Privacy Policy" initial={pp} />
      <LegalDocEditor slug="terms-and-conditions" label="Terms & Conditions" initial={tc} />
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── Payout Settings Tab ──────────────────────────────────────────────────────

function PayoutSettingsTab() {
  const { data, isLoading } = useAdminGetSettings();
  const updateMutation = usePatchAdminSettingsPayout();
  const { toast } = useToast();

  const payoutData = (data as unknown as { payout?: { payoutsEnabled?: boolean; minWithdrawalAmount?: number; maxWithdrawalAmount?: number | null; payoutMessage?: string | null; maxDailyPayoutsPerUser?: number | null; maxPendingPayoutsPerUser?: number | null } })?.payout;

  const [payoutsEnabled, setPayoutsEnabled] = React.useState(true);
  const [minAmount, setMinAmount] = React.useState("100");
  const [maxAmount, setMaxAmount] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [maxDaily, setMaxDaily] = React.useState("");
  const [maxPending, setMaxPending] = React.useState("");

  React.useEffect(() => {
    if (payoutData) {
      setPayoutsEnabled(payoutData.payoutsEnabled !== false);
      setMinAmount(String(payoutData.minWithdrawalAmount ?? 100));
      setMaxAmount(payoutData.maxWithdrawalAmount != null ? String(payoutData.maxWithdrawalAmount) : "");
      setMessage(payoutData.payoutMessage ?? "");
      setMaxDaily(payoutData.maxDailyPayoutsPerUser != null ? String(payoutData.maxDailyPayoutsPerUser) : "");
      setMaxPending(payoutData.maxPendingPayoutsPerUser != null ? String(payoutData.maxPendingPayoutsPerUser) : "");
    }
  }, [payoutData]);

  function handleSave() {
    const minVal = parseFloat(minAmount);
    if (isNaN(minVal) || minVal <= 0) {
      toast({ title: "Invalid minimum amount", variant: "destructive" });
      return;
    }
    updateMutation.mutate(
      {
        data: {
          payoutsEnabled,
          minWithdrawalAmount: minVal,
          maxWithdrawalAmount: maxAmount ? parseFloat(maxAmount) : null,
          payoutMessage: message.trim() || null,
          maxDailyPayoutsPerUser: maxDaily ? parseInt(maxDaily, 10) : null,
          maxPendingPayoutsPerUser: maxPending ? parseInt(maxPending, 10) : null,
        },
      },
      {
        onSuccess: () => toast({ title: "Payout settings saved" }),
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      },
    );
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payout Settings</CardTitle>
        <CardDescription>Configure withdrawal limits and UPI payout behaviour</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-lg">
        {/* Enable toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">Enable withdrawals</p>
            <p className="text-xs text-muted-foreground mt-0.5">Allow field agents to submit payout requests</p>
          </div>
          <Switch checked={payoutsEnabled} onCheckedChange={setPayoutsEnabled} />
        </div>

        {/* Min / Max amounts */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="minAmount">Minimum withdrawal (₹)</Label>
            <Input
              id="minAmount"
              type="number"
              min={1}
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxAmount">Maximum withdrawal (₹)</Label>
            <Input
              id="maxAmount"
              type="number"
              min={1}
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="No limit"
              className="bg-background"
            />
          </div>
        </div>

        {/* Daily / pending caps */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="maxDaily">Max requests per day per user</Label>
            <Input
              id="maxDaily"
              type="number"
              min={1}
              value={maxDaily}
              onChange={(e) => setMaxDaily(e.target.value)}
              placeholder="No limit"
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxPending">Max concurrent pending per user</Label>
            <Input
              id="maxPending"
              type="number"
              min={1}
              value={maxPending}
              onChange={(e) => setMaxPending(e.target.value)}
              placeholder="No limit"
              className="bg-background"
            />
          </div>
        </div>

        {/* Payout message */}
        <div className="space-y-1.5">
          <Label htmlFor="payoutMsg">Payout notice message (shown to users)</Label>
          <Textarea
            id="payoutMsg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Payouts are processed within 2–3 business days"
            className="bg-background resize-none"
            rows={3}
          />
        </div>

        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage general, support, and legal settings for the app
        </p>
      </div>
      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general" className="gap-2">
            <Globe className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-2">
            <Headphones className="h-3.5 w-3.5" />
            Support
          </TabsTrigger>
          <TabsTrigger value="legal" className="gap-2">
            <FileText className="h-3.5 w-3.5" />
            Legal
          </TabsTrigger>
          <TabsTrigger value="payout" className="gap-2">
            <Banknote className="h-3.5 w-3.5" />
            Payouts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="support">
          <SupportTab />
        </TabsContent>
        <TabsContent value="legal">
          <LegalTab />
        </TabsContent>
        <TabsContent value="payout">
          <PayoutSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
