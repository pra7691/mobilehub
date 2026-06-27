export interface SensorAvailability {
  accelerometer: boolean;
  gyroscope: boolean;
}

export interface ImuMetadata {
  imuEmbedded: boolean;
  imuFormat: string;
  accelerometerSampleCount: number;
  gyroscopeSampleCount: number;
  accelerometerEffectiveHz: number;
  gyroscopeEffectiveHz: number;
  imuValidationStatus: string;
}

export interface StopAndEmbedResult {
  uri: string;
  metadata: ImuMetadata;
}
