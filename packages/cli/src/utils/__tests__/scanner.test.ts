import {
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import { IAMClient, ListRolesCommand } from "@aws-sdk/client-iam";
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";
import {
  DescribeConfigurationSetCommand,
  GetIdentityVerificationAttributesCommand,
  ListConfigurationSetsCommand,
  ListIdentitiesCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  GetTopicAttributesCommand,
  ListTopicsCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkWrapsResourcesExist,
  filterWrapsResources,
  scanAWSResources,
  scanDynamoTables,
  scanIAMRoles,
  scanLambdaFunctions,
  scanSESConfigurationSets,
  scanSESIdentities,
  scanSNSTopics,
} from "../scanner.js";

const sesMock = mockClient(SESClient);
const snsMock = mockClient(SNSClient);
const dynamoMock = mockClient(DynamoDBClient);
const lambdaMock = mockClient(LambdaClient);
const iamMock = mockClient(IAMClient);

describe("AWS Resource Scanner", () => {
  beforeEach(() => {
    sesMock.reset();
    snsMock.reset();
    dynamoMock.reset();
    lambdaMock.reset();
    iamMock.reset();
    vi.clearAllMocks();
  });

  describe("scanSESIdentities", () => {
    it("should return empty array when no identities exist", async () => {
      sesMock.on(ListIdentitiesCommand).resolves({ Identities: [] });

      const identities = await scanSESIdentities("us-east-1");

      expect(identities).toEqual([]);
    });

    it("should scan domain identities", async () => {
      sesMock
        .on(ListIdentitiesCommand)
        .resolves({ Identities: ["example.com", "test.com"] })
        .on(GetIdentityVerificationAttributesCommand)
        .resolves({
          VerificationAttributes: {
            "example.com": { VerificationStatus: "Success" },
            "test.com": { VerificationStatus: "Pending" },
          },
        });

      const identities = await scanSESIdentities("us-east-1");

      expect(identities).toHaveLength(2);
      expect(identities[0]).toEqual({
        name: "example.com",
        type: "Domain",
        verified: true,
      });
      expect(identities[1]).toEqual({
        name: "test.com",
        type: "Domain",
        verified: false,
      });
    });

    it("should scan email address identities", async () => {
      sesMock
        .on(ListIdentitiesCommand)
        .resolves({ Identities: ["user@example.com"] })
        .on(GetIdentityVerificationAttributesCommand)
        .resolves({
          VerificationAttributes: {
            "user@example.com": { VerificationStatus: "Success" },
          },
        });

      const identities = await scanSESIdentities("us-east-1");

      expect(identities).toHaveLength(1);
      expect(identities[0]).toEqual({
        name: "user@example.com",
        type: "EmailAddress",
        verified: true,
      });
    });

    it("should handle mixed domain and email identities", async () => {
      sesMock
        .on(ListIdentitiesCommand)
        .resolves({
          Identities: ["example.com", "admin@test.com", "test.com"],
        })
        .on(GetIdentityVerificationAttributesCommand)
        .resolves({
          VerificationAttributes: {
            "example.com": { VerificationStatus: "Success" },
            "admin@test.com": { VerificationStatus: "Success" },
            "test.com": { VerificationStatus: "Failed" },
          },
        });

      const identities = await scanSESIdentities("us-east-1");

      expect(identities).toHaveLength(3);
      expect(identities[0].type).toBe("Domain");
      expect(identities[1].type).toBe("EmailAddress");
      expect(identities[2].type).toBe("Domain");
    });

    it("should handle missing verification attributes", async () => {
      sesMock
        .on(ListIdentitiesCommand)
        .resolves({ Identities: ["example.com"] })
        .on(GetIdentityVerificationAttributesCommand)
        .resolves({ VerificationAttributes: {} });

      const identities = await scanSESIdentities("us-east-1");

      expect(identities).toHaveLength(1);
      expect(identities[0].verified).toBe(false);
    });

    it("should handle API errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      sesMock.on(ListIdentitiesCommand).rejects(new Error("API Error"));

      const identities = await scanSESIdentities("us-east-1");

      expect(identities).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("scanSESConfigurationSets", () => {
    it("should return empty array when no config sets exist", async () => {
      sesMock
        .on(ListConfigurationSetsCommand)
        .resolves({ ConfigurationSets: [] });

      const configSets = await scanSESConfigurationSets("us-east-1");

      expect(configSets).toEqual([]);
    });

    it("should scan configuration sets with event destinations", async () => {
      sesMock
        .on(ListConfigurationSetsCommand)
        .resolves({
          ConfigurationSets: [{ Name: "wraps-email-tracking" }],
        })
        .on(DescribeConfigurationSetCommand)
        .resolves({
          EventDestinations: [
            {
              Name: "CloudWatch",
              Enabled: true,
              MatchingEventTypes: ["send", "delivery", "bounce"],
              CloudWatchDestination: { DimensionConfigurations: [] },
            },
          ],
        });

      const configSets = await scanSESConfigurationSets("us-east-1");

      expect(configSets).toHaveLength(1);
      expect(configSets[0].name).toBe("wraps-email-tracking");
      expect(configSets[0].eventDestinations).toHaveLength(1);
      expect(configSets[0].eventDestinations[0].name).toBe("CloudWatch");
      expect(configSets[0].eventDestinations[0].enabled).toBe(true);
    });

    it("should scan config sets with SNS destinations", async () => {
      sesMock
        .on(ListConfigurationSetsCommand)
        .resolves({
          ConfigurationSets: [{ Name: "email-notifications" }],
        })
        .on(DescribeConfigurationSetCommand)
        .resolves({
          EventDestinations: [
            {
              Name: "SNSDestination",
              Enabled: true,
              MatchingEventTypes: ["bounce", "complaint"],
              SNSDestination: {
                TopicARN: "arn:aws:sns:us-east-1:123456789012:email-events",
              },
            },
          ],
        });

      const configSets = await scanSESConfigurationSets("us-east-1");

      expect(configSets[0].eventDestinations[0].snsDestination).toBe(
        "arn:aws:sns:us-east-1:123456789012:email-events"
      );
    });

    it("should handle multiple config sets", async () => {
      sesMock
        .on(ListConfigurationSetsCommand)
        .resolves({
          ConfigurationSets: [{ Name: "config1" }, { Name: "config2" }],
        })
        .on(DescribeConfigurationSetCommand)
        .resolves({ EventDestinations: [] });

      const configSets = await scanSESConfigurationSets("us-east-1");

      expect(configSets).toHaveLength(2);
    });

    it("should handle errors in describe calls", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      sesMock
        .on(ListConfigurationSetsCommand)
        .resolves({
          ConfigurationSets: [{ Name: "config1" }],
        })
        .on(DescribeConfigurationSetCommand)
        .rejects(new Error("Access denied"));

      const configSets = await scanSESConfigurationSets("us-east-1");

      expect(configSets).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle list API errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      sesMock.on(ListConfigurationSetsCommand).rejects(new Error("API Error"));

      const configSets = await scanSESConfigurationSets("us-east-1");

      expect(configSets).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("scanSNSTopics", () => {
    it("should return empty array when no topics exist", async () => {
      snsMock.on(ListTopicsCommand).resolves({ Topics: [] });

      const topics = await scanSNSTopics("us-east-1");

      expect(topics).toEqual([]);
    });

    it("should scan SNS topics with attributes", async () => {
      snsMock
        .on(ListTopicsCommand)
        .resolves({
          Topics: [
            {
              TopicArn: "arn:aws:sns:us-east-1:123456789012:wraps-email-events",
            },
          ],
        })
        .on(GetTopicAttributesCommand)
        .resolves({
          Attributes: {
            SubscriptionsConfirmed: "5",
          },
        });

      const topics = await scanSNSTopics("us-east-1");

      expect(topics).toHaveLength(1);
      expect(topics[0].name).toBe("wraps-email-events");
      expect(topics[0].arn).toBe(
        "arn:aws:sns:us-east-1:123456789012:wraps-email-events"
      );
      expect(topics[0].subscriptions).toBe(5);
    });

    it("should handle topics with zero subscriptions", async () => {
      snsMock
        .on(ListTopicsCommand)
        .resolves({
          Topics: [
            { TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic" },
          ],
        })
        .on(GetTopicAttributesCommand)
        .resolves({
          Attributes: {
            SubscriptionsConfirmed: "0",
          },
        });

      const topics = await scanSNSTopics("us-east-1");

      expect(topics[0].subscriptions).toBe(0);
    });

    it("should handle multiple topics", async () => {
      snsMock
        .on(ListTopicsCommand)
        .resolves({
          Topics: [
            { TopicArn: "arn:aws:sns:us-east-1:123456789012:topic1" },
            { TopicArn: "arn:aws:sns:us-east-1:123456789012:topic2" },
          ],
        })
        .on(GetTopicAttributesCommand)
        .resolves({
          Attributes: { SubscriptionsConfirmed: "0" },
        });

      const topics = await scanSNSTopics("us-east-1");

      expect(topics).toHaveLength(2);
    });

    it("should handle errors in get attributes calls", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      snsMock
        .on(ListTopicsCommand)
        .resolves({
          Topics: [
            { TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic" },
          ],
        })
        .on(GetTopicAttributesCommand)
        .rejects(new Error("Access denied"));

      const topics = await scanSNSTopics("us-east-1");

      expect(topics).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle list API errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      snsMock.on(ListTopicsCommand).rejects(new Error("API Error"));

      const topics = await scanSNSTopics("us-east-1");

      expect(topics).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("scanDynamoTables", () => {
    it("should return empty array when no tables exist", async () => {
      dynamoMock.on(ListTablesCommand).resolves({ TableNames: [] });

      const tables = await scanDynamoTables("us-east-1");

      expect(tables).toEqual([]);
    });

    it("should scan DynamoDB tables with details", async () => {
      dynamoMock
        .on(ListTablesCommand)
        .resolves({ TableNames: ["wraps-email-history"] })
        .on(DescribeTableCommand)
        .resolves({
          Table: {
            TableName: "wraps-email-history",
            TableStatus: "ACTIVE",
            ItemCount: 1500,
            TableSizeBytes: 524_288,
          },
        });

      const tables = await scanDynamoTables("us-east-1");

      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe("wraps-email-history");
      expect(tables[0].status).toBe("ACTIVE");
      expect(tables[0].itemCount).toBe(1500);
      expect(tables[0].sizeBytes).toBe(524_288);
    });

    it("should handle tables with CREATING status", async () => {
      dynamoMock
        .on(ListTablesCommand)
        .resolves({ TableNames: ["new-table"] })
        .on(DescribeTableCommand)
        .resolves({
          Table: {
            TableName: "new-table",
            TableStatus: "CREATING",
          },
        });

      const tables = await scanDynamoTables("us-east-1");

      expect(tables[0].status).toBe("CREATING");
    });

    it("should handle multiple tables", async () => {
      dynamoMock
        .on(ListTablesCommand)
        .resolves({ TableNames: ["table1", "table2", "table3"] })
        .on(DescribeTableCommand)
        .resolves({
          Table: {
            TableStatus: "ACTIVE",
          },
        });

      const tables = await scanDynamoTables("us-east-1");

      expect(tables).toHaveLength(3);
    });

    it("should handle errors in describe calls", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      dynamoMock
        .on(ListTablesCommand)
        .resolves({ TableNames: ["table1"] })
        .on(DescribeTableCommand)
        .rejects(new Error("Table not found"));

      const tables = await scanDynamoTables("us-east-1");

      expect(tables).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle list API errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      dynamoMock.on(ListTablesCommand).rejects(new Error("API Error"));

      const tables = await scanDynamoTables("us-east-1");

      expect(tables).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("scanLambdaFunctions", () => {
    it("should return empty array when no functions exist", async () => {
      lambdaMock.on(ListFunctionsCommand).resolves({ Functions: [] });

      const functions = await scanLambdaFunctions("us-east-1");

      expect(functions).toEqual([]);
    });

    it("should scan Lambda functions with details", async () => {
      lambdaMock.on(ListFunctionsCommand).resolves({
        Functions: [
          {
            FunctionName: "wraps-email-processor",
            FunctionArn:
              "arn:aws:lambda:us-east-1:123456789012:function:wraps-email-processor",
            Runtime: "nodejs20.x",
            Handler: "index.handler",
          },
        ],
      });

      const functions = await scanLambdaFunctions("us-east-1");

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe("wraps-email-processor");
      expect(functions[0].arn).toBe(
        "arn:aws:lambda:us-east-1:123456789012:function:wraps-email-processor"
      );
      expect(functions[0].runtime).toBe("nodejs20.x");
      expect(functions[0].handler).toBe("index.handler");
    });

    it("should handle functions without runtime/handler", async () => {
      lambdaMock.on(ListFunctionsCommand).resolves({
        Functions: [
          {
            FunctionName: "test-function",
            FunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:test",
          },
        ],
      });

      const functions = await scanLambdaFunctions("us-east-1");

      expect(functions).toHaveLength(1);
      expect(functions[0].runtime).toBeUndefined();
      expect(functions[0].handler).toBeUndefined();
    });

    it("should handle multiple functions", async () => {
      lambdaMock.on(ListFunctionsCommand).resolves({
        Functions: [
          {
            FunctionName: "func1",
            FunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:func1",
          },
          {
            FunctionName: "func2",
            FunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:func2",
          },
        ],
      });

      const functions = await scanLambdaFunctions("us-east-1");

      expect(functions).toHaveLength(2);
    });

    it("should skip functions without name or ARN", async () => {
      lambdaMock.on(ListFunctionsCommand).resolves({
        Functions: [
          {
            FunctionName: "valid-function",
            FunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:valid",
          },
          {
            // Missing FunctionArn
            FunctionName: "invalid-function",
          },
        ],
      });

      const functions = await scanLambdaFunctions("us-east-1");

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe("valid-function");
    });

    it("should handle API errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      lambdaMock.on(ListFunctionsCommand).rejects(new Error("API Error"));

      const functions = await scanLambdaFunctions("us-east-1");

      expect(functions).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("scanIAMRoles", () => {
    it("should return empty array when no roles exist", async () => {
      iamMock.on(ListRolesCommand).resolves({ Roles: [], IsTruncated: false });

      const roles = await scanIAMRoles("us-east-1");

      expect(roles).toEqual([]);
    });

    it("should scan IAM roles with details", async () => {
      iamMock.on(ListRolesCommand).resolves({
        Roles: [
          {
            RoleName: "wraps-email-role",
            Arn: "arn:aws:iam::123456789012:role/wraps-email-role",
            AssumeRolePolicyDocument: '{"Version":"2012-10-17"}',
          },
        ],
        IsTruncated: false,
      });

      const roles = await scanIAMRoles("us-east-1");

      expect(roles).toHaveLength(1);
      expect(roles[0].name).toBe("wraps-email-role");
      expect(roles[0].arn).toBe(
        "arn:aws:iam::123456789012:role/wraps-email-role"
      );
      expect(roles[0].assumeRolePolicyDocument).toBe(
        '{"Version":"2012-10-17"}'
      );
    });

    it("should handle pagination", async () => {
      iamMock
        .on(ListRolesCommand, { Marker: undefined })
        .resolves({
          Roles: [
            {
              RoleName: "role1",
              Arn: "arn:aws:iam::123456789012:role/role1",
              AssumeRolePolicyDocument: "{}",
            },
          ],
          Marker: "marker1",
          IsTruncated: true,
        })
        .on(ListRolesCommand, { Marker: "marker1" })
        .resolves({
          Roles: [
            {
              RoleName: "role2",
              Arn: "arn:aws:iam::123456789012:role/role2",
              AssumeRolePolicyDocument: "{}",
            },
          ],
          IsTruncated: false,
        });

      const roles = await scanIAMRoles("us-east-1");

      expect(roles).toHaveLength(2);
      expect(roles[0].name).toBe("role1");
      expect(roles[1].name).toBe("role2");
    });

    it("should handle roles without assume role policy", async () => {
      iamMock.on(ListRolesCommand).resolves({
        Roles: [
          {
            RoleName: "test-role",
            Arn: "arn:aws:iam::123456789012:role/test-role",
          },
        ],
        IsTruncated: false,
      });

      const roles = await scanIAMRoles("us-east-1");

      expect(roles[0].assumeRolePolicyDocument).toBe("");
    });

    it("should skip roles without name or ARN", async () => {
      iamMock.on(ListRolesCommand).resolves({
        Roles: [
          {
            RoleName: "valid-role",
            Arn: "arn:aws:iam::123456789012:role/valid-role",
          },
          {
            // Missing Arn
            RoleName: "invalid-role",
          },
        ],
        IsTruncated: false,
      });

      const roles = await scanIAMRoles("us-east-1");

      expect(roles).toHaveLength(1);
      expect(roles[0].name).toBe("valid-role");
    });

    it("should handle API errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      iamMock.on(ListRolesCommand).rejects(new Error("API Error"));

      const roles = await scanIAMRoles("us-east-1");

      expect(roles).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("scanAWSResources", () => {
    it("should scan all resource types in parallel", async () => {
      // Setup mocks for all resource types
      sesMock
        .on(ListIdentitiesCommand)
        .resolves({ Identities: ["example.com"] })
        .on(GetIdentityVerificationAttributesCommand)
        .resolves({
          VerificationAttributes: {
            "example.com": { VerificationStatus: "Success" },
          },
        })
        .on(ListConfigurationSetsCommand)
        .resolves({ ConfigurationSets: [{ Name: "wraps-tracking" }] })
        .on(DescribeConfigurationSetCommand)
        .resolves({ EventDestinations: [] });

      snsMock
        .on(ListTopicsCommand)
        .resolves({
          Topics: [
            { TopicArn: "arn:aws:sns:us-east-1:123456789012:wraps-events" },
          ],
        })
        .on(GetTopicAttributesCommand)
        .resolves({ Attributes: { SubscriptionsConfirmed: "0" } });

      dynamoMock
        .on(ListTablesCommand)
        .resolves({ TableNames: ["wraps-email-history"] })
        .on(DescribeTableCommand)
        .resolves({
          Table: { TableStatus: "ACTIVE" },
        });

      lambdaMock.on(ListFunctionsCommand).resolves({
        Functions: [
          {
            FunctionName: "wraps-processor",
            FunctionArn:
              "arn:aws:lambda:us-east-1:123456789012:function:wraps-processor",
          },
        ],
      });

      iamMock.on(ListRolesCommand).resolves({
        Roles: [
          {
            RoleName: "wraps-email-role",
            Arn: "arn:aws:iam::123456789012:role/wraps-email-role",
          },
        ],
        IsTruncated: false,
      });

      const scan = await scanAWSResources("us-east-1");

      expect(scan.identities).toHaveLength(1);
      expect(scan.configurationSets).toHaveLength(1);
      expect(scan.snsTopics).toHaveLength(1);
      expect(scan.dynamoTables).toHaveLength(1);
      expect(scan.lambdaFunctions).toHaveLength(1);
      expect(scan.iamRoles).toHaveLength(1);
    });

    it("should handle empty results from all scanners", async () => {
      sesMock
        .on(ListIdentitiesCommand)
        .resolves({ Identities: [] })
        .on(ListConfigurationSetsCommand)
        .resolves({ ConfigurationSets: [] });

      snsMock.on(ListTopicsCommand).resolves({ Topics: [] });
      dynamoMock.on(ListTablesCommand).resolves({ TableNames: [] });
      lambdaMock.on(ListFunctionsCommand).resolves({ Functions: [] });
      iamMock.on(ListRolesCommand).resolves({ Roles: [], IsTruncated: false });

      const scan = await scanAWSResources("us-east-1");

      expect(scan.identities).toEqual([]);
      expect(scan.configurationSets).toEqual([]);
      expect(scan.snsTopics).toEqual([]);
      expect(scan.dynamoTables).toEqual([]);
      expect(scan.lambdaFunctions).toEqual([]);
      expect(scan.iamRoles).toEqual([]);
    });
  });

  describe("filterWrapsResources", () => {
    it("should filter resources with wraps- prefix", () => {
      const scan = {
        identities: [
          { name: "example.com", type: "Domain" as const, verified: true },
        ],
        configurationSets: [
          { name: "wraps-tracking", eventDestinations: [] },
          { name: "other-config", eventDestinations: [] },
        ],
        snsTopics: [
          { arn: "arn1", name: "wraps-events", subscriptions: 0 },
          { arn: "arn2", name: "other-topic", subscriptions: 0 },
        ],
        dynamoTables: [
          { name: "wraps-email-history", status: "ACTIVE" },
          { name: "other-table", status: "ACTIVE" },
        ],
        lambdaFunctions: [
          { name: "wraps-processor", arn: "arn1" },
          { name: "other-function", arn: "arn2" },
        ],
        iamRoles: [
          {
            name: "wraps-email-role",
            arn: "arn1",
            assumeRolePolicyDocument: "",
          },
          { name: "other-role", arn: "arn2", assumeRolePolicyDocument: "" },
        ],
      };

      const filtered = filterWrapsResources(scan);

      expect(filtered.identities).toHaveLength(1); // All identities included
      expect(filtered.configurationSets).toHaveLength(1);
      expect(filtered.configurationSets[0].name).toBe("wraps-tracking");
      expect(filtered.snsTopics).toHaveLength(1);
      expect(filtered.snsTopics[0].name).toBe("wraps-events");
      expect(filtered.dynamoTables).toHaveLength(1);
      expect(filtered.dynamoTables[0].name).toBe("wraps-email-history");
      expect(filtered.lambdaFunctions).toHaveLength(1);
      expect(filtered.lambdaFunctions[0].name).toBe("wraps-processor");
      expect(filtered.iamRoles).toHaveLength(1);
      expect(filtered.iamRoles[0].name).toBe("wraps-email-role");
    });

    it("should include all identities regardless of prefix", () => {
      const scan = {
        identities: [
          { name: "example.com", type: "Domain" as const, verified: true },
          { name: "test.com", type: "Domain" as const, verified: false },
        ],
        configurationSets: [],
        snsTopics: [],
        dynamoTables: [],
        lambdaFunctions: [],
        iamRoles: [],
      };

      const filtered = filterWrapsResources(scan);

      expect(filtered.identities).toHaveLength(2);
    });

    it("should return empty arrays when no wraps- resources exist", () => {
      const scan = {
        identities: [],
        configurationSets: [{ name: "other-config", eventDestinations: [] }],
        snsTopics: [{ arn: "arn1", name: "other-topic", subscriptions: 0 }],
        dynamoTables: [{ name: "other-table", status: "ACTIVE" }],
        lambdaFunctions: [{ name: "other-function", arn: "arn1" }],
        iamRoles: [
          { name: "other-role", arn: "arn1", assumeRolePolicyDocument: "" },
        ],
      };

      const filtered = filterWrapsResources(scan);

      expect(filtered.configurationSets).toEqual([]);
      expect(filtered.snsTopics).toEqual([]);
      expect(filtered.dynamoTables).toEqual([]);
      expect(filtered.lambdaFunctions).toEqual([]);
      expect(filtered.iamRoles).toEqual([]);
    });
  });

  describe("checkWrapsResourcesExist", () => {
    it("should detect when all wraps resources exist", () => {
      const scan = {
        identities: [],
        configurationSets: [{ name: "wraps-tracking", eventDestinations: [] }],
        snsTopics: [{ arn: "arn1", name: "wraps-events", subscriptions: 0 }],
        dynamoTables: [{ name: "wraps-email-history", status: "ACTIVE" }],
        lambdaFunctions: [{ name: "wraps-processor", arn: "arn1" }],
        iamRoles: [
          {
            name: "wraps-email-role",
            arn: "arn1",
            assumeRolePolicyDocument: "",
          },
        ],
      };

      const exists = checkWrapsResourcesExist(scan);

      expect(exists.hasConfigSet).toBe(true);
      expect(exists.hasSNSTopics).toBe(true);
      expect(exists.hasDynamoTable).toBe(true);
      expect(exists.hasLambdaFunctions).toBe(true);
      expect(exists.hasIAMRole).toBe(true);
    });

    it("should detect when no wraps resources exist", () => {
      const scan = {
        identities: [],
        configurationSets: [{ name: "other-config", eventDestinations: [] }],
        snsTopics: [{ arn: "arn1", name: "other-topic", subscriptions: 0 }],
        dynamoTables: [{ name: "other-table", status: "ACTIVE" }],
        lambdaFunctions: [{ name: "other-function", arn: "arn1" }],
        iamRoles: [
          { name: "other-role", arn: "arn1", assumeRolePolicyDocument: "" },
        ],
      };

      const exists = checkWrapsResourcesExist(scan);

      expect(exists.hasConfigSet).toBe(false);
      expect(exists.hasSNSTopics).toBe(false);
      expect(exists.hasDynamoTable).toBe(false);
      expect(exists.hasLambdaFunctions).toBe(false);
      expect(exists.hasIAMRole).toBe(false);
    });

    it("should detect partial wraps resources", () => {
      const scan = {
        identities: [],
        configurationSets: [{ name: "wraps-tracking", eventDestinations: [] }],
        snsTopics: [{ arn: "arn1", name: "other-topic", subscriptions: 0 }],
        dynamoTables: [{ name: "wraps-email-history", status: "ACTIVE" }],
        lambdaFunctions: [{ name: "other-function", arn: "arn1" }],
        iamRoles: [
          {
            name: "wraps-email-role",
            arn: "arn1",
            assumeRolePolicyDocument: "",
          },
        ],
      };

      const exists = checkWrapsResourcesExist(scan);

      expect(exists.hasConfigSet).toBe(true);
      expect(exists.hasSNSTopics).toBe(false);
      expect(exists.hasDynamoTable).toBe(true);
      expect(exists.hasLambdaFunctions).toBe(false);
      expect(exists.hasIAMRole).toBe(true);
    });

    it("should handle empty scan", () => {
      const scan = {
        identities: [],
        configurationSets: [],
        snsTopics: [],
        dynamoTables: [],
        lambdaFunctions: [],
        iamRoles: [],
      };

      const exists = checkWrapsResourcesExist(scan);

      expect(exists.hasConfigSet).toBe(false);
      expect(exists.hasSNSTopics).toBe(false);
      expect(exists.hasDynamoTable).toBe(false);
      expect(exists.hasLambdaFunctions).toBe(false);
      expect(exists.hasIAMRole).toBe(false);
    });
  });
});
