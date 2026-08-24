/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST v3 (Ion) Configuration for Wraps Self-Hosted Deployment
 *
 * Deploys the full Wraps platform to a customer's AWS account:
 * - API Lambda with function URL (no API Gateway cost for single-tenant)
 * - SQS queues for batch and workflow processing
 * - DynamoDB for rate limiting
 * - EventBridge Scheduler for scheduled broadcasts
 * - Next.js web app via sst.aws.Nextjs (OpenNext)
 *
 * Reads config from .env.selfhost in repo root.
 * Run via: pnpm selfhost:deploy — sst runs with cwd=infra/, which both the
 * .env.selfhost lookup below and the .sst/platform reference above depend on.
 *
 * Two SST sharp edges, both learned the hard way:
 *
 * 1. This file's path must NOT contain the substring ".sst". SST's bundler
 *    injects the `aws`/`sst` import shim into every source file EXCEPT paths
 *    containing ".sst" (meant to exclude its platform directory) — a name
 *    like "selfhost.sst.config.ts" matches that check, gets no shim, and
 *    every `aws.*` reference throws "ReferenceError: aws is not defined" at
 *    deploy. The selfhost-smoke CI job guards this.
 *
 * 2. Do not import `sst` or `aws` here. The injected shim provides them;
 *    importing them from .sst/platform deadlocks `sst install`, which must
 *    build the config before that directory exists.
 */

export default $config({
  app(input) {
    return {
      name: "wraps-selfhost",
      removal: "remove",
      home: "aws",
      providers: {
        aws: {
          // Set by the selfhost deploy/upgrade scripts (persisted in
          // .env.selfhost). app() runs before run()'s dotenv load, so this
          // must arrive via the subprocess environment, not the env file.
          region: (process.env.SELFHOST_AWS_REGION ||
            "us-east-1") as aws.Region,
        },
        // Declared here rather than in run() for the same reason as region:
        // app() is evaluated before the dotenv load, and `sst install` (which
        // runs before deploy) needs the provider present to fetch it. The
        // deploy script puts both vars in the subprocess environment.
        ...(process.env.SELFHOST_DNS_PROVIDER === "cloudflare" && {
          cloudflare: {
            apiToken: process.env.CLOUDFLARE_API_TOKEN,
          },
        }),
      },
    };
  },
  async run() {
    const { config } = await import("dotenv");
    const { resolve } = await import("node:path");
    // override: the customer's .env.selfhost is the authority for THEIR stack.
    // Without it, a maintainer who also works on the platform and has
    // NEXT_PUBLIC_APP_URL / DATABASE_URL exported in their shell silently bakes
    // wraps.dev values into the customer's deployment — these vars became
    // load-bearing for the API's email links and .well-known issuer. The repo
    // has precedent for exactly this (WRAPS_LICENSE_KEY poisoning test runs).
    const envFile = config({
      path: resolve(process.cwd(), "..", ".env.selfhost"),
      override: true,
    });

    const webDomain = process.env.SELFHOST_WEB_DOMAIN;

    // Which DNS provider owns webDomain. This used to be hardcoded to
    // sst.aws.dns(), which does a Route 53 hosted-zone lookup for both the ACM
    // validation record and the CloudFront alias — so every customer whose
    // domain lives anywhere else failed the deploy with "could not find hosted
    // zone", after the cert had already been created.
    const dnsProvider = process.env.SELFHOST_DNS_PROVIDER || "route53";

    /**
     * The `domain` argument for the Nextjs component, or {} when no custom
     * domain is configured (the deployment then serves on its CloudFront URL).
     */
    const webDomainConfig = (() => {
      if (!webDomain) {
        return {};
      }
      if (dnsProvider === "cloudflare") {
        return {
          domain: {
            name: webDomain,
            // zone is optional — omitting it makes SST look the zone up from
            // the domain. We pass it when the deploy script already resolved
            // it, which also covers subdomains of a zone (mail.example.com
            // living in the example.com zone).
            dns: sst.cloudflare.dns({
              zone: process.env.SELFHOST_CLOUDFLARE_ZONE_ID,
            }),
          },
        };
      }
      if (dnsProvider === "none") {
        // Unsupported DNS provider: the operator validated the cert and adds
        // the CloudFront alias record by hand. SST touches no DNS at all.
        const cert = process.env.SELFHOST_ACM_CERT_ARN;
        if (!cert) {
          throw new Error(
            "SELFHOST_DNS_PROVIDER=none requires SELFHOST_ACM_CERT_ARN (an ISSUED certificate in us-east-1, which is the only region CloudFront accepts)."
          );
        }
        // `as const` keeps this `false`, not `boolean`. SST accepts
        // `false | AwsDns | CloudflareDns | VercelDns`; widening it to
        // `boolean` makes the whole union unassignable to NextjsArgs, because
        // `true` is not a valid DNS adapter.
        return { domain: { name: webDomain, dns: false as const, cert } };
      }
      if (dnsProvider !== "route53") {
        throw new Error(
          `Unknown SELFHOST_DNS_PROVIDER "${dnsProvider}". Expected route53, cloudflare, or none.`
        );
      }
      return { domain: { name: webDomain, dns: sst.aws.dns() } };
    })();

    // Optional: point this deployment's error reporting at the operator's OWN
    // Sentry project. Unset means the SDK initializes without a DSN and no-ops,
    // which is the status quo — a self-hosted stack reports errors nowhere.
    //
    // Read from the env FILE, not process.env: `override: true` only overrides
    // keys the file actually contains, so a maintainer who runs a customer
    // deploy from this repo with Wraps' own SENTRY_DSN exported would otherwise
    // bake it in and silently stream that customer's errors to us.
    const sentryDsn = envFile.parsed?.SENTRY_DSN;

    // Database env, shared by every function below. Each is its own Lambda with
    // its own pg pool, so the per-process connection cap is multiplied by
    // containers AND by functions against the customer's Postgres — which is
    // how a self-hosted stack exhausts its connection slots under ordinary
    // load. The cap itself defaults in packages/db; forwarded here only so an
    // operator who has measured a reason can raise it in .env.selfhost.
    const dbEnv = {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      ...(process.env.DATABASE_POOL_MAX && {
        DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
      }),
    };

    // EventBridge Scheduler resources (must come before queues to avoid circular deps)
    const schedulerGroup = new aws.scheduler.ScheduleGroup(
      "SelfhostSchedulerGroup",
      {
        name: "wraps-selfhost-schedulers",
        tags: {
          ManagedBy: "sst",
          Service: "wraps-selfhost",
        },
      }
    );

    const schedulerRole = new aws.iam.Role("SelfhostSchedulerRole", {
      name: "wraps-selfhost-scheduler-role",
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "scheduler.amazonaws.com",
            },
            Action: "sts:AssumeRole",
          },
        ],
      }),
      tags: {
        ManagedBy: "sst",
        Service: "wraps-selfhost",
      },
    });

    // Rate limit table
    const rateLimitTable = new sst.aws.Dynamo("SelfhostRateLimitTable", {
      fields: {
        pk: "string",
        sk: "string",
      },
      primaryIndex: {
        hashKey: "pk",
        rangeKey: "sk",
      },
      ttl: "expiresAt",
      transform: {
        table: {
          billingMode: "PAY_PER_REQUEST",
          tags: {
            ManagedBy: "sst",
            Service: "wraps-selfhost",
          },
        },
      },
    });

    // Batch DLQ
    const batchDlq = new sst.aws.Queue("SelfhostBatchDlq", {
      transform: {
        queue: {
          visibilityTimeoutSeconds: 70,
          messageRetentionSeconds: 1_209_600,
          tags: {
            ManagedBy: "sst",
            Service: "wraps-selfhost",
          },
        },
      },
    });

    // Batch queue
    const batchQueue = new sst.aws.Queue("SelfhostBatchQueue", {
      dlq: {
        queue: batchDlq.arn,
        retry: 3,
      },
      transform: {
        queue: {
          visibilityTimeoutSeconds: 300,
          messageRetentionSeconds: 1_209_600,
          tags: {
            ManagedBy: "sst",
            Service: "wraps-selfhost",
          },
        },
      },
    });

    // Workflow DLQ
    const workflowDlq = new sst.aws.Queue("SelfhostWorkflowDlq", {
      transform: {
        queue: {
          visibilityTimeoutSeconds: 70,
          messageRetentionSeconds: 1_209_600,
          tags: {
            ManagedBy: "sst",
            Service: "wraps-selfhost",
          },
        },
      },
    });

    // Workflow queue
    const workflowQueue = new sst.aws.Queue("SelfhostWorkflowQueue", {
      dlq: {
        queue: workflowDlq.arn,
        retry: 3,
      },
      transform: {
        queue: {
          visibilityTimeoutSeconds: 300,
          messageRetentionSeconds: 86_400,
          tags: {
            ManagedBy: "sst",
            Service: "wraps-selfhost",
          },
        },
      },
    });

    // Alerts SNS topic + broadcast queue alarms. A broadcast is a
    // self-propagating chain — one message in flight at a time — so a single
    // broken link stalls the whole send with the row still reading
    // "processing" and nothing else to notice. Mirrors the two batch alarms
    // in infra/alarms.ts (the cloud stack); NOT unified into a shared module
    // on purpose — see that file's header for why the two stacks diverge.
    const alertsTopic = new aws.sns.Topic("SelfhostAlertsTopic", {
      name: $interpolate`wraps-selfhost-alerts-${$app.stage}`,
      tags: {
        ManagedBy: "sst",
        Service: "wraps-selfhost",
      },
    });

    // Optional: the operator sets ALERT_EMAIL in .env.selfhost. AWS sends a
    // confirmation email that must be accepted before alarms deliver.
    //
    // Read from the env FILE, not process.env — same reasoning as `sentryDsn`
    // above it: dotenv's `override: true` only overrides keys the file
    // actually contains, so a Wraps maintainer running a customer deploy from
    // this repo with ALERT_EMAIL exported in their shell would otherwise
    // subscribe *our* address to *their* alarms.
    const alertEmail = envFile.parsed?.ALERT_EMAIL;
    if (alertEmail) {
      new aws.sns.TopicSubscription("SelfhostAlertsEmailSubscription", {
        topic: alertsTopic.arn,
        protocol: "email",
        endpoint: alertEmail,
      });
    }

    // Alarm: messages visible in the Batch DLQ
    new aws.cloudwatch.MetricAlarm("SelfhostBatchDlqAlarm", {
      name: $interpolate`wraps-selfhost-batch-dlq-${$app.stage}`,
      alarmDescription:
        "One or more batch jobs landed in the dead-letter queue",
      namespace: "AWS/SQS",
      metricName: "ApproximateNumberOfMessagesVisible",
      dimensions: {
        QueueName: batchDlq.nodes.queue.name,
      },
      statistic: "Maximum",
      period: 60,
      evaluationPeriods: 1,
      threshold: 1,
      comparisonOperator: "GreaterThanOrEqualToThreshold",
      treatMissingData: "notBreaching",
      alarmActions: [alertsTopic.arn],
      okActions: [alertsTopic.arn],
      tags: {
        ManagedBy: "sst",
        Service: "wraps-selfhost",
      },
    });

    // Alarm: batch messages sitting too long on the main queue.
    // DLQ alarm only fires AFTER 3 retries — roughly 15+ min of failure before
    // a broadcast operator sees anything. This fires earlier: if the oldest
    // message on the main queue has been waiting >= 15 min, something is
    // blocking the worker and we want to know BEFORE DLQ landing.
    new aws.cloudwatch.MetricAlarm("SelfhostBatchQueueAgeAlarm", {
      name: $interpolate`wraps-selfhost-batch-queue-age-${$app.stage}`,
      alarmDescription:
        "Oldest batch message has been on the queue for >= 15 minutes — worker likely stalled",
      namespace: "AWS/SQS",
      metricName: "ApproximateAgeOfOldestMessage",
      dimensions: {
        QueueName: batchQueue.nodes.queue.name,
      },
      statistic: "Maximum",
      period: 60,
      evaluationPeriods: 3,
      threshold: 900, // 15 minutes
      comparisonOperator: "GreaterThanOrEqualToThreshold",
      treatMissingData: "notBreaching",
      alarmActions: [alertsTopic.arn],
      okActions: [alertsTopic.arn],
      tags: {
        ManagedBy: "sst",
        Service: "wraps-selfhost",
      },
    });

    // Alarm: messages visible in the Workflow DLQ
    new aws.cloudwatch.MetricAlarm("SelfhostWorkflowDlqAlarm", {
      name: $interpolate`wraps-selfhost-workflow-dlq-${$app.stage}`,
      alarmDescription:
        "One or more workflow jobs landed in the dead-letter queue",
      namespace: "AWS/SQS",
      metricName: "ApproximateNumberOfMessagesVisible",
      dimensions: {
        QueueName: workflowDlq.nodes.queue.name,
      },
      statistic: "Maximum",
      period: 60,
      evaluationPeriods: 1,
      threshold: 1,
      comparisonOperator: "GreaterThanOrEqualToThreshold",
      treatMissingData: "notBreaching",
      alarmActions: [alertsTopic.arn],
      okActions: [alertsTopic.arn],
      tags: {
        ManagedBy: "sst",
        Service: "wraps-selfhost",
      },
    });

    // Scheduler IAM policy — allow Scheduler to send to both queues
    new aws.iam.RolePolicy("SelfhostSchedulerSqsPolicy", {
      role: schedulerRole.name,
      policy: $jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["sqs:SendMessage"],
            Resource: [batchQueue.arn, workflowQueue.arn],
          },
        ],
      }),
    });

    // API Lambda with function URL (no API Gateway — single-tenant, cost-free)
    const api = new sst.aws.Function("SelfhostApi", {
      handler: "../apps/api/src/lambda.handler",
      runtime: "nodejs24.x",
      timeout: "30 seconds",
      memory: "512 MB",
      url: true,
      environment: {
        NODE_ENV: "production",
        ...dbEnv,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
        UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET ?? "",
        // The API reads WRAPS_LICENSE_KEY (apps/api/src/(ee)/lib/license.ts).
        // The .env.selfhost key stays LICENSE_KEY — scripts/selfhost/deploy.ts
        // writes it under that name and upgrade.ts reads it back. Only the
        // injected Lambda variable is renamed. Injecting it as LICENSE_KEY left
        // isSelfHosted() false on every self-hosted API request, so rate limits,
        // plan gates and the monthly event cap were all still enforced on a
        // licensed deployment.
        WRAPS_LICENSE_KEY: process.env.LICENSE_KEY ?? "",
        // The API builds links into emails and advertises OAuth endpoints, so
        // it needs the deployment's own URLs. It cannot read `api.url`/`web.url`
        // (both are being defined here), so it reads what the first deploy pass
        // backfilled into .env.selfhost — the same source the web app uses.
        NEXT_PUBLIC_APP_URL:
          process.env.NEXT_PUBLIC_APP_URL ||
          (webDomain ? `https://${webDomain}` : ""),
        BETTER_AUTH_URL:
          process.env.BETTER_AUTH_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          (webDomain ? `https://${webDomain}` : ""),
        WRAPS_API_URL: process.env.WRAPS_API_URL ?? "",
        BATCH_QUEUE_URL: batchQueue.url,
        BATCH_QUEUE_ARN: batchQueue.arn,
        WORKFLOW_QUEUE_URL: workflowQueue.url,
        WORKFLOW_QUEUE_ARN: workflowQueue.arn,
        RATE_LIMIT_TABLE_NAME: rateLimitTable.name,
        SCHEDULER_ROLE_ARN: schedulerRole.arn,
        SCHEDULER_GROUP_NAME: schedulerGroup.name,
        // Self-hosted assumes its OWN console role; sharing the platform's
        // would mean overwriting its single-principal trust policy.
        // Literal, not an import: infra/ has no node_modules, so importing
        // @wraps/core here breaks the SST esbuild bundle at deploy time.
        // Pinned to SELFHOST_CONSOLE_ACCESS_ROLE_NAME by
        // scripts/selfhost/__tests__/selfhost-config-role-name.test.ts
        WRAPS_CONSOLE_ROLE_NAME: "wraps-selfhost-console-access-role",
        // No AI provider config here on purpose: all inference lives in the
        // three apps/web routes, so the keys go on SelfhostWeb below. This
        // lambda carried them for a generator that never existed.
        ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
      },
      link: [rateLimitTable, batchQueue, workflowQueue],
      nodejs: {
        install: ["pg", "@sentry/profiling-node"],
      },
      permissions: [
        {
          actions: [
            "scheduler:CreateSchedule",
            "scheduler:UpdateSchedule",
            "scheduler:DeleteSchedule",
            "scheduler:GetSchedule",
          ],
          resources: [
            $interpolate`arn:aws:scheduler:*:*:schedule/${schedulerGroup.name}/*`,
          ],
        },
        {
          actions: ["iam:PassRole"],
          resources: [schedulerRole.arn],
        },
        {
          actions: ["sts:AssumeRole"],
          resources: ["arn:aws:iam::*:role/wraps-*"],
        },
      ],
    });

    // Uploads bucket for organization logos. Private on purpose: objects are
    // served through the web app's /api/images route (which validates the key
    // prefix before reading), never via direct S3 URLs. The app stores the
    // absolute URL because emails need one. next/image rejects any absolute
    // src whose host is not in remotePatterns — same-origin is not exempt —
    // and this deployment's host is not knowable when next.config is frozen
    // at build time, so the two dashboard render sites pass `unoptimized`
    // instead. Mail clients fetch the raw URL either way.
    const uploadsBucket = new sst.aws.Bucket("SelfhostUploads", {
      transform: {
        bucket: {
          tags: {
            ManagedBy: "sst",
            Service: "wraps-selfhost",
          },
        },
      },
    });

    // Next.js web app via OpenNext
    const web = new sst.aws.Nextjs("SelfhostWeb", {
      path: "../apps/web",
      // The bucket link grants the server function s3 Get/Put/Delete on it.
      link: [api, uploadsBucket],
      server: {
        timeout: "120 seconds",
        memory: "1024 MB",
      },
      environment: {
        ...dbEnv,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
        BETTER_AUTH_URL:
          process.env.BETTER_AUTH_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          (webDomain ? `https://${webDomain}` : ""),
        // WRAPS_EMAIL_ROLE_ARN is deliberately NOT set here. getWrapsClient()
        // (packages/email/src/lib/client.ts) treats a present role ARN as
        // "assume it", and on Lambda that is a literal sts:AssumeRole from this
        // function's execution role. wraps-email-role is created by the email
        // stack with a Service-only trust policy (shared/iam.ts, provider
        // "aws"), which does not admit a role principal — so every auth email
        // failed with AccessDenied. The hop exists for Vercel's cross-account
        // OIDC; self-hosted already runs inside the account that owns SES, so
        // it sends with its own credentials via the ses:SendEmail grant below.
        AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM ?? "",
        AUTH_EMAIL_CONFIGURATION_SET:
          process.env.AUTH_EMAIL_CONFIGURATION_SET ?? "",
        UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET ?? "",
        WRAPS_LICENSE_KEY: process.env.LICENSE_KEY ?? "",
        WRAPS_API_URL: api.url,
        NEXT_PUBLIC_API_URL: api.url,
        // Logo uploads (apps/web /api/upload/organization-logo) switch from
        // Vercel Blob to this bucket when set — that is the entire feature
        // flag. Unset on Vercel, so the platform app keeps its blob storage.
        UPLOADS_BUCKET_NAME: uploadsBucket.name,
        NEXT_PUBLIC_APP_URL:
          process.env.NEXT_PUBLIC_APP_URL ||
          (webDomain ? `https://${webDomain}` : ""),
        CORS_ORIGIN:
          process.env.NEXT_PUBLIC_APP_URL ||
          (webDomain ? `https://${webDomain}` : ""),
        AWS_BACKEND_ACCOUNT_ID: aws.getCallerIdentityOutput({}).accountId,
        // Enterprise IdPs the built-in allowlist in packages/auth cannot name:
        // an Okta custom domain, an internal Keycloak. better-auth 1.6 refuses
        // OIDC discovery against any origin outside trustedOrigins, so without
        // this a self-hoster's only path to working SSO is forking the repo.
        WRAPS_SSO_TRUSTED_ORIGINS: process.env.WRAPS_SSO_TRUSTED_ORIGINS ?? "",
        ...(process.env.AI_GATEWAY_API_KEY && {
          AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
        }),
        ...(process.env.AI_MODEL && {
          AI_MODEL: process.env.AI_MODEL,
        }),
        // The three AI routes live in apps/web, so the inference provider is
        // configured on this function and not on the API lambda.
        ...(process.env.WRAPS_AI_PROVIDER && {
          WRAPS_AI_PROVIDER: process.env.WRAPS_AI_PROVIDER,
        }),
        ...(process.env.OPENAI_API_KEY && {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        }),
        ...(process.env.OPENAI_BASE_URL && {
          OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
        }),
        ...(process.env.ANTHROPIC_API_KEY && {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        }),
        ...(process.env.ANTHROPIC_BASE_URL && {
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
        }),
        // Bedrock is self-hosted-only, so this deployment always qualifies.
        // The value is still passed explicitly rather than defaulted inside
        // @wraps/ai, so Wraps Cloud can never accidentally satisfy the gate.
        WRAPS_DEPLOYMENT_MODE: "self-hosted",
        ...(process.env.WRAPS_AI_REGION && {
          WRAPS_AI_REGION: process.env.WRAPS_AI_REGION,
        }),
        // Two vars, one input: the server SDK reads SENTRY_DSN, the browser SDK
        // reads the NEXT_PUBLIC_ copy that Next inlines at build time. A DSN is
        // write-only and ships in the client bundle by design, so mirroring it
        // leaks nothing.
        ...(sentryDsn && {
          SENTRY_DSN: sentryDsn,
          NEXT_PUBLIC_SENTRY_DSN: sentryDsn,
        }),
      },
      permissions: [
        {
          // Still needed: the dashboard assumes wraps-selfhost-console-access-role
          // to read SES account state. That role DOES trust an account principal.
          actions: ["sts:AssumeRole"],
          resources: ["arn:aws:iam::*:role/wraps-*"],
        },
        {
          // Bedrock inference for the template and workflow AI, when
          // WRAPS_AI_PROVIDER=bedrock. Granted on this function and not the API
          // lambda because all three AI routes live in apps/web.
          //
          // Unscoped: the model id is chosen at runtime via AI_MODEL, and
          // cross-region inference profiles resolve to foundation-model ARNs in
          // several regions at once, so the set is not knowable at config time.
          //
          // IAM alone is not sufficient — each Anthropic model must also be
          // enabled per-account per-region in the Bedrock console, or calls
          // fail with AccessDeniedException.
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
          ],
          resources: ["*"],
        },
        {
          // Auth email (verification, password reset, invitations) sends with
          // this function's own credentials — see the WRAPS_EMAIL_ROLE_ARN note
          // above. Unscoped because the send names both an identity and a
          // configuration set, and their ARNs are not known at config time.
          //
          // SendTemplatedEmail is the load-bearing one: better-auth's
          // sendVerificationEmail goes through WrapsEmail.sendTemplate(), so a
          // grant of SendEmail alone still fails closed with AccessDenied.
          actions: [
            "ses:SendEmail",
            "ses:SendRawEmail",
            "ses:SendTemplatedEmail",
            "ses:SendBulkTemplatedEmail",
          ],
          resources: ["*"],
        },
      ],
      ...webDomainConfig,
    });

    // Queue subscribers — declared after api/web so api.url and web.url are
    // resolved SST outputs rather than env vars read at config-evaluation time.

    // Batch DLQ consumer
    batchDlq.subscribe(
      {
        handler: "../apps/api/src/workers/batch-dlq-consumer.handler",
        runtime: "nodejs24.x",
        timeout: "1 minute",
        memory: "256 MB",
        environment: {
          NODE_ENV: "production",
          ...dbEnv,
          BATCH_QUEUE_URL: batchQueue.url,
          // Same DSN as the API and dashboard — the workers swallow their own
          // failures by design, so this is where those surface.
          ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
          // Kill switch documented in
          // apps/api/src/workers/BROADCAST_RESUME_RUNBOOK.md. Matches
          // infra/queues.ts; the consumer reads it as === "false", so any
          // other value is a no-op.
          BROADCAST_DLQ_CONSUMER_ENABLED:
            process.env.BROADCAST_DLQ_CONSUMER_ENABLED ?? "true",
        },
        nodejs: {
          install: ["pg", "@sentry/profiling-node"],
        },
        permissions: [
          {
            actions: ["sqs:SendMessage"],
            resources: [batchQueue.arn],
          },
        ],
      },
      {
        batch: {
          size: 10,
          partialResponses: true,
        },
      }
    );

    // Batch sender
    const batchSenderSubscription = batchQueue.subscribe(
      {
        handler: "../apps/api/src/workers/batch-sender.handler",
        runtime: "nodejs24.x",
        timeout: "5 minutes",
        memory: "512 MB",
        environment: {
          NODE_ENV: "production",
          ...dbEnv,
          UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET ?? "",
          BATCH_QUEUE_URL: batchQueue.url,
          API_BASE_URL: api.url,
          APP_BASE_URL: web.url,
          ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
          // Sender for platform alert mail (stuck-broadcast escalation). Self-
          // host has no wraps.dev identity, so it reuses the same verified
          // sender configured for auth email. Unset → the alert degrades to
          // an in-app notification only.
          AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM ?? "",
        },
        nodejs: {
          install: ["pg", "@sentry/profiling-node"],
        },
        permissions: [
          {
            actions: ["sts:AssumeRole"],
            resources: ["arn:aws:iam::*:role/wraps-*"],
          },
          {
            actions: ["sqs:SendMessage"],
            resources: [batchQueue.arn],
          },
          {
            // Platform alert mail sends with this function's own credentials —
            // WRAPS_EMAIL_ROLE_ARN is deliberately unset on self-host (see the
            // note on the web function). Unscoped because the send names an
            // identity whose ARN is not known at config time.
            actions: ["ses:SendEmail", "ses:SendRawEmail"],
            resources: ["*"],
          },
        ],
      },
      {
        batch: {
          size: 1,
        },
      }
    );

    // Opt the batch sender out of Lambda's recursive-loop termination.
    //
    // A broadcast advances by design as a self-referential chain: batch-sender
    // sends the next chunk to batchQueue, which invokes batch-sender again.
    // That is exactly the shape Lambda's loop detection is built to kill, and
    // it kills it at the DEFAULT THRESHOLD OF 16 HOPS — so every broadcast
    // stopped dead at 16 x CHUNK_SIZE = 800 recipients, silently. No error, no
    // throttle, no log line, because the invocation is dropped before the
    // handler runs; the only evidence is the RecursiveInvocationsDropped metric
    // and an AWS Health "runaway termination" alert. Reproduced twice on
    // 2026-07-31, and it is account-independent — nothing to do with
    // concurrency limits, which is why it bites self-hosters whose accounts
    // have the default 1000.
    //
    // "Allow" is AWS's sanctioned opt-out for intentional recursion. It is safe
    // here because the chain is BOUNDED, not runaway: each hop advances a
    // keyset cursor over a frozen audience snapshot, and the worker stops
    // enqueueing once contacts run out or processedRecipients reaches
    // totalRecipients. SelfhostBroadcastReaper remains the backstop for a chunk
    // lost for any other reason.
    //
    // Note the resource's own warning: DESTROYING this reverts recursiveLoop to
    // "Terminate", which silently reinstates the 800-recipient ceiling.
    new aws.lambda.FunctionRecursionConfig("SelfhostBatchSenderRecursion", {
      functionName: batchSenderSubscription.nodes.function.apply(
        (fn) => fn.name
      ),
      recursiveLoop: "Allow",
    });

    // Workflow DLQ consumer
    workflowDlq.subscribe(
      {
        handler: "../apps/api/src/(ee)/workers/workflow-dlq-consumer.handler",
        runtime: "nodejs24.x",
        timeout: "1 minute",
        memory: "256 MB",
        environment: {
          NODE_ENV: "production",
          ...dbEnv,
          ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
        },
        nodejs: {
          install: ["pg", "@sentry/profiling-node"],
        },
      },
      {
        batch: {
          size: 10,
        },
      }
    );

    // Workflow processor
    workflowQueue.subscribe(
      {
        handler: "../apps/api/src/(ee)/workers/workflow-processor.handler",
        runtime: "nodejs24.x",
        timeout: "5 minutes",
        memory: "512 MB",
        environment: {
          NODE_ENV: "production",
          ...dbEnv,
          WORKFLOW_QUEUE_URL: workflowQueue.url,
          WORKFLOW_QUEUE_ARN: workflowQueue.arn,
          SCHEDULER_ROLE_ARN: schedulerRole.arn,
          SCHEDULER_GROUP_NAME: schedulerGroup.name,
          UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET ?? "",
          API_BASE_URL: api.url,
          APP_BASE_URL: web.url,
          ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
        },
        nodejs: {
          install: ["pg", "@sentry/profiling-node"],
        },
        permissions: [
          {
            actions: ["sts:AssumeRole"],
            resources: ["arn:aws:iam::*:role/wraps-*"],
          },
          {
            actions: ["sqs:SendMessage"],
            resources: [workflowQueue.arn],
          },
          {
            actions: [
              "scheduler:CreateSchedule",
              "scheduler:DeleteSchedule",
              "scheduler:GetSchedule",
            ],
            resources: [
              $interpolate`arn:aws:scheduler:*:*:schedule/${schedulerGroup.name}/*`,
            ],
          },
          {
            actions: ["iam:PassRole"],
            resources: [schedulerRole.arn],
          },
        ],
      },
      {
        batch: {
          size: 10,
          partialResponses: true,
        },
      }
    );

    // Account health: assumes each connected AWS account's role and checks
    // SES account health (sending paused/enforcement, reputation thresholds,
    // daily quota, sandbox→production transitions). Writes inbox notifications
    // (deduped per account per day). See apps/api/src/workers/account-health.ts.
    // Mirrors accountHealthCron in infra/cron.ts (the cloud stack) with two
    // self-hosted adaptations: no Axiom secret here (structured logs go to
    // CloudWatch Logs only), and `enabled` reads an opt-out from the env file
    // instead of `$app.stage === "production"` — self-hosted stage names
    // vary, and that guard would silently disable the cron on every real
    // self-hosted stage.
    // `Cron`, not `CronV2` (which infra/cron.ts uses on the cloud stack): the
    // self-hosted stack's SST platform under infra/.sst is pinned at 4.0.6,
    // which has no CronV2 component — `sst deploy` there would fail on an
    // undefined constructor. `Cron` exists in both 4.0.6 and the 4.2.4 the
    // root stack runs, and supports everything used here (job, schedule,
    // enabled), so it is correct regardless of which platform version the
    // customer's deploy resolves. It provisions an EventBridge Rule rather
    // than a Scheduler entry; for an hourly health check that is equivalent.
    new sst.aws.Cron("SelfhostAccountHealth", {
      schedule: "cron(45 * * * ? *)",
      // Read from the env FILE, not process.env — same maintainer-shell-leak
      // reasoning as ALERT_EMAIL and SENTRY_DSN above: a Wraps maintainer
      // running a customer deploy from this repo should not silently disable
      // the customer's cron because of something in their own shell.
      enabled: envFile.parsed?.SELFHOST_ACCOUNT_HEALTH_ENABLED !== "false",
      job: {
        handler: "../apps/api/src/workers/account-health.handler",
        runtime: "nodejs24.x",
        timeout: "10 minutes",
        memory: "256 MB",
        environment: {
          NODE_ENV: "production",
          ...dbEnv,
          ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
        },
        nodejs: {
          install: ["pg", "@sentry/profiling-node"],
        },
        permissions: [
          // Assume cross-account customer roles to read SES account health.
          // The self-hosted console role is also wraps-* (see
          // WRAPS_CONSOLE_ROLE_NAME above), so this pattern covers it too.
          {
            actions: ["sts:AssumeRole"],
            resources: ["arn:aws:iam::*:role/wraps-*"],
          },
        ],
      },
    });

    // Event-feed staleness: flags accounts whose SES event feed has gone
    // quiet while sends are still happening — a broadcast can drain
    // perfectly while the dashboard timeline silently freezes and
    // bounce/complaint handling goes blind. Mirrors eventFeedStalenessCron
    // in infra/cron.ts (the cloud stack) with the same two Cron/enabled
    // adaptations as SelfhostAccountHealth above, plus three more because
    // this worker sends email (see apps/api/src/workers/event-feed-staleness.ts):
    //
    // - APP_BASE_URL comes from web.url, not process.env. resolveAppUrl()
    //   (packages/email/src/lib/app-url.ts) throws rather than defaulting to
    //   app.wraps.dev, and APP_BASE_URL is not a .env.selfhost key, so
    //   process.env.APP_BASE_URL would be "" and the send would throw forever.
    //   web.url matches the two other APP_BASE_URL lines in this file.
    // - EMAIL_FROM, not AUTH_EMAIL_FROM. event-feed-stale.ts:65 reads
    //   `process.env.EMAIL_FROM || "Wraps <hello@wraps.dev>"` with no
    //   AUTH_EMAIL_FROM fallback (unlike broadcast-stuck.ts), so setting only
    //   AUTH_EMAIL_FROM here would leave `from` at hello@wraps.dev — an
    //   identity this customer's SES account does not own — and every send
    //   would be rejected. Feed the operator's verified auth sender in under
    //   the name this code actually reads. Still unset means the alert
    //   cannot deliver; that is documented in the self-hosted docs, not
    //   silent.
    // - No WRAPS_EMAIL_ROLE_ARN. It is deliberately unset on self-host (see
    //   the note on the web function above) — the customer's wraps-email-role
    //   has a Service-only trust policy that a role-principal AssumeRole
    //   cannot satisfy. The alert email still sends with this function's own
    //   ses:SendEmail grant. The worker DOES now call an AWS API beyond the
    //   email send (plan 195): it assumes each connected account's own
    //   customer role to read the SES Send metric, a fallback signal for SDK
    //   senders whose message_send rows only exist once an event has already
    //   arrived. Same sts:AssumeRole grant as SelfhostAccountHealth above —
    //   the self-hosted console role is also wraps-*.
    new sst.aws.Cron("SelfhostEventFeedStaleness", {
      schedule: "cron(15 * * * ? *)",
      // Read from the env FILE — same maintainer-shell-leak reasoning as
      // SELFHOST_ACCOUNT_HEALTH_ENABLED above.
      enabled:
        envFile.parsed?.SELFHOST_EVENT_FEED_STALENESS_ENABLED !== "false",
      job: {
        handler: "../apps/api/src/workers/event-feed-staleness.handler",
        runtime: "nodejs24.x",
        // The sweep now makes an STS + CloudWatch round trip per candidate
        // account for the SES send-metric fallback (plan 195), matching why
        // SelfhostAccountHealth above already needs 10 minutes.
        timeout: "10 minutes",
        memory: "256 MB",
        environment: {
          NODE_ENV: "production",
          ...dbEnv,
          ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
          APP_BASE_URL: web.url,
          EMAIL_FROM: process.env.AUTH_EMAIL_FROM ?? "",
        },
        nodejs: {
          install: ["pg", "@sentry/profiling-node"],
        },
        permissions: [
          {
            actions: ["ses:SendEmail", "ses:SendRawEmail"],
            resources: ["*"],
          },
          // Assume cross-account customer roles to read the SES Send metric.
          // The self-hosted console role is also wraps-* (see
          // WRAPS_CONSOLE_ROLE_NAME above), so this pattern covers it too.
          {
            actions: ["sts:AssumeRole"],
            resources: ["arn:aws:iam::*:role/wraps-*"],
          },
        ],
      },
    });

    // Workflow reaper: backstop for lost EventBridge Scheduler deliveries.
    // A workflow execution paused/waiting on a one-time schedule that never
    // fires (delivery lost, target misconfigured) would otherwise stay stuck
    // forever. Mirrors workflowReaperCron in infra/cron.ts. DB-only — no
    // permissions block, no email.
    new sst.aws.Cron("SelfhostWorkflowReaper", {
      schedule: "rate(1 hour)",
      enabled: envFile.parsed?.SELFHOST_WORKFLOW_REAPER_ENABLED !== "false",
      job: {
        handler: "../apps/api/src/(ee)/workers/workflow-reaper.handler",
        runtime: "nodejs24.x",
        timeout: "5 minutes",
        memory: "256 MB",
        environment: {
          NODE_ENV: "production",
          ...dbEnv,
          // The reaper is itself the backstop — when it cannot fail a stuck
          // execution it logs and moves on, once an hour, forever.
          ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
        },
        nodejs: {
          install: ["pg", "@sentry/profiling-node"],
        },
      },
    });

    // Broadcast reaper: backstop for a chunk message SQS delivered to nobody.
    // Self-hosted deployments are the ones that actually need this. A fresh
    // AWS account is provisioned with a low Lambda concurrency limit (10 on the
    // test account), and a broadcast's own SES delivery-event webhooks invoke
    // the API function about twice per recipient — enough to saturate that
    // limit and starve the batch queue's event source mapping, which then
    // receives a chunk it can never invoke. Reproduced 2026-07-31: the
    // broadcast stopped dead at 800 with no error anywhere, because the worker
    // code was never reached. Reserved concurrency is not a usable mitigation
    // (AWS rejects any reservation that drops unreserved account concurrency
    // below its minimum), so the chain has to survive lost delivery instead.
    // Mirrors broadcastReaperCron in infra/cron.ts.
    new sst.aws.Cron("SelfhostBroadcastReaper", {
      schedule: "rate(15 minutes)",
      enabled: envFile.parsed?.SELFHOST_BROADCAST_REAPER_ENABLED !== "false",
      job: {
        handler: "../apps/api/src/workers/broadcast-reaper.handler",
        runtime: "nodejs24.x",
        timeout: "5 minutes",
        memory: "256 MB",
        environment: {
          NODE_ENV: "production",
          ...dbEnv,
          // Where the revived chunk goes. Without it the reaper throws on every
          // batch it tries to revive — the one failure it cannot back off from,
          // since it IS the backstop.
          BATCH_QUEUE_URL: batchQueue.url,
          ...(sentryDsn && { SENTRY_DSN: sentryDsn }),
        },
        nodejs: {
          install: ["pg", "@sentry/profiling-node"],
        },
        permissions: [
          {
            actions: ["sqs:SendMessage"],
            resources: [batchQueue.arn],
          },
        ],
      },
    });

    return {
      apiUrl: api.url,
      webUrl: web.url,
      batchQueueUrl: batchQueue.url,
      workflowQueueUrl: workflowQueue.url,
      rateLimitTableName: rateLimitTable.name,
      schedulerGroupName: schedulerGroup.name,
      schedulerRoleArn: schedulerRole.arn,
    };
  },
});
