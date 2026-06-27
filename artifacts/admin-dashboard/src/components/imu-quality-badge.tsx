import { Badge } from "@/components/ui/badge";
import { getImuBadgeConfig } from "@/lib/imu-quality-badge";

interface ImuQualityBadgeProps {
  status: string | undefined | null;
}

export function ImuQualityBadge({ status }: ImuQualityBadgeProps) {
  const cfg = getImuBadgeConfig(status);
  if (!cfg) return null;
  return (
    <Badge className={cfg.className} title={cfg.title}>
      {cfg.label}
    </Badge>
  );
}
