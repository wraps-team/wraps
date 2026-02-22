import { createWorld } from "@wraps.dev/world-aws";
import { createSQSHandler } from "@wraps.dev/world-aws/lambda";
import { serve } from "workflow";

const world = createWorld();

export const handler = createSQSHandler(serve(world));
