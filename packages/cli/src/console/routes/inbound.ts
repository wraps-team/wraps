import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { ServerConfig } from "../server.js";

export function createInboundRouter(config: ServerConfig): Router {
  const router = createRouter();

  const getS3Client = () => new S3Client({ region: config.region });

  /**
   * List inbound emails (summaries from parsed/ prefix)
   */
  router.get("/", async (req: Request, res: Response) => {
    try {
      if (!config.inboundBucketName) {
        return res.status(400).json({
          error:
            "Inbound email not enabled. Deploy with 'wraps email inbound init' to enable receiving.",
        });
      }

      const limit = req.query.limit
        ? Number.parseInt(req.query.limit as string, 10)
        : 50;
      const continuationToken = req.query.continuationToken as
        | string
        | undefined;

      const s3 = getS3Client();

      // List parsed email objects
      const listResponse = await s3.send(
        new ListObjectsV2Command({
          Bucket: config.inboundBucketName,
          Prefix: "parsed/",
          MaxKeys: limit,
          ContinuationToken: continuationToken,
        })
      );

      const objects = (listResponse.Contents || []).filter((obj) =>
        obj.Key?.endsWith(".json")
      );

      // Fetch each parsed JSON for summary data
      const emails = await Promise.all(
        objects.map(async (obj) => {
          try {
            const getResponse = await s3.send(
              new GetObjectCommand({
                Bucket: config.inboundBucketName,
                Key: obj.Key!,
              })
            );
            const body = await getResponse.Body?.transformToString();
            if (!body) {
              throw new Error("Empty body");
            }
            const parsed = JSON.parse(body);

            return {
              emailId: parsed.emailId,
              from: parsed.from,
              to: parsed.to,
              subject: parsed.subject,
              receivedAt: parsed.receivedAt,
              hasAttachments: parsed.attachments?.length > 0,
              attachmentCount: parsed.attachments?.length || 0,
              spamVerdict: parsed.spamVerdict,
              virusVerdict: parsed.virusVerdict,
              envelopeRecipients: Array.isArray(parsed.envelopeRecipients)
                ? parsed.envelopeRecipients
                : undefined,
            };
          } catch {
            // Skip malformed entries
            return null;
          }
        })
      );

      res.json({
        emails: emails.filter(Boolean),
        nextToken: listResponse.NextContinuationToken,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error listing inbound emails:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  /**
   * Get a single parsed inbound email by ID
   */
  router.get("/:emailId", async (req: Request, res: Response) => {
    try {
      if (!config.inboundBucketName) {
        return res.status(400).json({
          error: "Inbound email not enabled.",
        });
      }

      const { emailId } = req.params;
      const s3 = getS3Client();

      const getResponse = await s3.send(
        new GetObjectCommand({
          Bucket: config.inboundBucketName,
          Key: `parsed/${emailId}.json`,
        })
      );

      const body = await getResponse.Body?.transformToString();
      if (!body) {
        throw new Error("Empty body");
      }
      const parsed = JSON.parse(body);

      res.json(parsed);
    } catch (error: unknown) {
      if ((error as { name?: string }).name === "NoSuchKey") {
        return res.status(404).json({ error: "Inbound email not found" });
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching inbound email:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}
