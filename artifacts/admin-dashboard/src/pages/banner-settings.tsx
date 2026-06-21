import React, { useState, useEffect } from "react";
import {
  useGetAdminSettingsBanner,
  usePatchAdminSettingsBanner,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

export function BannerSettingsTab() {
  const { toast } = useToast();
  const { data, isLoading } = useGetAdminSettingsBanner();
  const updateMutation = usePatchAdminSettingsBanner();

  const [autoSlideSeconds, setAutoSlideSeconds] = useState<"5" | "7">("5");

  useEffect(() => {
    if ((data as any)?.autoSlideSeconds) {
      setAutoSlideSeconds(String((data as any).autoSlideSeconds) as "5" | "7");
    }
  }, [(data as any)?.autoSlideSeconds]);

  function handleSave() {
    updateMutation.mutate(
      { data: { autoSlideSeconds: Number(autoSlideSeconds) as 5 | 7 } },
      {
        onSuccess: () => toast({ title: "Banner settings saved" }),
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Banner Settings</CardTitle>
        <CardDescription>
          Configure how banners are displayed on the mobile home screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="autoSlide">Auto-slide Interval</Label>
          <Select
            value={autoSlideSeconds}
            onValueChange={(v) => setAutoSlideSeconds(v as "5" | "7")}
          >
            <SelectTrigger id="autoSlide" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 seconds</SelectItem>
              <SelectItem value="7">7 seconds</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            How long each banner displays before auto-advancing to the next.
          </p>
        </div>

        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
}
