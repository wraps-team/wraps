import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
import { normalizeDatabaseUrl } from "./src/connection-url";

dotenv.config({
  path: "../../apps/web/.env.local",
});

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL || "").url,
  },
});
