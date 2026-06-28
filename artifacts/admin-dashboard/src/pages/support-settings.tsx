import React, { useEffect, useState } from "react";
import { useAdminGetSupportSettings, useAdminUpdateSupportSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Headphones } from "lucide-react";

interface SupportForm {
  email: string;
  whatsappNumber: string;
  phoneNumber: string;
  workingHours: string;
  messageEn: string;
  messageHi: string;
}

export default function SupportSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useAdminGetSupportSettings();
  const updateMutation = useAdminUpdateSupportSettings();

  const [form, setForm] = useState<SupportForm>({
    email: "", whatsappNumber: "", phoneNumber: "", workingHours: "", messageEn: "", messageHi: "",
  });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        email: (settings as any).email ?? "",
        whatsappNumber: (settings as any).whatsappNumber ?? "",
        phoneNumber: (settings as any).phoneNumber ?? "",
        workingHours: (settings as any).workingHours ?? "",
        messageEn: (settings as any).supportMessageEn ?? (settings as any).message ?? "",
        messageHi: (settings as any).supportMessageHi ?? "",
      });
      setIsDirty(false);
    }
  }, [settings]);

  function update(key: keyof SupportForm, value: string) {
    setForm(f => ({ ...f, [key]: value }));
    setIsDirty(true);
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(
      {
        data: {
          email: form.email,
          whatsappNumber: form.whatsappNumber,
          phoneNumber: form.phoneNumber || undefined,
          workingHours: form.workingHours || undefined,
          message: form.messageEn || undefined,
          supportMessageEn: form.messageEn || undefined,
          supportMessageHi: form.messageHi || undefined,
        } as any,
      },
      {
        onSuccess: () => { toast({ title: "Saved", description: "Support settings updated." }); setIsDirty(false); },
        onError: () => toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Headphones className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support Settings</h1>
          <p className="text-muted-foreground text-sm">Configure the support contact details shown to mobile users.</p>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
            <CardDescription>These details will be displayed on the mobile support page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="email">Support Email <span className="text-destructive">*</span></Label>
                <Input id="email" type="email" placeholder="support@capto.app" value={form.email} onChange={e => update("email", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsappNumber">WhatsApp Number <span className="text-destructive">*</span></Label>
                <Input id="whatsappNumber" placeholder="+91 98765 43210" value={form.whatsappNumber} onChange={e => update("whatsappNumber", e.target.value)} required />
                <p className="text-xs text-muted-foreground">Include country code (e.g. +91…)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input id="phoneNumber" placeholder="+91 98765 43210" value={form.phoneNumber} onChange={e => update("phoneNumber", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workingHours">Working Hours <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input id="workingHours" placeholder="Mon–Sat, 9 AM – 6 PM IST" value={form.workingHours} onChange={e => update("workingHours", e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Support Message <span className="text-muted-foreground text-xs">(optional — shown at top of support page)</span></Label>
              <Tabs defaultValue="en">
                <TabsList>
                  <TabsTrigger value="en">English</TabsTrigger>
                  <TabsTrigger value="hi">हिंदी</TabsTrigger>
                </TabsList>
                <TabsContent value="en" className="mt-3">
                  <Textarea
                    rows={3}
                    placeholder="For urgent queries, reach us on WhatsApp…"
                    value={form.messageEn}
                    onChange={e => update("messageEn", e.target.value)}
                  />
                </TabsContent>
                <TabsContent value="hi" className="mt-3">
                  <Textarea
                    dir="auto"
                    rows={3}
                    placeholder="तत्काल प्रश्नों के लिए, व्हाट्सएप पर हमसे संपर्क करें…"
                    value={form.messageHi}
                    onChange={e => update("messageHi", e.target.value)}
                  />
                </TabsContent>
              </Tabs>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={updateMutation.isPending || !isDirty} className="min-w-[120px]">
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
