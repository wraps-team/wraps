import pc from "picocolors";

export function displaySMSSDKUsage(region: string): void {
  console.log(pc.dim("  npm install @wraps.dev/sms"));
  console.log("");
  console.log(pc.dim("  import { WrapsSMS } from '@wraps.dev/sms';"));
  console.log(pc.dim(`  const sms = new WrapsSMS({ region: '${region}' });`));
  console.log(pc.dim("  await sms.send({"));
  console.log(pc.dim("    to: '+14155551234',"));
  console.log(pc.dim("    message: 'Your code is 123456',"));
  console.log(pc.dim("  });"));
}
