export interface SensorAvailability {
  accelerometer: boolean;
  gyroscope: boolean;
}

/** Returned by startCapture on success. */
export interface StartCaptureResult {
  captureSessionId: string;
}

export interface ImuMetadata {
  imuEmbedded: boolean;
  imuFormat: string;
  accelerometerSampleCount: number;
  gyroscopeSampleCount: number;
  accelerometerEffectiveHz: number;
  gyroscopeEffectiveHz: number;
  imuValidationStatus: string;
  /** Short ID generated at startCapture — safe for diagnostic logging. */
  captureSessionId?: string;
}

export interface StopAndEmbedResult {
  uri: string;
  metadata: ImuMetadata;
}
