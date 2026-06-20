import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetOtpSettings, useUpdateOtpSettings, getGetOtpSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Save } from "lucide-react";

const formSchema = z.object({
  otpLength: z.coerce.number().min(4).max(8),
  otpExpirySeconds: z.coerce.number().min(60).max(3600),
  maxAttempts: z.coerce.number().min(1).max(10),
  cooldownSeconds: z.coerce.number().min(30).max(3600),
  isTestMode: z.boolean(),
  testOtp: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function OtpSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetOtpSettings();
  const updateMutation = useUpdateOtpSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      otpLength: 6,
      otpExpirySeconds: 300,
      maxAttempts: 3,
      cooldownSeconds: 120,
      isTestMode: false,
      testOtp: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        otpLength: settings.otpLength,
        otpExpirySeconds: settings.otpExpirySeconds,
        maxAttempts: settings.maxAttempts,
        cooldownSeconds: settings.cooldownSeconds,
        isTestMode: settings.isTestMode,
        testOtp: settings.testOtp || "",
      });
    }
  }, [settings, form]);

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate(
      { data: values },
      {
        onSuccess: (updatedSettings) => {
          queryClient.setQueryData(getGetOtpSettingsQueryKey(), updatedSettings);
          toast({
            title: "Settings updated",
            description: "OTP settings have been saved successfully.",
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to update OTP settings.",
          });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card className="bg-card">
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">OTP Settings</h1>
        <p className="text-sm text-muted-foreground">Configure the security parameters for mobile user authentication.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Authentication Security</CardTitle>
              <CardDescription>
                These settings apply instantly to all new login attempts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="otpLength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>OTP Length</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="bg-background" />
                      </FormControl>
                      <FormDescription>Number of digits in the OTP code (4-8).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="otpExpirySeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiry Time (Seconds)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="bg-background" />
                      </FormControl>
                      <FormDescription>How long before an OTP becomes invalid.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxAttempts"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Attempts</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="bg-background" />
                      </FormControl>
                      <FormDescription>Failed verification attempts before lockout.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cooldownSeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cooldown (Seconds)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="bg-background" />
                      </FormControl>
                      <FormDescription>Lockout duration after max failed attempts.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border border-destructive/20 bg-destructive/5 rounded-md p-4 mt-6">
                <div className="flex items-center gap-2 text-destructive font-medium mb-4">
                  <ShieldAlert className="h-5 w-5" />
                  Testing & Development
                </div>
                
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="isTestMode"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border bg-background p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Enable Test Mode</FormLabel>
                          <FormDescription>
                            Allows bypass of real SMS delivery using a fixed code.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch("isTestMode") && (
                    <FormField
                      control={form.control}
                      name="testOtp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Static Test OTP</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. 123456" className="bg-background border-destructive/30 focus-visible:ring-destructive/30" />
                          </FormControl>
                          <FormDescription className="text-destructive/80">
                            WARNING: This code will work for ALL logins while test mode is active.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t border-border pt-6">
              <Button type="submit" disabled={updateMutation.isPending} className="font-medium">
                <Save className="mr-2 h-4 w-4" />
                Save Configuration
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
