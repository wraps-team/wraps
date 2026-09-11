import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

// better-auth's organization plugin authorizes its own endpoints against its own
// statements — `organization: ["update", "delete"]`, plus `member`, `invitation`,
// `team` and `ac`. Passing a custom `ac` REPLACES that set rather than extending
// it, and `role.authorize()` fails closed on a resource the role has never heard
// of. That is what broke `authClient.organization.delete()` for owners: the owner
// role carried no `organization` resource at all, so the plugin's
// `{ organization: ["delete"] }` check resolved to "unknown resource" and every
// owner got FORBIDDEN.
//
// So spread better-auth's statements into ours here, and spread each default
// role's statements into the matching role below. The Wraps-specific resources
// (`contacts`, `members`, `orgSettings`, …) gate our own server actions; the
// better-auth ones gate better-auth's endpoints. Both have to be present.
export const ac = createAccessControl({
  ...defaultStatements,
  contacts: ["read", "write", "delete", "import", "export"],
  templates: ["read", "write", "publish", "delete"],
  broadcasts: ["read", "write", "send", "delete"],
  events: ["read", "export"],
  workflows: ["read", "write", "delete"],
  segments: ["read", "write", "delete"],
  topics: ["read", "write", "delete"],
  apiKeys: ["read", "write", "delete"],
  awsAccounts: ["read", "write", "delete"],
  members: ["read", "invite", "remove", "changeRole"],
  sso: ["read", "write", "delete"],
  orgSettings: ["read", "write"],
  billing: ["read", "write"],
} as const);

export const ownerRole = ac.newRole({
  ...ownerAc.statements,
  contacts: ["read", "write", "delete", "import", "export"],
  templates: ["read", "write", "publish", "delete"],
  broadcasts: ["read", "write", "send", "delete"],
  events: ["read", "export"],
  workflows: ["read", "write", "delete"],
  segments: ["read", "write", "delete"],
  topics: ["read", "write", "delete"],
  apiKeys: ["read", "write", "delete"],
  awsAccounts: ["read", "write", "delete"],
  members: ["read", "invite", "remove", "changeRole"],
  sso: ["read", "write", "delete"],
  orgSettings: ["read", "write"],
  billing: ["read", "write"],
});

// admin mirrors better-auth's own admin role: everything the owner has except
// `organization: ["delete"]`. Deleting the org stays with the creator.
export const adminRole = ac.newRole({
  ...adminAc.statements,
  contacts: ["read", "write", "delete", "import", "export"],
  templates: ["read", "write", "publish", "delete"],
  broadcasts: ["read", "write", "send", "delete"],
  events: ["read", "export"],
  workflows: ["read", "write", "delete"],
  segments: ["read", "write", "delete"],
  topics: ["read", "write", "delete"],
  apiKeys: ["read", "write", "delete"],
  awsAccounts: ["read", "write", "delete"],
  members: ["read", "invite", "remove", "changeRole"],
  sso: ["read", "write", "delete"],
  orgSettings: ["read", "write"],
  billing: ["read", "write"],
});

// member: full content + workflow access, no admin-level operations
export const memberRole = ac.newRole({
  ...memberAc.statements,
  contacts: ["read", "write", "delete", "import", "export"],
  templates: ["read", "write", "publish", "delete"],
  broadcasts: ["read", "write", "send", "delete"],
  events: ["read", "export"],
  workflows: ["read", "write", "delete"],
  segments: ["read", "write", "delete"],
  topics: ["read", "write", "delete"],
  apiKeys: ["read"],
  awsAccounts: ["read"],
  members: ["read"],
});

// marketing: full content write, read-only workflows/segments/topics, no admin ops
export const marketingRole = ac.newRole({
  ...memberAc.statements,
  contacts: ["read", "write", "delete", "import", "export"],
  templates: ["read", "write", "publish", "delete"],
  broadcasts: ["read", "write", "send", "delete"],
  events: ["read", "export"],
  workflows: ["read"],
  segments: ["read"],
  topics: ["read"],
  apiKeys: ["read"],
  awsAccounts: ["read"],
  members: ["read"],
});

// read-only: read/export on all content, no writes
export const readOnlyRole = ac.newRole({
  ...memberAc.statements,
  contacts: ["read", "export"],
  templates: ["read"],
  broadcasts: ["read"],
  events: ["read"],
  workflows: ["read"],
  segments: ["read"],
  topics: ["read"],
  apiKeys: ["read"],
  awsAccounts: ["read"],
  members: ["read"],
});

// billing: billing write + read-only access to all content + org context
export const billingRole = ac.newRole({
  ...memberAc.statements,
  contacts: ["read"],
  templates: ["read"],
  broadcasts: ["read"],
  events: ["read"],
  workflows: ["read"],
  segments: ["read"],
  topics: ["read"],
  apiKeys: ["read"],
  awsAccounts: ["read"],
  members: ["read"],
  orgSettings: ["read"],
  billing: ["read", "write"],
});

export const roles = {
  owner: ownerRole,
  admin: adminRole,
  member: memberRole,
  marketing: marketingRole,
  "read-only": readOnlyRole,
  billing: billingRole,
} as const;

export type RoleName = keyof typeof roles;
export type ResourceName = keyof typeof ac.statements;
