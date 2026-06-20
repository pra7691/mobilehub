import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useAdminGetSupportSettings, useAdminUpdateSupportSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Headphones } from "lucide-react";

interface SupportForm {
  email: string;
  whatsappNumber: string;
  phoneNumber: string;
  workingHours: string;
  message: string;
}

export default function SupportSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useAdminGetSupportSettings();
  const updateMutation = useAdminUpdateSupportSettings();

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<SupportForm>({
    defaultValues: { email: "", whatsappNumber: "", phoneNumber: "", workingHours: "", message: "" },
  });

  useEffect(() => {
    if (settings) {
      reset({
        email: settings.email ?? "",
        whatsappNumber: settings.whatsappNumber ?? "",
        phoneNumber: settings.phoneNumber ?? "",
        workingHours: settings.workingHours ?? "",
        message: settings.message ?? "",
      });
    }
  }, [settings, reset]);

  const onSubmit = (data: SupportForm) => {
    updateMutation.mutate(
      { data: { email: data.email, whatsappNumber: data.whatsappNumber, phoneNumber: data.phoneNumber || undefined, workingHours: data.workingHours || undefined, message: data.message || undefined } },
      {
        onSuccess: () => toast({ title: "Saved", description: "Support settings updated." }),
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

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
            <CardDescription>These details will be displayed on the mobile support page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="email">Support Email <span className="text-destructive">*</span></Label>
                <Input id="email" type="email" placeholder="support@capto.app" {...register("email", { required: true })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsappNumber">WhatsApp Number <span className="text-destructive">*</span></Label>
                <Input id="whatsappNumber" placeholder="+91 98765 43210" {...register("whatsappNumber", { required: true })} />
                <p className="text-xs text-muted-foreground">Include country code (e.g. +91…)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input id="phoneNumber" placeholder="+91 98765 43210" {...register("phoneNumber")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workingHours">Working Hours <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input id="workingHours" placeholder="Mon–Sat, 9 AM – 6 PM IST" {...register("workingHours")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Support Message <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="message"
                rows={3}
                placeholder="For urgent queries, reach us on WhatsApp…"
                {...register("message")}
              />
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
