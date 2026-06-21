import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import {
  usePatchNotificationsPreferences,
  usePostNotificationsRegisterDevice,
} from "@workspace/api-client-react";

// expo-notifications throws at import time in Expo Go SDK 53+ — use safe require
let Notifications: typeof import("expo-notifications") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  Notifications = require("expo-notifications") as typeof import("expo-notifications");
} catch {
  Notifications = null;
}

export const PREF_STORAGE_KEY = "notification_prefs";
export const TOKEN_STORAGE_KEY = "expo_push_token";

export interface NotificationPreferences {
  notifySubmissionUpdates: boolean;
  notifyNewTasks: boolean;
  notifyAppNotices: boolean;
}

export const DEFAULT_PREFS: NotificationPreferences = {
  notifySubmissionUpdates: true,
  notifyNewTasks: true,
  notifyAppNotices: true,
};

export function useNotifications(isAuthenticated: boolean) {
  const { mutate: registerDevice } = usePostNotificationsRegisterDevice();
  const { mutate: updatePreferences } = usePatchNotificationsPreferences();
  const initialized = useRef(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || initialized.current) return;
    initialized.current = true;
    void registerForPush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  async function registerForPush() {
    // expo-notifications not available in Expo Go SDK 53+
    if (!Notifications) return;
    if (!Device.isDevice) return;

    type PermResult = { granted: boolean };
    const existing = (await Notifications.getPermissionsAsync()) as unknown as PermResult;
    let granted = existing.granted;

    if (!granted) {
      const result = (await Notifications.requestPermissionsAsync()) as unknown as PermResult;
      granted = result.granted;
    }

    if (!granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Capto",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#06b6d4",
      });
    }

    try {
      const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
      tokenRef.current = pushToken;
      await AsyncStorage.setItem(TOKEN_STORAGE_KEY, pushToken);

      const savedPrefs = await AsyncStorage.getItem(PREF_STORAGE_KEY);
      const prefs: NotificationPreferences = savedPrefs
        ? (JSON.parse(savedPrefs) as NotificationPreferences)
        : DEFAULT_PREFS;

      registerDevice({
        data: {
          expoPushToken: pushToken,
          platform: Platform.OS as "ios" | "android",
          deviceId: Device.deviceName ?? undefined,
          ...prefs,
        },
      });
    } catch {
      // Expo Go without a project ID: expected in dev. Physical device with EAS build works.
    }
  }

  function syncPreferences(prefs: NotificationPreferences) {
    if (!tokenRef.current) return;
    updatePreferences({
      data: { expoPushToken: tokenRef.current, ...prefs },
    });
  }

  return { syncPreferences };
}
