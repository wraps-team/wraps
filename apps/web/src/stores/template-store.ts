import type { JSONContent } from "@tiptap/core";
import { create } from "zustand";

type User = {
  id: string;
  name: string;
  avatar?: string;
};

type EditorView = "edit" | "preview" | "code" | "usage";

type LocalState = {
  view: EditorView;
  selectedNodeId: string | null;
  testData: Record<string, unknown>;
  showBlockLibrary: boolean;
  showPropertiesPanel: boolean;
  showAIPanel: boolean;
  showTestDataPanel: boolean;
  showVersionHistory: boolean;
  selectedBrandKitId: string | null;
};

type TemplateMetadata = {
  id: string;
  name: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  updatedAt: string;
  aiGenerated?: boolean;
};

type CollaborationState = {
  isEnabled: boolean;
  users: User[];
  provider: unknown; // YPartyKitProvider when collaboration is enabled
};

type AIState = {
  conversationId: string | null;
  lastGeneratedContent: JSONContent | null;
  isGenerating: boolean;
};

type TemplateStoreActions = {
  // Document actions
  setDocument: (doc: JSONContent) => void;

  // View actions
  setView: (view: EditorView) => void;
  setTestData: (data: Record<string, unknown>) => void;
  setSelectedNode: (id: string | null) => void;

  // Panel toggles
  toggleBlockLibrary: () => void;
  togglePropertiesPanel: () => void;
  toggleAIPanel: () => void;
  toggleTestDataPanel: () => void;
  toggleVersionHistory: () => void;

  // Brand kit
  setSelectedBrandKitId: (id: string | null) => void;

  // Template actions
  setTemplate: (template: TemplateMetadata | null) => void;
  updateTemplate: (template: Partial<TemplateMetadata>) => void;

  // AI actions
  setAIConversation: (id: string | null) => void;
  setLastGeneratedContent: (content: JSONContent | null) => void;
  setIsGenerating: (isGenerating: boolean) => void;

  // Reset
  reset: () => void;
};

type TemplateStore = {
  // Document state (will be synced via Yjs when collaboration is added)
  document: JSONContent | null;

  // Local state (never synced)
  localState: LocalState;

  // Template metadata
  template: TemplateMetadata | null;

  // Placeholder for future collaboration
  collaboration: CollaborationState;

  // AI state
  ai: AIState;

  // Actions
  actions: TemplateStoreActions;
};

const initialLocalState: LocalState = {
  view: "edit",
  selectedNodeId: null,
  testData: {},
  showBlockLibrary: true,
  showPropertiesPanel: true,
  showAIPanel: false,
  showTestDataPanel: false,
  showVersionHistory: false,
  selectedBrandKitId: null,
};

const initialCollaborationState: CollaborationState = {
  isEnabled: false,
  users: [],
  provider: null,
};

const initialAIState: AIState = {
  conversationId: null,
  lastGeneratedContent: null,
  isGenerating: false,
};

export const useTemplateStore = create<TemplateStore>((set) => ({
  document: null,
  localState: initialLocalState,
  template: null,
  collaboration: initialCollaborationState,
  ai: initialAIState,

  actions: {
    setDocument: (doc) => set({ document: doc }),

    setView: (view) =>
      set((state) => ({
        localState: { ...state.localState, view },
      })),

    setTestData: (data) =>
      set((state) => ({
        localState: { ...state.localState, testData: data },
      })),

    setSelectedNode: (id) =>
      set((state) => ({
        localState: { ...state.localState, selectedNodeId: id },
      })),

    toggleBlockLibrary: () =>
      set((state) => ({
        localState: {
          ...state.localState,
          showBlockLibrary: !state.localState.showBlockLibrary,
        },
      })),

    togglePropertiesPanel: () =>
      set((state) => ({
        localState: {
          ...state.localState,
          showPropertiesPanel: !state.localState.showPropertiesPanel,
        },
      })),

    toggleAIPanel: () =>
      set((state) => ({
        localState: {
          ...state.localState,
          showAIPanel: !state.localState.showAIPanel,
        },
      })),

    toggleTestDataPanel: () =>
      set((state) => ({
        localState: {
          ...state.localState,
          showTestDataPanel: !state.localState.showTestDataPanel,
        },
      })),

    toggleVersionHistory: () =>
      set((state) => ({
        localState: {
          ...state.localState,
          showVersionHistory: !state.localState.showVersionHistory,
        },
      })),

    setSelectedBrandKitId: (id) =>
      set((state) => ({
        localState: {
          ...state.localState,
          selectedBrandKitId: id,
        },
      })),

    setTemplate: (template) => set({ template }),

    updateTemplate: (updates) =>
      set((state) => ({
        template: state.template ? { ...state.template, ...updates } : null,
      })),

    setAIConversation: (id) =>
      set((state) => ({
        ai: { ...state.ai, conversationId: id },
      })),

    setLastGeneratedContent: (content) =>
      set((state) => ({
        ai: { ...state.ai, lastGeneratedContent: content },
      })),

    setIsGenerating: (isGenerating) =>
      set((state) => ({
        ai: { ...state.ai, isGenerating },
      })),

    reset: () =>
      set({
        document: null,
        localState: initialLocalState,
        template: null,
        ai: initialAIState,
      }),
  },
}));

// Selectors for common use cases
export const useEditorView = () =>
  useTemplateStore((state) => state.localState.view);
export const useTestData = () =>
  useTemplateStore((state) => state.localState.testData);
export const useSelectedNodeId = () =>
  useTemplateStore((state) => state.localState.selectedNodeId);
export const useShowBlockLibrary = () =>
  useTemplateStore((state) => state.localState.showBlockLibrary);
export const useShowPropertiesPanel = () =>
  useTemplateStore((state) => state.localState.showPropertiesPanel);
export const useShowAIPanel = () =>
  useTemplateStore((state) => state.localState.showAIPanel);
export const useShowTestDataPanel = () =>
  useTemplateStore((state) => state.localState.showTestDataPanel);
export const useShowVersionHistory = () =>
  useTemplateStore((state) => state.localState.showVersionHistory);
export const useSelectedBrandKitId = () =>
  useTemplateStore((state) => state.localState.selectedBrandKitId);
export const useTemplateMetadata = () =>
  useTemplateStore((state) => state.template);
export const useAIState = () => useTemplateStore((state) => state.ai);
export const useTemplateActions = () =>
  useTemplateStore((state) => state.actions);
