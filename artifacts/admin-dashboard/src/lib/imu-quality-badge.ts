export type ImuBadgeTier = "valid" | "legacy" | "warning" | "error" | "neutral";

export interface ImuBadgeConfig {
  tier: ImuBadgeTier;
  label: string;
  title: string;
  className: string;
}

const TIER_CLASS: Record<ImuBadgeTier, string> = {
  valid:   "bg-emerald-500/15 text-emerald-500 border-none",
  legacy:  "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-none",
  error:   "bg-red-500/15 text-red-500 border-none",
  neutral: "bg-slate-500/15 text-slate-400 border-none",
};

function humanize(raw: string): string {
  return raw
    .replace(/^(warning_|error_)/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getImuBadgeConfig(status: string | undefined | null): ImuBadgeConfig | null {
  if (!status) return null;

  if (status === "ok") {
    return { tier: "valid", label: "Valid", title: "IMU data embedded and verified", className: TIER_CLASS.valid };
  }

  if (status === "valid") {
    return {
      tier: "legacy",
      label: "Valid (legacy)",
      title: 'Submitted before the "valid"→"ok" rename — treated as verified',
      className: TIER_CLASS.legacy,
    };
  }

  if (status === "skipped") {
    return { tier: "neutral", label: "Skipped", title: "IMU capture was skipped for this submission", className: TIER_CLASS.neutral };
  }

  if (status === "none") {
    return { tier: "neutral", label: "None", title: "No IMU data was recorded", className: TIER_CLASS.neutral };
  }

  if (status === "native_module_unavailable") {
    return { tier: "neutral", label: "Unavailable", title: "Native IMU module was not available on this device", className: TIER_CLASS.neutral };
  }

  if (status.startsWith("warning_")) {
    return {
      tier: "warning",
      label: `Warning: ${humanize(status)}`,
      title: `IMU warning — ${status}`,
      className: TIER_CLASS.warning,
    };
  }

  if (status.startsWith("error_")) {
    return {
      tier: "error",
      label: `Error: ${humanize(status)}`,
      title: `IMU error — ${status}`,
      className: TIER_CLASS.error,
    };
  }

  return {
    tier: "neutral",
    label: status,
    title: `IMU status: ${status}`,
    className: TIER_CLASS.neutral,
  };
}
