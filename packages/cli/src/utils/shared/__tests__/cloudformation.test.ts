import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { findWrapsCloudFormationStacks } from "../cloudformation.js";

const cfnMock = mockClient(CloudFormationClient);

describe("findWrapsCloudFormationStacks", () => {
  beforeEach(() => {
    cfnMock.reset();
  });

  it("matches a live stack by name prefix", async () => {
    cfnMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: "wraps-email-infrastructure",
          StackStatus: "CREATE_COMPLETE",
          CreationTime: new Date(),
        },
      ],
    });

    const result = await findWrapsCloudFormationStacks("us-east-1");

    expect(result).toEqual({
      stacks: ["wraps-email-infrastructure"],
      checked: true,
    });
  });

  it("matches a live stack by ManagedBy tag when the name does not start with wraps-", async () => {
    cfnMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: "customer-chosen-stack-name",
          StackStatus: "UPDATE_COMPLETE",
          CreationTime: new Date(),
          Tags: [{ Key: "ManagedBy", Value: "wraps-cloudformation" }],
        },
      ],
    });

    const result = await findWrapsCloudFormationStacks("us-east-1");

    expect(result).toEqual({
      stacks: ["customer-chosen-stack-name"],
      checked: true,
    });
  });

  it("ignores a stack that matches neither the name prefix nor the tag", async () => {
    cfnMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: "some-other-app",
          StackStatus: "CREATE_COMPLETE",
          CreationTime: new Date(),
        },
      ],
    });

    const result = await findWrapsCloudFormationStacks("us-east-1");

    expect(result).toEqual({ stacks: [], checked: true });
  });

  it("ignores a deleted wraps-* stack", async () => {
    cfnMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: "wraps-email-infrastructure",
          StackStatus: "DELETE_COMPLETE",
          CreationTime: new Date(),
        },
      ],
    });

    const result = await findWrapsCloudFormationStacks("us-east-1");

    expect(result).toEqual({ stacks: [], checked: true });
  });

  it("follows pagination across multiple pages", async () => {
    cfnMock
      .on(DescribeStacksCommand)
      .resolvesOnce({
        Stacks: [
          {
            StackName: "wraps-email-page-one",
            StackStatus: "CREATE_COMPLETE",
            CreationTime: new Date(),
          },
        ],
        NextToken: "page-2",
      })
      .resolvesOnce({
        Stacks: [
          {
            StackName: "wraps-email-page-two",
            StackStatus: "CREATE_COMPLETE",
            CreationTime: new Date(),
          },
        ],
      });

    const result = await findWrapsCloudFormationStacks("us-east-1");

    expect(result.stacks).toEqual([
      "wraps-email-page-one",
      "wraps-email-page-two",
    ]);
    expect(result.checked).toBe(true);
    expect(cfnMock.calls()).toHaveLength(2);
  });

  it("reports unchecked, never empty, when the account lacks cloudformation:DescribeStacks", async () => {
    cfnMock
      .on(DescribeStacksCommand)
      .rejects(new Error("AccessDenied: cloudformation:DescribeStacks"));

    const result = await findWrapsCloudFormationStacks("us-east-1");

    expect(result).toEqual({ stacks: [], checked: false });
  });
});
