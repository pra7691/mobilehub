import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  listDrafts,
  saveDraft as saveDraftStorage,
  recoverInterruptedDrafts,
  type LocalDraft,
} from "@/lib/drafts";
import { cancelUpload, abortAndDeleteDraft } from "@/lib/uploadClient";

interface DraftContextValue {
  drafts: LocalDraft[];
  saveDraft: (draft: LocalDraft) => Promise<void>;
  deleteDraft: (id: string, draft?: LocalDraft) => Promise<void>;
  cancelDraftUpload: (draftId: string) => Promise<void>;
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
    recoverInterruptedDrafts()
      .then(() => refreshDrafts())
      .catch(() => refreshDrafts());
  }, [refreshDrafts]);

  const saveDraft = useCallback(
    async (draft: LocalDraft) => {
      await saveDraftStorage(draft);
      await refreshDrafts();
    },
    [refreshDrafts]
  );

  const deleteDraft = useCallback(
    async (id: string, draft?: LocalDraft) => {
      if (draft) {
        await abortAndDeleteDraft(draft);
      } else {
        const found = drafts.find((d) => d.id === id);
        if (found) {
          await abortAndDeleteDraft(found);
        }
      }
      await refreshDrafts();
    },
    [drafts, refreshDrafts]
  );

  const cancelDraftUpload = useCallback(
    async (draftId: string) => {
      await cancelUpload(draftId);
      await refreshDrafts();
    },
    [refreshDrafts]
  );

  return (
    <DraftContext.Provider
      value={{ drafts, saveDraft, deleteDraft, cancelDraftUpload, refreshDrafts }}
    >
      {children}
    </DraftContext.Provider>
  );
}

export function useDrafts(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDrafts must be used within DraftProvider");
  return ctx;
}
