import { create } from "zustand";

interface LayoutState {
  /** Current width of the right-side AiPanel, in px. Pages can use this to align
   *  fixed-position elements against the panel's left edge. */
  aiPanelWidth: number;
  setAiPanelWidth: (w: number) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  aiPanelWidth: 0,
  setAiPanelWidth: (w) => set({ aiPanelWidth: w }),
}));
