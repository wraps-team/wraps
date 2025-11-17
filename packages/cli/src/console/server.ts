import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createHttpTerminator } from "http-terminator";
import { authenticateToken } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { createDomainsRouter } from "./routes/domains.js";
import { createEmailsRouter } from "./routes/emails.js";
import { createMetricsRouter } from "./routes/metrics.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createUserRouter } from "./routes/user.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ServerConfig = {
  port: number;
  roleArn: string | undefined;
  region: string;
  tableName?: string;
  accountId?: string;
  noOpen: boolean;
  archiveArn?: string;
  archivingEnabled?: boolean;
};

export type ServerInfo = {
  url: string;
  token: string;
};

/**
 * Start console server
 */
export async function startConsoleServer(
  config: ServerConfig
): Promise<ServerInfo> {
  const app = express();

  // Generate auth token
  const authToken = crypto.randomBytes(32).toString("hex");

  // Middleware
  app.use(express.json());

  // Simple rate limiting for static file requests (defense-in-depth)
  // Note: This is a localhost-only dev server with token auth, so this is just
  // a safeguard against accidental abuse or runaway scripts
  const requestCounts = new Map<string, { count: number; resetTime: number }>();
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  const RATE_LIMIT_MAX_REQUESTS = 1000; // 1000 requests per minute per IP

  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const record = requestCounts.get(ip);

    if (!record || now > record.resetTime) {
      // New window
      requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      next();
    } else if (record.count < RATE_LIMIT_MAX_REQUESTS) {
      // Within limit
      record.count++;
      next();
    } else {
      // Rate limit exceeded
      res.status(429).json({
        error: "Too many requests, please slow down",
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }
  });

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src 'self'"
    );
    next();
  });

  // Request logging middleware
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API routes (with authentication)
  app.use(
    "/api/metrics",
    authenticateToken(authToken),
    createMetricsRouter(config)
  );
  app.use(
    "/api/domains",
    authenticateToken(authToken),
    createDomainsRouter(config)
  );
  app.use(
    "/api/emails",
    authenticateToken(authToken),
    createEmailsRouter(config)
  );
  app.use(
    "/api/settings",
    authenticateToken(authToken),
    createSettingsRouter(config)
  );
  app.use("/api/user", authenticateToken(authToken), createUserRouter(config));

  // Serve static files from console-ui build
  // __dirname will be dist/ after compilation, console UI is in dist/console/
  const staticDir = path.join(__dirname, "console");
  app.use(express.static(staticDir));

  // SPA fallback
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  // Error handler
  app.use(errorHandler);

  // Start server
  const server = app.listen(config.port, "127.0.0.1");

  // Setup graceful shutdown
  const httpTerminator = createHttpTerminator({ server });

  process.on("SIGTERM", async () => {
    console.log("\\nShutting down gracefully...");
    await httpTerminator.terminate();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("\\nShutting down gracefully...");
    await httpTerminator.terminate();
    process.exit(0);
  });

  const url = `http://localhost:${config.port}?token=${authToken}`;

  return { url, token: authToken };
}
