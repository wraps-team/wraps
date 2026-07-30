"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { memo } from "react";
import { CodeTabs } from "@/components/ui/shadcn-io/code-tabs";

// Code examples organized for CodeTabs - keys are tab labels, values are code strings
const codeExamples: Record<string, string> = {
  "Next.js App": `// app/actions/email.ts
'use server';

import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

export async function sendWelcomeEmail(email: string) {
  const result = await email.send({
    from: 'hello@yourdomain.com',
    to: email,
    subject: 'Welcome to our app!',
    html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  });

  return result;
}

// app/signup/page.tsx
import { sendWelcomeEmail } from '../actions/email';

export default function SignupPage() {
  async function handleSignup(formData: FormData) {
    'use server';
    const email = formData.get('email') as string;
    await sendWelcomeEmail(email);
  }

  return (
    <form action={handleSignup}>
      <input type="email" name="email" required />
      <button type="submit">Sign Up</button>
    </form>
  );
}`,
  "Next.js Pages": `// pages/api/send-email.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, subject, html } = req.body;

  const result = await email.send({
    from: 'hello@yourdomain.com',
    to,
    subject,
    html,
  });

  if (result.success) {
    res.status(200).json({ messageId: result.data.messageId });
  } else {
    res.status(400).json({ error: result.error });
  }
}`,
  Express: `import express from 'express';
import { WrapsEmail } from '@wraps.dev/email';

const app = express();
const email = new WrapsEmail();

app.use(express.json());

app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, html } = req.body;

    const result = await email.send({
      from: 'hello@yourdomain.com',
      to,
      subject,
      html,
    });

    if (result.success) {
      res.json({
        success: true,
        messageId: result.data.messageId
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send email'
    });
  }
});

app.listen(3000);`,
  Remix: `// app/routes/signup.tsx
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get('email') as string;

  const result = await email.send({
    from: 'hello@yourdomain.com',
    to: email,
    subject: 'Welcome to our app!',
    html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  });

  if (result.success) {
    return json({ success: true, messageId: result.data.messageId });
  }

  return json({ success: false, error: result.error }, { status: 400 });
}

export default function Signup() {
  return (
    <form method="post">
      <input type="email" name="email" required />
      <button type="submit">Sign Up</button>
    </form>
  );
}`,
  "Vercel Edge": `// api/send-email.ts
import { WrapsEmail } from '@wraps.dev/email';

// Automatically uses Vercel OIDC token
const email = new WrapsEmail();

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { to, subject, html } = await req.json();

  const result = await email.send({
    from: 'hello@yourdomain.com',
    to,
    subject,
    html,
  });

  return Response.json(result);
}

export const config = {
  runtime: 'edge',
};`,
  Lambda: `import { WrapsEmail } from '@wraps.dev/email';
import type { APIGatewayProxyHandler } from 'aws-lambda';

// Automatically uses Lambda IAM role
const email = new WrapsEmail();

export const handler: APIGatewayProxyHandler = async (event) => {
  const { to, subject, html } = JSON.parse(event.body || '{}');

  const result = await email.send({
    from: 'hello@yourdomain.com',
    to,
    subject,
    html,
  });

  return {
    statusCode: result.success ? 200 : 400,
    body: JSON.stringify(result),
    headers: {
      'Content-Type': 'application/json',
    },
  };
};`,
};

export const CodeExamplesSection = memo(function CodeExamplesSection() {
  return (
    <section className="border-y bg-gradient-to-b from-muted/30 via-background to-muted/30 py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* Section Header */}
          <div className="mb-12 text-center">
            <Badge className="mb-4" variant="outline">
              Integration Examples
            </Badge>
            <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
              Works with Your Favorite Framework
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              The @wraps.dev/email SDK works with any JavaScript or TypeScript
              framework. Here's how to send your first email.
            </p>
          </div>

          {/* Framework Tabs */}
          <CodeTabs
            className="border-2 shadow-lg"
            codes={codeExamples}
            lang="typescript"
            themes={{
              light: "vitesse-light",
              dark: "vitesse-dark",
            }}
          />

          {/* Key Features */}
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            <Card className="border-2 transition-shadow hover:shadow-lg">
              <CardContent className="p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <svg
                    className="h-5 w-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold">Type-Safe</h3>
                <p className="text-muted-foreground text-sm">
                  Full TypeScript support with autocomplete and type checking
                  out of the box.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 transition-shadow hover:shadow-lg">
              <CardContent className="p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <svg
                    className="h-5 w-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold">Zero Config</h3>
                <p className="text-muted-foreground text-sm">
                  Automatic credential detection for Vercel OIDC, Lambda IAM
                  roles, and environment variables.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 transition-shadow hover:shadow-lg">
              <CardContent className="p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <svg
                    className="h-5 w-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold">Simple API</h3>
                <p className="text-muted-foreground text-sm">
                  Clean, intuitive API. Send emails with just a few lines of
                  code.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
});
