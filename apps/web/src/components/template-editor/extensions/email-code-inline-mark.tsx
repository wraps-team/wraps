"use client";

import { Mark, mergeAttributes } from "@tiptap/core";

export type EmailCodeInlineAttributes = {
  backgroundColor: string;
  textColor: string;
  padding: string;
  borderRadius: string;
  fontFamily: string;
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    emailCodeInline: {
      setEmailCodeInline: (
        attributes?: Partial<EmailCodeInlineAttributes>
      ) => ReturnType;
      toggleEmailCodeInline: (
        attributes?: Partial<EmailCodeInlineAttributes>
      ) => ReturnType;
      unsetEmailCodeInline: () => ReturnType;
    };
  }
}

export const EmailCodeInlineMark = Mark.create({
  name: "emailCodeInline",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      backgroundColor: { default: "#f3f4f6" },
      textColor: { default: "#dc2626" },
      padding: { default: "2px 6px" },
      borderRadius: { default: "4px" },
      fontFamily: { default: "'Fira Code', 'Consolas', monospace" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "code",
        getAttrs: (node) => {
          // Only match inline code, not code blocks
          if (typeof node === "string") return false;
          const parent = node.parentElement;
          if (parent?.tagName === "PRE") return false;
          return {};
        },
      },
      { tag: "email-code-inline" },
    ];
  },

  renderHTML({ HTMLAttributes, mark }) {
    const attrs = mark.attrs as EmailCodeInlineAttributes;
    return [
      "code",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style: `
          background-color: ${attrs.backgroundColor};
          color: ${attrs.textColor};
          padding: ${attrs.padding};
          border-radius: ${attrs.borderRadius};
          font-family: ${attrs.fontFamily};
          font-size: 0.9em;
        `.replace(/\s+/g, " "),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setEmailCodeInline:
        (attributes) =>
        ({ commands }) =>
          commands.setMark(this.name, attributes),
      toggleEmailCodeInline:
        (attributes) =>
        ({ commands }) =>
          commands.toggleMark(this.name, attributes),
      unsetEmailCodeInline:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-e": () => this.editor.commands.toggleEmailCodeInline(),
    };
  },
});
