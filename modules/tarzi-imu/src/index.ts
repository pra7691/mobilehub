export {
  isAvailable,
  checkSensorAvailability,
  startCapture,
  stopAndEmbed,
  resumeEmbed,
} from "./TarziImuModule";

export type {
  SensorAvailability,
  ImuMetadata,
  StopAndEmbedResult,
} from "./TarziImuModule.types";

import {
  isAvailable,
  checkSensorAvailability,
  startCapture,
  stopAndEmbed,
  resumeEmbed,
} from "./TarziImuModule";

export const TarziImuVideoService = {
  isAvailable,
  checkSensorAvailability,
  startCapture,
  stopAndEmbed,
  resumeEmbed,
} as const;
