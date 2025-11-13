# Server Actions with TanStack Form

This directory contains all server actions for the Wraps dashboard, built with TanStack Form for type-safe, validated form submissions.

## Architecture

```
actions/
├── aws-accounts.ts      # AWS account connection
├── permissions.ts       # Permission management
└── README.md           # This file

lib/forms/
├── connect-aws-account.ts  # Form schema & options for AWS connection
└── grant-access.ts         # Form schema & options for permissions
```

## Pattern

All server actions follow this pattern:

### 1. Define Form Schema (`lib/forms/*.ts`)

```typescript
import { formOptions } from "@tanstack/react-form/nextjs";
import { z } from "zod";

export const myFormSchema = z.object({
  field1: z.string().min(1),
  field2: z.number(),
});

export type MyFormInput = z.infer<typeof myFormSchema>;

export const myFormOpts = formOptions({
  defaultValues: {
    field1: "",
    field2: 0,
  } satisfies MyFormInput,
});
```

### 2. Create Server Action (`actions/*.ts`)

```typescript
"use server";

import { createServerValidate, type ServerValidateError } from "@tanstack/react-form/nextjs";
import { myFormOpts, myFormSchema } from "@/lib/forms/my-form";

const serverValidate = createServerValidate({
  ...myFormOpts,
  onServerValidate: ({ value }) => {
    const result = myFormSchema.safeParse(value);
    if (!result.success) {
      return result.error.errors[0]?.message || "Validation failed";
    }
  },
});

export async function myAction(prev: unknown, formData: FormData) {
  try {
    const validatedData = await serverValidate(formData);

    // 1. Auth check
    // 2. Permission check
    // 3. Business logic
    // 4. Database operations
    // 5. Revalidate paths

    return { success: true };
  } catch (e) {
    if (e && typeof e === "object" && "formState" in e) {
      return (e as ServerValidateError).formState;
    }
    return { error: "Internal error" };
  }
}
```

### 3. Create Client Component (`components/forms/*.tsx`)

```typescript
"use client";

import { useActionState } from "react";
import { mergeForm, useForm, useTransform } from "@tanstack/react-form";
import { initialFormState } from "@tanstack/react-form/nextjs";
import { useStore } from "@tanstack/react-store";
import { myAction } from "@/actions/my-action";
import { myFormOpts } from "@/lib/forms/my-form";

export function MyForm() {
  const [state, action] = useActionState(myAction, initialFormState);

  const form = useForm({
    ...myFormOpts,
    transform: useTransform(
      (baseForm) => mergeForm(baseForm, state ?? {}),
      [state]
    ),
  });

  const formErrors = useStore(form.store, (formState) => formState.errors);

  return (
    <form action={action as never} onSubmit={() => form.handleSubmit()}>
      {formErrors.map((error) => (
        <p key={error as string}>{error}</p>
      ))}

      <form.Field
        name="field1"
        validators={{
          onChange: ({ value }) =>
            !value ? "Field is required" : undefined,
        }}
      >
        {(field) => (
          <div>
            <input
              name={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors.map((error) => (
              <p key={error as string}>{error}</p>
            ))}
          </div>
        )}
      </form.Field>

      <form.Subscribe
        selector={(formState) => [formState.canSubmit, formState.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <button type="submit" disabled={!canSubmit}>
            {isSubmitting ? "Loading..." : "Submit"}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
```

## Available Actions

### AWS Accounts

#### `connectAWSAccountAction`
Connects a new AWS account to an organization.

**Form**: `lib/forms/connect-aws-account.ts`
**Component**: `components/forms/connect-aws-account-form.tsx`

**Flow**:
1. Validates AWS credentials (account ID, role ARN, region)
2. Tests connection by assuming the IAM role
3. Saves account to database
4. Grants default permissions to org members

**Permissions**: Requires `owner` or `admin` role in organization

---

### Permissions

#### `grantAccessAction`
Grants permission to a user for an AWS account.

**Form**: `lib/forms/grant-access.ts`

**Flow**:
1. Validates user exists in organization
2. Checks current user has `manage` permission
3. Grants specified permission level (READ_ONLY, FULL_ACCESS, ADMIN)
4. Optionally sets expiration date

**Permissions**: Requires `manage` permission on the AWS account

#### `revokeAccessAction`
Revokes a user's permission for an AWS account.

**Flow**:
1. Checks current user has `manage` permission
2. Deletes permission grant from database

**Permissions**: Requires `manage` permission on the AWS account

## Benefits of This Pattern

✅ **Type Safety**: End-to-end TypeScript from form to server
✅ **Validation**: Client-side + server-side validation with Zod
✅ **No Boilerplate**: No NextResponse, status codes, or request parsing
✅ **Progressive Enhancement**: Forms work without JavaScript
✅ **Real-time Feedback**: Field-level errors, form-level errors, loading states
✅ **Automatic Revalidation**: Built-in cache revalidation with `revalidatePath()`
✅ **Better DX**: `useActionState` hook handles state management

## Testing

Test server actions directly as functions:

```typescript
import { describe, it, expect, vi } from "vitest";
import { connectAWSAccountAction } from "./aws-accounts";

describe("connectAWSAccountAction", () => {
  it("should connect AWS account successfully", async () => {
    const formData = new FormData();
    formData.set("organizationId", "org-123");
    formData.set("name", "Production");
    formData.set("accountId", "123456789012");
    formData.set("region", "us-east-1");
    formData.set("roleArn", "arn:aws:iam::123456789012:role/test");

    const result = await connectAWSAccountAction(null, formData);

    expect(result).toEqual({
      success: true,
      account: expect.objectContaining({
        id: expect.any(String),
        name: "Production",
      }),
    });
  });
});
```

## Adding New Actions

1. **Create form schema** in `lib/forms/`
2. **Create server action** in `actions/`
3. **Create client component** in `components/forms/`
4. **Export from index** if needed
5. **Add tests** in `__tests__/`

## References

- [TanStack Form Docs](https://tanstack.com/form/latest)
- [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Zod Validation](https://zod.dev/)
