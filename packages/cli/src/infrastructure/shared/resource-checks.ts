/**
 * Shared resource existence checks for Pulumi import-vs-create decisions.
 *
 * These functions call the AWS SDK to determine whether a resource already
 * exists before Pulumi tries to create it, so we can `import` instead.
 *
 * Regional probes (DynamoDB, SQS, SNS, Lambda) take `region` as a required
 * parameter — never fall back to a default, or the probe will check the wrong
 * region and Pulumi will duplicate the resource.
 */

/** IAM's XML protocol can surface the error code on `Code` or `Error.Code`. */
type IamXmlError = Error & { Code?: string; Error?: { Code?: string } };

/**
 * Check if an IAM role exists by name.
 * IAM is global; region on the client is cosmetic, so we pin to us-east-1.
 */
export async function roleExists(roleName: string): Promise<boolean> {
  try {
    const { IAMClient, GetRoleCommand } = await import("@aws-sdk/client-iam");
    const iam = new IAMClient({ region: "us-east-1" });

    await iam.send(new GetRoleCommand({ RoleName: roleName }));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NoSuchEntityException" ||
        (error as IamXmlError).Code === "NoSuchEntity" ||
        (error as IamXmlError).Error?.Code === "NoSuchEntity")
    ) {
      return false;
    }
    // Log unexpected errors but return false to avoid blocking deployment
    console.error("Error checking for existing IAM role:", error);
    return false;
  }
}

/**
 * Check if a DynamoDB table exists by name.
 */
export async function tableExists(
  tableName: string,
  region: string
): Promise<boolean> {
  try {
    const { DynamoDBClient, DescribeTableCommand } = await import(
      "@aws-sdk/client-dynamodb"
    );
    const dynamodb = new DynamoDBClient({ region });

    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      return false;
    }
    console.error("Error checking for existing DynamoDB table:", error);
    return false;
  }
}

/**
 * Check if an SQS queue exists by name.
 * Returns the queue URL if found, null otherwise.
 */
export async function sqsQueueExists(
  queueName: string,
  region: string
): Promise<string | null> {
  try {
    const { SQSClient, GetQueueUrlCommand } = await import(
      "@aws-sdk/client-sqs"
    );
    const sqs = new SQSClient({ region });
    const response = await sqs.send(
      new GetQueueUrlCommand({ QueueName: queueName })
    );
    return response.QueueUrl || null;
    // baseline:allow-next-line no-swallowed-errors — queue not found is expected
  } catch {
    return null;
  }
}

/**
 * Check if an SNS topic exists by name.
 * Returns the topic ARN if found, null otherwise.
 */
export async function snsTopicExists(
  topicName: string,
  region: string
): Promise<string | null> {
  try {
    const { SNSClient, ListTopicsCommand } = await import(
      "@aws-sdk/client-sns"
    );
    const sns = new SNSClient({ region });
    let nextToken: string | undefined;

    do {
      const response = await sns.send(
        new ListTopicsCommand({ NextToken: nextToken })
      );
      const found = response.Topics?.find((t) =>
        t.TopicArn?.endsWith(`:${topicName}`)
      );
      if (found?.TopicArn) {
        return found.TopicArn;
      }
      nextToken = response.NextToken;
    } while (nextToken);

    return null;
    // baseline:allow-next-line no-swallowed-errors — topic not found is expected
  } catch {
    return null;
  }
}

/**
 * Check if a Lambda function exists by name.
 */
export async function lambdaFunctionExists(
  functionName: string,
  region: string
): Promise<boolean> {
  try {
    const { LambdaClient, GetFunctionCommand } = await import(
      "@aws-sdk/client-lambda"
    );
    const lambda = new LambdaClient({ region });

    await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      return false;
    }
    console.error("Error checking for existing Lambda function:", error);
    return false;
  }
}
