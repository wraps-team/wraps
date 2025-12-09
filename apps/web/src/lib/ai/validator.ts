// apps/web/src/lib/ai/validator.ts

import type { JSONContent } from "@tiptap/core";
import { COMPONENT_SPECS, VALID_NODE_TYPES } from "./components-spec";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export function validateTipTapJson(doc: JSONContent): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  function validateNode(node: JSONContent, path = "root"): void {
    // Check node type
    if (!node.type) {
      errors.push(`Missing type at ${path}`);
      return;
    }

    if (!VALID_NODE_TYPES.has(node.type)) {
      errors.push(
        `Unknown node type "${node.type}" at ${path}. Valid types: ${Array.from(VALID_NODE_TYPES).join(", ")}`
      );
    }

    // Find component spec
    const spec = COMPONENT_SPECS.find((c) => c.tiptapNodeType === node.type);

    if (spec && node.attrs) {
      // Check required props
      for (const prop of spec.props) {
        if (prop.required && !(prop.name in node.attrs)) {
          errors.push(
            `Missing required prop "${prop.name}" for ${node.type} at ${path}`
          );
        }
      }
    }

    // Recursively validate children
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach((child, index) => {
        validateNode(child, `${path}.content[${index}]`);
      });
    }

    // Check for common issues
    if (node.type === "emailButton") {
      if (!node.attrs?.href) {
        warnings.push(`Button missing href at ${path}`);
      } else if (
        typeof node.attrs.href === "string" &&
        node.attrs.href.includes("javascript:")
      ) {
        errors.push(`JavaScript URLs not allowed in buttons at ${path}`);
      }
    }

    if (node.type === "emailImage") {
      if (!node.attrs?.src) {
        errors.push(`Image missing src at ${path}`);
      }
      if (!node.attrs?.alt) {
        warnings.push(
          `Image missing alt text at ${path} (accessibility issue)`
        );
      }
    }

    if (node.type === "variable" && !node.attrs?.name) {
      errors.push(`Variable missing name at ${path}`);
    }

    if (node.type === "conditional") {
      if (!node.attrs?.variable) {
        errors.push(`Conditional missing variable at ${path}`);
      }
      if (!node.attrs?.operator) {
        errors.push(`Conditional missing operator at ${path}`);
      }
    }
  }

  // Validate document structure
  if (doc.type !== "doc") {
    errors.push('Root node must be type "doc"');
  }

  if (doc.content && Array.isArray(doc.content)) {
    // Validate all nodes
    validateNode(doc);
  } else {
    errors.push("Document must have content array");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Helper to extract TipTap JSON from AI response
export function extractTipTapJson(content: string): JSONContent | null {
  // Try multiple extraction strategies

  // Strategy 1: Look for ```json code block
  const jsonCodeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonCodeBlockMatch) {
    try {
      const parsed = JSON.parse(jsonCodeBlockMatch[1]) as JSONContent;
      if (parsed.type === "doc" && Array.isArray(parsed.content)) {
        return parsed;
      }
    } catch {
      // Failed to parse, try next strategy
    }
  }

  // Strategy 2: Look for generic code block that might contain JSON
  const genericCodeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/);
  if (genericCodeBlockMatch) {
    try {
      const parsed = JSON.parse(genericCodeBlockMatch[1]) as JSONContent;
      if (parsed.type === "doc" && Array.isArray(parsed.content)) {
        return parsed;
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  // Strategy 3: Look for raw JSON object starting with {"type":"doc"
  const startIdx = content.indexOf('{"type":"doc"');
  if (startIdx !== -1) {
    try {
      // Find the complete JSON object by balancing braces
      let depth = 0;
      let endIdx = startIdx;
      for (let i = startIdx; i < content.length; i++) {
        if (content[i] === "{") {
          depth++;
        }
        if (content[i] === "}") {
          depth--;
        }
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
      const jsonStr = content.slice(startIdx, endIdx);
      const parsed = JSON.parse(jsonStr) as JSONContent;
      if (parsed.type === "doc" && Array.isArray(parsed.content)) {
        return parsed;
      }
    } catch {
      // Failed to parse raw JSON
    }
  }

  return null;
}

// Fix common AI output issues
export function sanitizeTipTapJson(doc: JSONContent): JSONContent {
  function sanitizeNode(node: JSONContent): JSONContent {
    const sanitized = { ...node };

    // Ensure attrs exists for nodes that need it
    if (!sanitized.attrs) {
      sanitized.attrs = {};
    }

    // Fix common attribute issues
    if (sanitized.type === "emailButton") {
      // Ensure href exists
      if (!sanitized.attrs.href) {
        sanitized.attrs.href = "#";
      }
      // Set default styles if missing
      sanitized.attrs.backgroundColor =
        sanitized.attrs.backgroundColor || "#5046e5";
      sanitized.attrs.color = sanitized.attrs.color || "#ffffff";
      sanitized.attrs.padding = sanitized.attrs.padding || "12px 24px";
      sanitized.attrs.borderRadius = sanitized.attrs.borderRadius || "6px";
    }

    if (sanitized.type === "emailImage") {
      // Provide placeholder if src missing
      if (!sanitized.attrs.src) {
        sanitized.attrs.src = "https://placehold.co/600x200";
      }
      if (!sanitized.attrs.alt) {
        sanitized.attrs.alt = "Image";
      }
    }

    if (sanitized.type === "emailSpacer") {
      sanitized.attrs.height = sanitized.attrs.height || "24px";
    }

    if (sanitized.type === "emailDivider") {
      sanitized.attrs.color = sanitized.attrs.color || "#e5e7eb";
    }

    if (sanitized.type === "variable") {
      // Ensure name exists
      if (!sanitized.attrs.name) {
        sanitized.attrs.name = "variableName";
      }
      // Set label to name if missing
      if (!sanitized.attrs.label) {
        sanitized.attrs.label = sanitized.attrs.name;
      }
    }

    // Recursively sanitize children
    if (sanitized.content && Array.isArray(sanitized.content)) {
      sanitized.content = sanitized.content.map(sanitizeNode);
    }

    return sanitized;
  }

  return sanitizeNode(doc);
}
