import assert from "node:assert/strict";
import { getImuBadgeConfig } from "./imu-quality-badge.js";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("ImuQualityBadge status mapping");

test('"ok" → valid tier, green', () => {
  const cfg = getImuBadgeConfig("ok");
  assert.ok(cfg, "should return a config");
  assert.equal(cfg.tier, "valid");
  assert.equal(cfg.label, "Valid");
  assert.match(cfg.className, /emerald/);
});

test('"valid" (legacy) → legacy tier, greenish', () => {
  const cfg = getImuBadgeConfig("valid");
  assert.ok(cfg, "should return a config");
  assert.equal(cfg.tier, "legacy");
  assert.match(cfg.label, /legacy/i);
  assert.match(cfg.className, /emerald/);
});

test('"warning_no_sensor_data" → warning tier, amber', () => {
  const cfg = getImuBadgeConfig("warning_no_sensor_data");
  assert.ok(cfg, "should return a config");
  assert.equal(cfg.tier, "warning");
  assert.match(cfg.className, /amber/);
  assert.match(cfg.label, /Warning/);
});

test('"warning_*" generic → warning tier', () => {
  const cfg = getImuBadgeConfig("warning_some_new_value");
  assert.ok(cfg);
  assert.equal(cfg.tier, "warning");
});

test('"error_11" (iOS) → error tier, red', () => {
  const cfg = getImuBadgeConfig("error_11");
  assert.ok(cfg, "should return a config");
  assert.equal(cfg.tier, "error");
  assert.match(cfg.className, /red/);
  assert.match(cfg.label, /Error/);
});

test('"error_no_gpmd_track" (Android) → error tier', () => {
  const cfg = getImuBadgeConfig("error_no_gpmd_track");
  assert.ok(cfg);
  assert.equal(cfg.tier, "error");
  assert.match(cfg.label, /Error/);
});

test('"error_empty_gpmd_sample" (Android) → error tier', () => {
  const cfg = getImuBadgeConfig("error_empty_gpmd_sample");
  assert.ok(cfg);
  assert.equal(cfg.tier, "error");
});

test('"error_*" generic → error tier', () => {
  const cfg = getImuBadgeConfig("error_some_new_failure");
  assert.ok(cfg);
  assert.equal(cfg.tier, "error");
});

test('"skipped" → neutral tier', () => {
  const cfg = getImuBadgeConfig("skipped");
  assert.ok(cfg, "should return a config");
  assert.equal(cfg.tier, "neutral");
  assert.equal(cfg.label, "Skipped");
});

test('"none" → neutral tier', () => {
  const cfg = getImuBadgeConfig("none");
  assert.ok(cfg, "should return a config");
  assert.equal(cfg.tier, "neutral");
  assert.equal(cfg.label, "None");
});

test('"native_module_unavailable" → neutral tier', () => {
  const cfg = getImuBadgeConfig("native_module_unavailable");
  assert.ok(cfg);
  assert.equal(cfg.tier, "neutral");
  assert.equal(cfg.label, "Unavailable");
});

test("null/undefined → null (no badge rendered)", () => {
  assert.equal(getImuBadgeConfig(null), null);
  assert.equal(getImuBadgeConfig(undefined), null);
  assert.equal(getImuBadgeConfig(''), null);
});

test("unknown status → neutral tier with raw label", () => {
  const cfg = getImuBadgeConfig("some_unknown_future_status");
  assert.ok(cfg);
  assert.equal(cfg.tier, "neutral");
  assert.equal(cfg.label, "some_unknown_future_status");
});

console.log("\nDone.");
