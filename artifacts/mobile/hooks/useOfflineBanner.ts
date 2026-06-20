import { useEffect, useState, useCallback } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

export interface OfflineState {
  isOffline: boolean;
  isInternetReachable: boolean | null;
}

export function useOfflineBanner(): OfflineState {
  const [state, setState] = useState<OfflineState>({
    isOffline: false,
    isInternetReachable: null,
  });

  const handleChange = useCallback((netState: NetInfoState) => {
    setState({
      isOffline: !netState.isConnected,
      isInternetReachable: netState.isInternetReachable,
    });
  }, []);

  useEffect(() => {
    // Fetch initial state
    NetInfo.fetch().then(handleChange);
    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener(handleChange);
    return () => unsubscribe();
  }, [handleChange]);

  return state;
}
