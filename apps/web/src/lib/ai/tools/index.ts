import { type ToolSet, tool } from "ai";
import { checkPermission } from "@/actions/shared/permissions";
import type { AssistantToolContext } from "./definitions";
import { ASSISTANT_TOOLS } from "./definitions";

export type { AssistantToolContext } from "./definitions";
export { ASSISTANT_TOOLS } from "./definitions";

/**
 * The tools this caller may use, already bound to their organization.
 *
 * Two invariants live here rather than in the model's prompt, because a prompt
 * is not an access control mechanism:
 *  1. `organizationId` is closed over from the authenticated request — it is
 *     never a tool input, so no prompt can redirect a read to another org.
 *  2. A tool the caller's role cannot use is not offered at all, so the model
 *     cannot call it and then be denied.
 */
export function buildAssistantTools(args: {
  ctx: AssistantToolContext;
  userRole: string;
}): ToolSet {
  const tools: ToolSet = {};
  for (const def of ASSISTANT_TOOLS) {
    if (checkPermission(args.userRole, def.resource, [...def.permission])) {
      continue;
    }
    tools[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: (input) => def.execute(input, args.ctx),
    });
  }
  return tools;
}
