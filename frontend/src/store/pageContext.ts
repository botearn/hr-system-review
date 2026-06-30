import { create } from "zustand";

// Lightweight, serializable snapshot of what the user is currently looking at.
// Pages publish into this on visible-state changes; AiPanel reads it and
// attaches it to every /agent/chat request so the LLM can resolve "this one"
// references against the actual UI rather than blindly searching the DB.
export interface PageContext {
  route: string;
  description?: string;
  selectedPosition?: { id: number; title: string };
  visibleCandidates?: Array<{
    id: number;
    name: string;
    score?: number;
    verdict?: string;
  }>;
}

interface PageContextState {
  context: PageContext | null;
  setContext: (ctx: PageContext | null) => void;
}

export const usePageContextStore = create<PageContextState>((set) => ({
  context: null,
  setContext: (ctx) => set({ context: ctx }),
}));
