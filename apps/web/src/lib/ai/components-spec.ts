// apps/web/src/lib/ai/components-spec.ts

export type ComponentSpec = {
  name: string;
  description: string;
  tiptapNodeType: string;
  props: PropSpec[];
  examples: Example[];
  emailClientNotes?: string;
};

export type PropSpec = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  default?: unknown;
  description: string;
};

export type Example = {
  prompt: string;
  output: string; // TipTap JSON fragment
};

// Complete component specifications
export const COMPONENT_SPECS: ComponentSpec[] = [
  {
    name: "Section",
    description:
      "A container for grouping email content with consistent padding and styling.",
    tiptapNodeType: "emailSection",
    props: [
      {
        name: "padding",
        type: "string",
        required: false,
        default: "24px",
        description: "Padding inside the section",
      },
      {
        name: "backgroundColor",
        type: "string",
        required: false,
        default: "transparent",
        description: "Background color of the section",
      },
      {
        name: "borderRadius",
        type: "string",
        required: false,
        default: "0",
        description: "Border radius of the section",
      },
    ],
    examples: [
      {
        prompt: "Create a header section",
        output:
          '{"type":"emailSection","attrs":{"padding":"32px 24px","backgroundColor":"#f8fafc"},"content":[]}',
      },
    ],
    emailClientNotes: "Renders as a table cell for maximum compatibility.",
  },
  {
    name: "Heading",
    description: "A heading element (h1-h3) for titles and section headers.",
    tiptapNodeType: "heading",
    props: [
      {
        name: "level",
        type: "number",
        required: true,
        default: 1,
        description: "Heading level (1-3)",
      },
    ],
    examples: [
      {
        prompt: "Add a welcome title",
        output:
          '{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Welcome to {{companyName}}!"}]}',
      },
    ],
  },
  {
    name: "Paragraph",
    description: "A paragraph of body text.",
    tiptapNodeType: "paragraph",
    props: [],
    examples: [
      {
        prompt: "Add introduction text",
        output:
          '{"type":"paragraph","content":[{"type":"text","text":"We\'re excited to have you on board. Here\'s what you need to know..."}]}',
      },
    ],
  },
  {
    name: "Button",
    description:
      "A clickable CTA button that links to a URL. Uses bulletproof button technique for Outlook.",
    tiptapNodeType: "emailButton",
    props: [
      {
        name: "href",
        type: "string",
        required: true,
        description: "The URL the button links to",
      },
      {
        name: "backgroundColor",
        type: "string",
        required: false,
        default: "#5046e5",
        description: "Button background color",
      },
      {
        name: "color",
        type: "string",
        required: false,
        default: "#ffffff",
        description: "Button text color",
      },
      {
        name: "padding",
        type: "string",
        required: false,
        default: "12px 24px",
        description: "Button padding",
      },
      {
        name: "borderRadius",
        type: "string",
        required: false,
        default: "6px",
        description: "Button border radius",
      },
      {
        name: "fontWeight",
        type: "string",
        required: false,
        default: "600",
        description: "Button font weight",
      },
      {
        name: "fontSize",
        type: "string",
        required: false,
        default: "14px",
        description: "Button font size",
      },
    ],
    examples: [
      {
        prompt: "Add a signup button",
        output:
          '{"type":"emailButton","attrs":{"href":"{{signupUrl}}","backgroundColor":"#5046e5","color":"#ffffff","padding":"12px 24px","borderRadius":"6px"},"content":[{"type":"text","text":"Sign Up Now"}]}',
      },
    ],
    emailClientNotes:
      "Uses VML for Outlook compatibility. Always renders correctly.",
  },
  {
    name: "Image",
    description: "An image with alt text for accessibility.",
    tiptapNodeType: "emailImage",
    props: [
      {
        name: "src",
        type: "string",
        required: true,
        description: "Image URL",
      },
      {
        name: "alt",
        type: "string",
        required: true,
        description: "Alt text for accessibility",
      },
      {
        name: "width",
        type: "string",
        required: false,
        default: "100%",
        description: "Image width",
      },
    ],
    examples: [
      {
        prompt: "Add the company logo",
        output:
          '{"type":"emailImage","attrs":{"src":"{{logoUrl}}","alt":"{{companyName}}","width":"120"}}',
      },
    ],
    emailClientNotes:
      "Always specify width for consistent rendering across clients.",
  },
  {
    name: "Divider",
    description: "A horizontal line to separate sections.",
    tiptapNodeType: "emailDivider",
    props: [
      {
        name: "color",
        type: "string",
        required: false,
        default: "#e5e7eb",
        description: "Divider color",
      },
      {
        name: "thickness",
        type: "string",
        required: false,
        default: "1px",
        description: "Divider thickness",
      },
      {
        name: "margin",
        type: "string",
        required: false,
        default: "24px",
        description: "Margin above and below",
      },
    ],
    examples: [
      {
        prompt: "Add a separator",
        output:
          '{"type":"emailDivider","attrs":{"color":"#e5e7eb","margin":"24px"}}',
      },
    ],
  },
  {
    name: "Spacer",
    description: "Vertical spacing between elements.",
    tiptapNodeType: "emailSpacer",
    props: [
      {
        name: "height",
        type: "string",
        required: true,
        default: "24px",
        description: "Height of the spacer",
      },
    ],
    examples: [
      {
        prompt: "Add spacing",
        output: '{"type":"emailSpacer","attrs":{"height":"24px"}}',
      },
    ],
  },
  {
    name: "Row",
    description: "A horizontal row container for multi-column layouts.",
    tiptapNodeType: "emailRow",
    props: [],
    examples: [
      {
        prompt: "Create a two-column layout",
        output:
          '{"type":"emailRow","content":[{"type":"emailColumn","attrs":{"width":"50%"},"content":[]},{"type":"emailColumn","attrs":{"width":"50%"},"content":[]}]}',
      },
    ],
    emailClientNotes: "Renders as a table row for email client compatibility.",
  },
  {
    name: "Column",
    description: "A column within a Row. Set width as percentage or pixels.",
    tiptapNodeType: "emailColumn",
    props: [
      {
        name: "width",
        type: "string",
        required: false,
        default: "50%",
        description: "Column width",
      },
    ],
    examples: [],
  },
  {
    name: "Variable",
    description:
      "A dynamic variable placeholder that gets replaced with actual data.",
    tiptapNodeType: "variable",
    props: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Variable name (e.g., firstName)",
      },
      {
        name: "label",
        type: "string",
        required: false,
        description: "Display label for the variable",
      },
      {
        name: "fallback",
        type: "string",
        required: false,
        description: "Fallback value if variable is not provided",
      },
    ],
    examples: [
      {
        prompt: "Add the user's first name",
        output:
          '{"type":"variable","attrs":{"name":"firstName","label":"First Name","fallback":"there"}}',
      },
    ],
  },
  {
    name: "Conditional",
    description: "Content that only renders when a condition is met.",
    tiptapNodeType: "conditional",
    props: [
      {
        name: "variable",
        type: "string",
        required: true,
        description: "Variable to check",
      },
      {
        name: "operator",
        type: "string",
        required: true,
        description:
          "Comparison operator (equals, notEquals, exists, notExists, contains, greaterThan, lessThan)",
      },
      {
        name: "value",
        type: "string",
        required: false,
        description: "Value to compare against",
      },
    ],
    examples: [
      {
        prompt: "Show premium content only for premium users",
        output:
          '{"type":"conditional","attrs":{"variable":"userType","operator":"equals","value":"premium"},"content":[{"type":"emailSection","content":[{"type":"paragraph","content":[{"type":"text","text":"As a premium member, you get exclusive access..."}]}]}]}',
      },
    ],
  },
];

// Helper to get valid node types for validation
export const VALID_NODE_TYPES = new Set([
  "doc",
  "text",
  "hardBreak",
  ...COMPONENT_SPECS.map((c) => c.tiptapNodeType),
]);

// Helper to get component spec by node type
export function getComponentSpec(nodeType: string): ComponentSpec | undefined {
  return COMPONENT_SPECS.find((c) => c.tiptapNodeType === nodeType);
}
