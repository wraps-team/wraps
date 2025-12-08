import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";

type KeyboardShortcutsOptions = {
  onSave?: (editor: Editor) => void;
  onInsertBlock?: () => void;
  onToggleBlockLibrary?: () => void;
};

export const KeyboardShortcuts = Extension.create<KeyboardShortcutsOptions>({
  name: "keyboardShortcuts",

  addOptions() {
    return {
      onSave: undefined,
      onInsertBlock: undefined,
      onToggleBlockLibrary: undefined,
    };
  },

  addKeyboardShortcuts() {
    return {
      // Cmd+S / Ctrl+S - Save
      "Mod-s": ({ editor }) => {
        this.options.onSave?.(editor);
        return true;
      },

      // Cmd+K / Ctrl+K - Insert block (opens block palette)
      "Mod-k": () => {
        this.options.onInsertBlock?.();
        return true;
      },

      // Cmd+B / Ctrl+B - Toggle block library panel
      "Mod-Shift-b": () => {
        this.options.onToggleBlockLibrary?.();
        return true;
      },

      // Cmd+/ - Insert variable (opens variable autocomplete)
      "Mod-/": ({ editor }) => {
        // Insert {{ to trigger variable autocomplete
        editor.commands.insertContent("{{");
        return true;
      },
    };
  },
});
