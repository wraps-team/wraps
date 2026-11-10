import {
  CreateReceiptRuleCommand,
  DescribeReceiptRuleCommand,
  SESClient,
  UpdateReceiptRuleCommand,
} from "@aws-sdk/client-ses";
import {
  CreateTopicCommand,
  DeleteTopicCommand,
  SetTopicAttributesCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addDomainToReceiptRule,
  createReceiptRule,
  deleteReceiptTopic,
  getReceiptTopicArn,
} from "../receipt-rules.js";

const sesMock = mockClient(SESClient);
const snsMock = mockClient(SNSClient);

const REGION = "eu-central-1";
const ACCOUNT = "123456789012";
const TOPIC_ARN = `arn:aws:sns:${REGION}:${ACCOUNT}:wraps-inbound-receipts`;
const BUCKET = `wraps-inbound-${ACCOUNT}-${REGION}`;

function ruleDoesNotExist(): Error {
  const error = new Error("Rule does not exist");
  error.name = "RuleDoesNotExistException";
  return error;
}

describe("receipt rule SNS topic", () => {
  beforeEach(() => {
    sesMock.reset();
    snsMock.reset();
    snsMock.on(CreateTopicCommand).resolves({ TopicArn: TOPIC_ARN });
    snsMock.on(SetTopicAttributesCommand).resolves({});
    snsMock.on(DeleteTopicCommand).resolves({});
    sesMock.on(CreateReceiptRuleCommand).resolves({});
    sesMock.on(UpdateReceiptRuleCommand).resolves({});
  });

  it("builds the topic ARN from fixed names", () => {
    expect(getReceiptTopicArn(REGION, ACCOUNT)).toBe(TOPIC_ARN);
  });

  it("publishes the receipt notification from the S3 action", async () => {
    sesMock.on(DescribeReceiptRuleCommand).rejects(ruleDoesNotExist());

    await createReceiptRule(REGION, "inbound.example.com", BUCKET);

    const calls = sesMock.commandCalls(CreateReceiptRuleCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Rule?.Actions).toEqual([
      {
        S3Action: {
          BucketName: BUCKET,
          ObjectKeyPrefix: "raw/",
          TopicArn: TOPIC_ARN,
        },
      },
    ]);
  });

  it("creates the topic before the rule that names it", async () => {
    sesMock.on(DescribeReceiptRuleCommand).rejects(ruleDoesNotExist());
    const order: string[] = [];
    snsMock.on(SetTopicAttributesCommand).callsFake(() => {
      order.push("policy");
      return {};
    });
    sesMock.on(CreateReceiptRuleCommand).callsFake(() => {
      order.push("rule");
      return {};
    });

    await createReceiptRule(REGION, "inbound.example.com", BUCKET);

    expect(order).toEqual(["policy", "rule"]);
  });

  it("lets only SES in this account's rule set publish to the topic", async () => {
    sesMock.on(DescribeReceiptRuleCommand).rejects(ruleDoesNotExist());

    await createReceiptRule(REGION, "inbound.example.com", BUCKET);

    const calls = snsMock.commandCalls(SetTopicAttributesCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.TopicArn).toBe(TOPIC_ARN);
    expect(input.AttributeName).toBe("Policy");
    expect(JSON.parse(input.AttributeValue ?? "")).toEqual({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowSESReceiptPublish",
          Effect: "Allow",
          Principal: { Service: "ses.amazonaws.com" },
          Action: "SNS:Publish",
          Resource: TOPIC_ARN,
          Condition: {
            StringEquals: { "AWS:SourceAccount": ACCOUNT },
            ArnLike: {
              "AWS:SourceArn": `arn:aws:ses:${REGION}:${ACCOUNT}:receipt-rule-set/wraps-inbound-rules:receipt-rule/*`,
            },
          },
        },
      ],
    });
  });

  it("keeps the topic on the action when a domain is added", async () => {
    const actions = [
      {
        S3Action: {
          BucketName: BUCKET,
          ObjectKeyPrefix: "raw/",
          TopicArn: TOPIC_ARN,
        },
      },
    ];
    sesMock.on(DescribeReceiptRuleCommand).resolves({
      Rule: {
        Name: "wraps-inbound-catch-all",
        Enabled: true,
        ScanEnabled: true,
        Recipients: ["inbound.example.com"],
        Actions: actions,
      },
    });

    await addDomainToReceiptRule(REGION, "support.example.com", BUCKET);

    const calls = sesMock.commandCalls(UpdateReceiptRuleCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Rule?.Actions).toEqual(actions);
    expect(calls[0].args[0].input.Rule?.Recipients).toEqual([
      "inbound.example.com",
      "support.example.com",
    ]);
  });

  it("deletes the topic by its fixed ARN", async () => {
    await deleteReceiptTopic(REGION, ACCOUNT);

    const calls = snsMock.commandCalls(DeleteTopicCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toEqual({ TopicArn: TOPIC_ARN });
  });
});
