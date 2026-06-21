import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

interface NetworkContextValue {
  isOffline: boolean;
  isInternetReachable: boolean | null;
  justCameOnline: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOffline: false,
  isInternetReachable: null,
  justCameOnline: false,
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(null);
  const [justCameOnline, setJustCameOnline] = useState(false);

  const wasOfflineRef = useRef(false);
  const backOnlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleNetState(netState: NetInfoState) {
    const nowOffline = netState.isConnected === false;

    // Went from offline → online
    if (wasOfflineRef.current && !nowOffline) {
      if (backOnlineTimerRef.current) clearTimeout(backOnlineTimerRef.current);
      setJustCameOnline(true);
      backOnlineTimerRef.current = setTimeout(() => setJustCameOnline(false), 2500);
    }

    wasOfflineRef.current = nowOffline;
    setIsOffline(nowOffline);
    setIsInternetReachable(netState.isInternetReachable);
  }

  useEffect(() => {
    NetInfo.fetch().then(handleNetState);
    const unsubNet = NetInfo.addEventListener(handleNetState);

    const appStateSub = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        NetInfo.fetch().then(handleNetState);
      }
    });

    return () => {
      unsubNet();
      appStateSub.remove();
      if (backOnlineTimerRef.current) clearTimeout(backOnlineTimerRef.current);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOffline, isInternetReachable, justCameOnline }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetworkStatus(): NetworkContextValue {
  return useContext(NetworkContext);
}
