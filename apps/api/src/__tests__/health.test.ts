import { describe, expect, it } from "vitest";
import { Elysia } from "elysia";
import { healthRoutes } from "../routes/health";

describe("Health endpoints", () => {
  const app = new Elysia().use(healthRoutes);

  it("GET /health returns ok status", async () => {
    const response = await app.handle(
      new Request("http://localhost/health")
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBe("1.0.0");
  });

  it("GET / returns API info", async () => {
    const response = await app.handle(
      new Request("http://localhost/")
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe("Wraps Platform API");
    expect(body.version).toBe("1.0.0");
    expect(body.docs).toBe("/swagger");
  });
});
