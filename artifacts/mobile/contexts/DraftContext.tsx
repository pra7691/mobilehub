import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  deleteDraft as deleteDraftStorage,
  listDrafts,
  saveDraft as saveDraftStorage,
  type LocalDraft,
} from "@/lib/drafts";

interface DraftContextValue {
  drafts: LocalDraft[];
  saveDraft: (draft: LocalDraft) => Promise<void>;
  deleteDraft: (id: string) => Promise<void>;
  refreshDrafts: () => Promise<void>;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);

  const refreshDrafts = useCallback(async () => {
    const loaded = await listDrafts();
    setDrafts(loaded);
  }, []);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  const saveDraft = useCallback(
    async (draft: LocalDraft) => {
      await saveDraftStorage(draft);
      await refreshDrafts();
    },
    [refreshDrafts]
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      await deleteDraftStorage(id);
      await refreshDrafts();
    },
    [refreshDrafts]
  );

  return (
    <DraftContext.Provider value={{ drafts, saveDraft, deleteDraft, refreshDrafts }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useDrafts(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDrafts must be used within DraftProvider");
  return ctx;
}
