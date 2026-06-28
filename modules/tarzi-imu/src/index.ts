export {
  isAvailable,
  getNativeMethodNames,
  checkSensorAvailability,
  startCapture,
  stopAndEmbed,
  resumeEmbed,
} from "./TarziImuModule";

export type {
  SensorAvailability,
  StartCaptureResult,
  ImuMetadata,
  StopAndEmbedResult,
} from "./TarziImuModule.types";

import {
  isAvailable,
  getNativeMethodNames,
  checkSensorAvailability,
  startCapture,
  stopAndEmbed,
  resumeEmbed,
} from "./TarziImuModule";

export const TarziImuVideoService = {
  isAvailable,
  getNativeMethodNames,
  checkSensorAvailability,
  startCapture,
  stopAndEmbed,
  resumeEmbed,
} as const;
