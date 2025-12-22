/**
 * AWS Lambda Handler for Wraps API
 *
 * Wraps the Elysia app for Lambda execution via API Gateway.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";

import { app } from "./index";

export async function handler(
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> {
  // Convert API Gateway event to Request
  const url = new URL(
    event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : ""),
    `https://${event.requestContext.domainName}`
  );

  const request = new Request(url.toString(), {
    method: event.requestContext.http.method,
    headers: new Headers(
      event.headers as Record<string, string> | undefined
    ),
    body:
      event.body && event.requestContext.http.method !== "GET"
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64")
          : event.body
        : undefined,
  });

  // Handle request with Elysia
  const response = await app.handle(request);

  // Convert Response to API Gateway format
  const headers: Record<string, string> = {};
  response.headers.forEach((value: string, key: string) => {
    headers[key] = value;
  });

  const body = await response.text();

  return {
    statusCode: response.status,
    headers,
    body,
    isBase64Encoded: false,
  };
}
