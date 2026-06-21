import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminGetReferralSettings,
  useAdminUpdateReferralSettings,
} from "@workspace/api-client-react";
import { Loader2, Save } from "lucide-react";

export function ReferralSettingsTab() {
  const { toast } = useToast();
  const { data, isLoading } = useAdminGetReferralSettings();
  const updateMutation = useAdminUpdateReferralSettings();

  const [isEnabled, setIsEnabled] = useState(true);
  const [rewardAmount, setRewardAmount] = useState("50");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (data) {
      setIsEnabled(data.isEnabled);
      setRewardAmount(String(data.rewardAmount));
      setMessage(data.message ?? "");
    }
  }, [data]);

  const handleSave = () => {
    const amount = parseFloat(rewardAmount);
    if (isNaN(amount) || amount < 0) {
      toast({ title: "Invalid reward amount", variant: "destructive" });
      return;
    }
    updateMutation.mutate(
      { data: { isEnabled, rewardAmount: amount, message: message || undefined } },
      {
        onSuccess: () => toast({ title: "Referral settings saved" }),
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Referral Program</CardTitle>
        <CardDescription>
          Configure the referral program. The referrer earns the reward when their invited user
          gets their first submission approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable Referral Program</Label>
            <p className="text-xs text-muted-foreground">Turn off to stop rewarding new referrals</p>
          </div>
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rewardAmount">Reward Amount (₹)</Label>
          <Input
            id="rewardAmount"
            type="number"
            min="0"
            step="1"
            value={rewardAmount}
            onChange={(e) => setRewardAmount(e.target.value)}
            placeholder="50"
          />
          <p className="text-xs text-muted-foreground">
            Credits added to the referrer's wallet per successful referral
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="referralMessage">Program Message (optional)</Label>
          <Textarea
            id="referralMessage"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Invite friends and earn ₹50 for each who completes their first task!"
          />
          <p className="text-xs text-muted-foreground">
            Shown to users on the Refer &amp; Earn screen
          </p>
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
