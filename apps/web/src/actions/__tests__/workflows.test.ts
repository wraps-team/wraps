import type { WorkflowStep, WorkflowTransition } from "@wraps/db";
import {
  awsAccount,
  contact,
  db,
  member,
  organization,
  organizationExtension,
  subscription,
  template,
  user,
  workflow,
  workflowExecution,
  workflowStepExecution,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createWorkflow,
  deleteWorkflow,
  disableWorkflow,
  duplicateWorkflow,
  enableWorkflow,
  getWorkflow,
  getWorkflowExecution,
  getWorkflowStats,
  listWorkflowExecutions,
  listWorkflows,
  updateWorkflow,
} from "../workflows";

// Test data
const testUser = {
  id: "test-workflows-user-1",
  email: "workflows-test@example.com",
  name: "Workflows Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testMemberUser = {
  id: "test-workflows-member-user-1",
  email: "workflows-member@example.com",
  name: "Workflows Member User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-workflows-org-1",
  name: "Workflows Test Org",
  slug: "workflows-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOwnerMember = {
  id: "test-workflows-owner-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: "test-workflows-aws-account-1",
  organizationId: testOrganization.id,
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/test-role",
  externalId: "test-workflows-external-id-unique",
  name: "Test AWS Account",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testRegularMember = {
  id: "test-workflows-regular-member-1",
  organizationId: testOrganization.id,
  userId: testMemberUser.id,
  role: "member" as const,
  createdAt: new Date(),
};

const testTemplate = {
  id: "test-workflows-template-1",
  organizationId: testOrganization.id,
  name: "Test Email Template",
  subject: "Welcome",
  content: {},
  status: "PUBLISHED" as const,
  type: "EMAIL" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testContact = {
  id: "test-workflows-contact-1",
  organizationId: testOrganization.id,
  email: "contact@example.com",
  firstName: "Jane",
  lastName: "Doe",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testContact2 = {
  id: "test-workflows-contact-2",
  organizationId: testOrganization.id,
  email: "contact2@example.com",
  firstName: "John",
  lastName: "Smith",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Track current mock user
let currentMockUserId = testUser.id;

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock the auth module
vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: currentMockUserId,
          email:
            currentMockUserId === testUser.id
              ? testUser.email
              : testMemberUser.email,
          name:
            currentMockUserId === testUser.id
              ? testUser.name
              : testMemberUser.name,
        },
        session: {
          id: "session-123",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: currentMockUserId,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "test-token",
        },
      })),
    },
  },
}));

// Mock plan-limits to allow workflows feature and workflow creation
vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
  checkWorkflowLimit: vi.fn(async () => ({
    allowed: true,
    current: 0,
    limit: 5,
  })),
}));

// Set up test database
beforeAll(async () => {
  // Insert test users
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(user)
    .values(testMemberUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  // Insert test organization
  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  // Set up organization extension
  await db
    .insert(organizationExtension)
    .values({
      organizationId: testOrganization.id,
    })
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: { updatedAt: new Date() },
    });

  // Set up Scale plan subscription (required for automations)
  await db
    .insert(subscription)
    .values({
      id: `sub_test_workflows_${testOrganization.id}`,
      plan: "growth",
      referenceId: testOrganization.id,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscription.id,
      set: { plan: "growth", status: "active" },
    });

  // Insert test members
  await db
    .insert(member)
    .values(testOwnerMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testOwnerMember.role },
    });

  await db
    .insert(member)
    .values(testRegularMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testRegularMember.role },
    });

  // Insert test AWS account (required for enabling workflows)
  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { name: testAwsAccount.name },
    });

  // Insert test template (required for enabling workflows with email steps)
  await db
    .insert(template)
    .values(testTemplate)
    .onConflictDoUpdate({
      target: template.id,
      set: { name: testTemplate.name },
    });

  // Insert test contacts (required for execution history tests)
  await db
    .insert(contact)
    .values(testContact)
    .onConflictDoUpdate({
      target: contact.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(contact)
    .values(testContact2)
    .onConflictDoUpdate({
      target: contact.id,
      set: { updatedAt: new Date() },
    });
});

// Clean up workflows before each test and reset mock user
beforeEach(async () => {
  currentMockUserId = testUser.id; // Reset to owner
  await db
    .delete(workflowExecution)
    .where(eq(workflowExecution.organizationId, testOrganization.id));
  await db
    .delete(workflow)
    .where(eq(workflow.organizationId, testOrganization.id));
});

// Clean up after all tests
afterAll(async () => {
  await db
    .delete(workflowExecution)
    .where(eq(workflowExecution.organizationId, testOrganization.id));
  await db
    .delete(workflow)
    .where(eq(workflow.organizationId, testOrganization.id));
  await db.delete(template).where(eq(template.id, testTemplate.id));
  await db.delete(member).where(eq(member.id, testOwnerMember.id));
  await db.delete(member).where(eq(member.id, testRegularMember.id));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrganization.id));
  await db
    .delete(subscription)
    .where(eq(subscription.id, `sub_test_workflows_${testOrganization.id}`));
  await db.delete(contact).where(eq(contact.id, testContact.id));
  await db.delete(contact).where(eq(contact.id, testContact2.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
  await db.delete(user).where(eq(user.id, testMemberUser.id));
});

describe("Workflows Server Actions", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // createWorkflow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("createWorkflow", () => {
    it("should create a new workflow with default trigger", async () => {
      const result = await createWorkflow(testOrganization.id, {
        name: "Welcome Flow",
        description: "Sends welcome emails",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.name).toBe("Welcome Flow");
        expect(result.workflow.description).toBe("Sends welcome emails");
        expect(result.workflow.status).toBe("draft");
        expect(result.workflow.triggerType).toBe("event");
        expect(result.workflow.steps).toBeDefined();
        expect((result.workflow.steps as WorkflowStep[]).length).toBe(1);
        expect((result.workflow.steps as WorkflowStep[])[0].type).toBe(
          "trigger"
        );
      }
    });

    it("should reject empty name", async () => {
      const result = await createWorkflow(testOrganization.id, {
        name: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("required");
      }
    });

    it("should reject whitespace-only name", async () => {
      const result = await createWorkflow(testOrganization.id, {
        name: "   ",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("required");
      }
    });

    it("should trim name and description", async () => {
      const result = await createWorkflow(testOrganization.id, {
        name: "  Trimmed Name  ",
        description: "  Trimmed description  ",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.name).toBe("Trimmed Name");
        expect(result.workflow.description).toBe("Trimmed description");
      }
    });

    it("should deny access for non-members", async () => {
      currentMockUserId = "non-existent-user";

      const result = await createWorkflow(testOrganization.id, {
        name: "Unauthorized Workflow",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("access");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // listWorkflows
  // ═══════════════════════════════════════════════════════════════════════════

  describe("listWorkflows", () => {
    beforeEach(async () => {
      await createWorkflow(testOrganization.id, { name: "Workflow A" });
      await createWorkflow(testOrganization.id, { name: "Workflow B" });
      await createWorkflow(testOrganization.id, { name: "Workflow C" });
    });

    it("should list all workflows", async () => {
      const result = await listWorkflows(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflows).toHaveLength(3);
        expect(result.total).toBe(3);
      }
    });

    it("should paginate results", async () => {
      const result = await listWorkflows(testOrganization.id, {
        page: 1,
        pageSize: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflows).toHaveLength(2);
        expect(result.total).toBe(3);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(2);
      }
    });

    it("should search workflows by name", async () => {
      const result = await listWorkflows(testOrganization.id, {
        search: "Workflow A",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflows).toHaveLength(1);
        expect(result.workflows[0].name).toBe("Workflow A");
      }
    });

    it("should filter by status", async () => {
      // Enable one workflow first
      const listResult = await listWorkflows(testOrganization.id);
      if (!listResult.success) {
        return;
      }

      // Add action step, awsAccountId, defaultFrom, and enable
      const wf = listResult.workflows[0];
      await updateWorkflow(wf.id, testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        defaultFrom: "test@example.com",
        triggerConfig: { eventName: "signup" },
        steps: [
          ...(wf.steps as WorkflowStep[]),
          {
            id: "action-1",
            type: "send_email",
            name: "Send Email",
            position: { x: 100, y: 200 },
            config: { type: "send_email", templateId: testTemplate.id },
          },
        ],
        transitions: [
          {
            id: "trans-1",
            fromStepId: (wf.steps as WorkflowStep[])[0].id,
            toStepId: "action-1",
          },
        ],
      });
      await enableWorkflow(wf.id, testOrganization.id);

      // Filter by enabled status
      const result = await listWorkflows(testOrganization.id, {
        status: "enabled",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflows).toHaveLength(1);
        expect(result.workflows[0].status).toBe("enabled");
      }
    });

    it("should allow regular members to list workflows", async () => {
      currentMockUserId = testMemberUser.id;

      const result = await listWorkflows(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflows).toHaveLength(3);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getWorkflow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("getWorkflow", () => {
    it("should get workflow by ID", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Get Test Workflow",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await getWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.name).toBe("Get Test Workflow");
      }
    });

    it("should return error for non-existent workflow", async () => {
      const result = await getWorkflow("non-existent-id", testOrganization.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should include createdByUser info", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "User Info Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await getWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.createdByUser).toBeDefined();
        expect(result.workflow.createdByUser?.email).toBe(testUser.email);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateWorkflow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateWorkflow", () => {
    it("should update workflow name", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Old Name",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateWorkflow(
        createResult.workflow.id,
        testOrganization.id,
        { name: "New Name" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.name).toBe("New Name");
      }
    });

    it("should update trigger type and config", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Trigger Update Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateWorkflow(
        createResult.workflow.id,
        testOrganization.id,
        {
          triggerType: "segment_entry",
          triggerConfig: { segmentId: "seg-123" },
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.triggerType).toBe("segment_entry");
        expect(result.workflow.triggerConfig).toEqual({ segmentId: "seg-123" });
      }
    });

    it("should update steps and transitions", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Steps Update Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const newSteps: WorkflowStep[] = [
        {
          id: "trigger-1",
          type: "trigger",
          name: "Entry",
          position: { x: 100, y: 50 },
          config: { type: "trigger", triggerType: "event" },
        },
        {
          id: "email-1",
          type: "send_email",
          name: "Welcome",
          position: { x: 100, y: 200 },
          config: { type: "send_email", templateId: "tmpl-1" },
        },
      ];

      const newTransitions: WorkflowTransition[] = [
        {
          id: "trans-1",
          fromStepId: "trigger-1",
          toStepId: "email-1",
        },
      ];

      const result = await updateWorkflow(
        createResult.workflow.id,
        testOrganization.id,
        { steps: newSteps, transitions: newTransitions }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.workflow.steps as WorkflowStep[]).length).toBe(2);
        expect(
          (result.workflow.transitions as WorkflowTransition[]).length
        ).toBe(1);
      }
    });

    it("should reject empty name", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Name Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateWorkflow(
        createResult.workflow.id,
        testOrganization.id,
        { name: "" }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("required");
      }
    });

    it("should reject invalid workflow definition", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Invalid Definition Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // No trigger node
      const invalidSteps: WorkflowStep[] = [
        {
          id: "email-1",
          type: "send_email",
          name: "Email",
          position: { x: 100, y: 100 },
          config: { type: "send_email", templateId: "tmpl-1" },
        },
      ];

      const result = await updateWorkflow(
        createResult.workflow.id,
        testOrganization.id,
        { steps: invalidSteps }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("trigger");
      }
    });

    it("should reject transition to non-existent step", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Invalid Transition Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const steps: WorkflowStep[] = [
        {
          id: "trigger-1",
          type: "trigger",
          name: "Entry",
          position: { x: 100, y: 50 },
          config: { type: "trigger", triggerType: "event" },
        },
      ];

      const invalidTransitions: WorkflowTransition[] = [
        {
          id: "trans-1",
          fromStepId: "trigger-1",
          toStepId: "non-existent-step",
        },
      ];

      const result = await updateWorkflow(
        createResult.workflow.id,
        testOrganization.id,
        { steps, transitions: invalidTransitions }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("unknown step");
      }
    });

    it("should return error for non-existent workflow", async () => {
      const result = await updateWorkflow(
        "non-existent-id",
        testOrganization.id,
        { name: "Test" }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // enableWorkflow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("enableWorkflow", () => {
    it("should enable a valid workflow", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Enable Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Add required config including awsAccountId, defaultFrom, and real template
      await updateWorkflow(createResult.workflow.id, testOrganization.id, {
        triggerConfig: { eventName: "signup" },
        awsAccountId: testAwsAccount.id,
        defaultFrom: "test@example.com",
        steps: [
          ...(createResult.workflow.steps as WorkflowStep[]),
          {
            id: "action-1",
            type: "send_email",
            name: "Welcome",
            position: { x: 100, y: 200 },
            config: { type: "send_email", templateId: testTemplate.id },
          },
        ],
        transitions: [
          {
            id: "trans-1",
            fromStepId: (createResult.workflow.steps as WorkflowStep[])[0].id,
            toStepId: "action-1",
          },
        ],
      });

      const result = await enableWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.status).toBe("enabled");
      }
    });

    it("should reject enabling workflow without AWS account", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "No AWS Account Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Try to enable without awsAccountId
      const result = await enableWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/AWS account/i);
      }
    });

    it("should reject enabling workflow without trigger", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "No Trigger Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Set AWS account but no eventName or action step
      await updateWorkflow(createResult.workflow.id, testOrganization.id, {
        awsAccountId: testAwsAccount.id,
      });

      const result = await enableWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/action|event/i);
      }
    });

    it("should reject enabling workflow without action step", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "No Action Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Add awsAccountId and event name but no action step
      await updateWorkflow(createResult.workflow.id, testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        triggerConfig: { eventName: "signup" },
      });

      const result = await enableWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("action step");
      }
    });

    it("should reject enabling event trigger without eventName", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "No Event Name Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Add awsAccountId and action step but no eventName
      await updateWorkflow(createResult.workflow.id, testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        steps: [
          ...(createResult.workflow.steps as WorkflowStep[]),
          {
            id: "action-1",
            type: "send_email",
            name: "Email",
            position: { x: 100, y: 200 },
            config: { type: "send_email", templateId: "tmpl-1" },
          },
        ],
        transitions: [
          {
            id: "trans-1",
            fromStepId: (createResult.workflow.steps as WorkflowStep[])[0].id,
            toStepId: "action-1",
          },
        ],
      });

      const result = await enableWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("event name");
      }
    });

    it("should return error for non-existent workflow", async () => {
      const result = await enableWorkflow(
        "non-existent-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // disableWorkflow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("disableWorkflow", () => {
    it("should disable an enabled workflow", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Disable Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Set up and enable with awsAccountId
      await updateWorkflow(createResult.workflow.id, testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        triggerConfig: { eventName: "signup" },
        steps: [
          ...(createResult.workflow.steps as WorkflowStep[]),
          {
            id: "action-1",
            type: "send_email",
            name: "Email",
            position: { x: 100, y: 200 },
            config: { type: "send_email", templateId: "tmpl-1" },
          },
        ],
        transitions: [
          {
            id: "trans-1",
            fromStepId: (createResult.workflow.steps as WorkflowStep[])[0].id,
            toStepId: "action-1",
          },
        ],
      });
      await enableWorkflow(createResult.workflow.id, testOrganization.id);

      // Disable
      const result = await disableWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.status).toBe("paused");
      }
    });

    it("should return error for non-existent workflow", async () => {
      const result = await disableWorkflow(
        "non-existent-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteWorkflow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("deleteWorkflow", () => {
    it("should delete a workflow", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "To Delete",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await deleteWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);

      // Verify deleted
      const getResult = await getWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );
      expect(getResult.success).toBe(false);
    });

    it("should reject deletion with active executions", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Has Active Executions",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Create a contact for the execution (foreign key)
      const testContactId = "test-workflow-execution-contact";
      await db.insert(contact).values({
        id: testContactId,
        organizationId: testOrganization.id,
        email: "execution-test@example.com",
        emailHash: "exec-hash-123",
        status: "active",
        properties: {},
        emailsSent: 0,
        emailsOpened: 0,
        emailsClicked: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create an active execution
      await db.insert(workflowExecution).values({
        id: "test-execution-1",
        workflowId: createResult.workflow.id,
        organizationId: testOrganization.id,
        contactId: testContactId,
        status: "active",
        currentStepId: "step-1",
        context: {},
        startedAt: new Date(),
      });

      const result = await deleteWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("active execution");
      }

      // Clean up
      await db
        .delete(workflowExecution)
        .where(eq(workflowExecution.id, "test-execution-1"));
      await db.delete(contact).where(eq(contact.id, testContactId));
    });

    it("should return error for non-existent workflow", async () => {
      const result = await deleteWorkflow(
        "non-existent-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // duplicateWorkflow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("duplicateWorkflow", () => {
    it("should duplicate a workflow", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Original Workflow",
        description: "Original description",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Add some steps
      await updateWorkflow(createResult.workflow.id, testOrganization.id, {
        triggerConfig: { eventName: "signup" },
        steps: [
          ...(createResult.workflow.steps as WorkflowStep[]),
          {
            id: "delay-1",
            type: "delay",
            name: "Wait 1 Day",
            position: { x: 100, y: 200 },
            config: { type: "delay", amount: 1, unit: "days" },
          },
        ],
        transitions: [
          {
            id: "trans-1",
            fromStepId: (createResult.workflow.steps as WorkflowStep[])[0].id,
            toStepId: "delay-1",
          },
        ],
      });

      const result = await duplicateWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.name).toBe("Original Workflow (copy)");
        expect(result.workflow.description).toBe("Original description");
        expect(result.workflow.status).toBe("draft");
        expect(result.workflow.id).not.toBe(createResult.workflow.id);
        // Steps should have new IDs
        const originalStepIds = (
          createResult.workflow.steps as WorkflowStep[]
        ).map((s) => s.id);
        const duplicateStepIds = (result.workflow.steps as WorkflowStep[]).map(
          (s) => s.id
        );
        expect(
          originalStepIds.some((id) => duplicateStepIds.includes(id))
        ).toBe(false);
      }
    });

    it("should return error for non-existent workflow", async () => {
      const result = await duplicateWorkflow(
        "non-existent-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should duplicate enabled workflow as draft", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Enabled Original",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Enable the original with awsAccountId
      await updateWorkflow(createResult.workflow.id, testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        triggerConfig: { eventName: "signup" },
        steps: [
          ...(createResult.workflow.steps as WorkflowStep[]),
          {
            id: "action-1",
            type: "send_email",
            name: "Email",
            position: { x: 100, y: 200 },
            config: { type: "send_email", templateId: "tmpl-1" },
          },
        ],
        transitions: [
          {
            id: "trans-1",
            fromStepId: (createResult.workflow.steps as WorkflowStep[])[0].id,
            toStepId: "action-1",
          },
        ],
      });
      await enableWorkflow(createResult.workflow.id, testOrganization.id);

      const result = await duplicateWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.status).toBe("draft");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getWorkflowStats
  // ═══════════════════════════════════════════════════════════════════════════

  describe("getWorkflowStats", () => {
    it("should return stats for workflow", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Stats Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await getWorkflowStats(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stats.total).toBe(0);
        expect(result.stats.active).toBe(0);
        expect(result.stats.completed).toBe(0);
        expect(result.stats.failed).toBe(0);
      }
    });

    it("should return error for non-existent workflow", async () => {
      const result = await getWorkflowStats(
        "non-existent-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Access Control
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Access Control", () => {
    it("should deny access for non-members", async () => {
      currentMockUserId = "non-existent-user";

      const result = await listWorkflows(testOrganization.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("access");
      }
    });

    it("should allow regular members to read workflows", async () => {
      // Create as owner
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Read Access Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Switch to member
      currentMockUserId = testMemberUser.id;

      const result = await getWorkflow(
        createResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
    });

    it("should allow regular members to create workflows", async () => {
      currentMockUserId = testMemberUser.id;

      const result = await createWorkflow(testOrganization.id, {
        name: "Member Created Workflow",
      });

      expect(result.success).toBe(true);
    });

    it("should allow regular members to update workflows", async () => {
      const createResult = await createWorkflow(testOrganization.id, {
        name: "Update Access Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      currentMockUserId = testMemberUser.id;

      const result = await updateWorkflow(
        createResult.workflow.id,
        testOrganization.id,
        { name: "Updated by Member" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workflow.name).toBe("Updated by Member");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // listWorkflowExecutions
  // ═══════════════════════════════════════════════════════════════════════════

  describe("listWorkflowExecutions", () => {
    it("should return paginated executions with contact info, scoped by org", async () => {
      // Create a workflow
      const wfResult = await createWorkflow(testOrganization.id, {
        name: "Execution List Test",
      });
      expect(wfResult.success).toBe(true);
      if (!wfResult.success) return;

      // Insert executions directly
      await db.insert(workflowExecution).values([
        {
          workflowId: wfResult.workflow.id,
          contactId: testContact.id,
          organizationId: testOrganization.id,
          status: "completed",
          startedAt: new Date("2026-03-01"),
          completedAt: new Date("2026-03-01T00:01:00"),
        },
        {
          workflowId: wfResult.workflow.id,
          contactId: testContact2.id,
          organizationId: testOrganization.id,
          status: "failed",
          error: "Template not found",
          startedAt: new Date("2026-03-02"),
        },
      ]);

      const result = await listWorkflowExecutions(
        wfResult.workflow.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.executions.length).toBe(2);
      expect(result.total).toBe(2);

      // Should include contact info
      const exec = result.executions.find(
        (e) => e.contactId === testContact.id
      );
      expect(exec).toBeDefined();
      expect(exec?.contact?.email).toBe("contact@example.com");
      expect(exec?.contact?.firstName).toBe("Jane");
    });

    it("should filter by status when provided", async () => {
      const wfResult = await createWorkflow(testOrganization.id, {
        name: "Execution Filter Test",
      });
      expect(wfResult.success).toBe(true);
      if (!wfResult.success) return;

      await db.insert(workflowExecution).values([
        {
          workflowId: wfResult.workflow.id,
          contactId: testContact.id,
          organizationId: testOrganization.id,
          status: "completed",
          startedAt: new Date("2026-03-01"),
          completedAt: new Date("2026-03-01T00:01:00"),
        },
        {
          workflowId: wfResult.workflow.id,
          contactId: testContact2.id,
          organizationId: testOrganization.id,
          status: "failed",
          error: "Something went wrong",
          startedAt: new Date("2026-03-02"),
        },
      ]);

      const result = await listWorkflowExecutions(
        wfResult.workflow.id,
        testOrganization.id,
        { status: "failed" }
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.executions.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.executions[0]!.status).toBe("failed");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getWorkflowExecution
  // ═══════════════════════════════════════════════════════════════════════════

  describe("getWorkflowExecution", () => {
    it("should return execution with step executions ordered by startedAt", async () => {
      const wfResult = await createWorkflow(testOrganization.id, {
        name: "Execution Detail Test",
      });
      expect(wfResult.success).toBe(true);
      if (!wfResult.success) return;

      // Insert execution
      const [exec] = await db
        .insert(workflowExecution)
        .values({
          workflowId: wfResult.workflow.id,
          contactId: testContact.id,
          organizationId: testOrganization.id,
          status: "completed",
          startedAt: new Date("2026-03-01T00:00:00"),
          completedAt: new Date("2026-03-01T00:01:00"),
        })
        .returning();

      // Insert step executions in reverse order to test ordering
      await db.insert(workflowStepExecution).values([
        {
          executionId: exec!.id,
          stepId: "step-2",
          stepType: "send_email",
          status: "completed",
          idempotencyKey: `${exec!.id}-step-2`,
          startedAt: new Date("2026-03-01T00:00:30"),
          completedAt: new Date("2026-03-01T00:00:45"),
        },
        {
          executionId: exec!.id,
          stepId: "step-1",
          stepType: "trigger",
          status: "completed",
          idempotencyKey: `${exec!.id}-step-1`,
          startedAt: new Date("2026-03-01T00:00:00"),
          completedAt: new Date("2026-03-01T00:00:01"),
        },
      ]);

      const result = await getWorkflowExecution(exec!.id, testOrganization.id);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.execution.id).toBe(exec!.id);
      expect(result.execution.contact?.email).toBe("contact@example.com");

      // Step executions should be ordered by startedAt ascending
      expect(result.execution.stepExecutions.length).toBe(2);
      expect(result.execution.stepExecutions[0]!.stepId).toBe("step-1");
      expect(result.execution.stepExecutions[1]!.stepId).toBe("step-2");
    });

    it("should return error for execution in different org (IDOR prevention)", async () => {
      const wfResult = await createWorkflow(testOrganization.id, {
        name: "IDOR Test",
      });
      expect(wfResult.success).toBe(true);
      if (!wfResult.success) return;

      const [exec] = await db
        .insert(workflowExecution)
        .values({
          workflowId: wfResult.workflow.id,
          contactId: testContact.id,
          organizationId: testOrganization.id,
          status: "completed",
          startedAt: new Date("2026-03-01"),
        })
        .returning();

      // Try to access with a different org ID — verifyOrgAccess blocks first
      const result = await getWorkflowExecution(exec!.id, "different-org-id");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("don't have access");
      }
    });
  });
});
