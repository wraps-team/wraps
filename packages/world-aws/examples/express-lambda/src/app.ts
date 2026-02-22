import { createWorld } from "@wraps.dev/world-aws";
import express from "express";
import { serve, start } from "workflow";
import orderProcessing from "./workflows/order-processing.js";

const world = createWorld();
const app = express();

app.use(express.json());

// Workflow queue handler (for local dev — in production, use Lambda SQS trigger)
app.post("/queue", async (req, res) => {
  const handler = serve(world);
  const response = await handler(
    new Request("http://localhost/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    })
  );
  res.status(response.status).json(await response.json());
});

// Start a new order processing workflow
app.post("/orders", async (req, res) => {
  const run = await start(orderProcessing, req.body);
  res.json({ runId: run.runId });
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
