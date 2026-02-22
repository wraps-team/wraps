import { start } from "workflow";
import onboarding from "../../workflows/onboarding";

export async function POST(request: Request) {
  const { email } = await request.json();

  const run = await start(onboarding, email);

  return Response.json({ runId: run.runId });
}
