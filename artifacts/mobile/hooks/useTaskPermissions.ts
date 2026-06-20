import {
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";

import type { CollectionType } from "@/lib/drafts";

export interface TaskPermissionResult {
  granted: boolean;
  request: () => Promise<boolean>;
}

export function useTaskPermissions(
  collectionType: CollectionType
): TaskPermissionResult {
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();

  const needsCamera = collectionType === "IMAGE" || collectionType === "VIDEO";
  const needsMic = collectionType === "VIDEO" || collectionType === "AUDIO";

  const cameraGranted = !needsCamera || cameraPermission?.granted === true;
  const micGranted = !needsMic || micPermission?.granted === true;
  const granted = cameraGranted && micGranted;

  const request = async (): Promise<boolean> => {
    let ok = true;
    if (needsCamera && !cameraPermission?.granted) {
      const result = await requestCamera();
      if (!result.granted) ok = false;
    }
    if (needsMic && !micPermission?.granted) {
      const result = await requestMic();
      if (!result.granted) ok = false;
    }
    return ok;
  };

  return { granted, request };
}
