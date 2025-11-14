# Create Server Action Skill

You are an expert at building Next.js server actions with TanStack Form validation for the Wraps monorepo.

## Core Principles

1. **Always use TanStack Form's server validation** - Use `@tanstack/react-form/nextjs` utilities
2. **Type-safe with Zod** - Define schemas and use with TanStack Form validators
3. **Share validation logic** - Use shared form options between client and server
4. **Proper error handling** - Catch `ServerValidateError` and return form state
5. **Security first** - Server-side validation is the source of truth
6. **Good DX** - Clear error messages, proper TypeScript types, helpful responses

## Required Packages

```json
{
  "@tanstack/react-form": "latest",
  "@tanstack/zod-form-adapter": "latest",
  "zod": "latest"
}
```

## Standard Server Action Pattern

### 1. Define Shared Form Options

Create a shared file (e.g., `shared-form-opts.ts`) that defines validation logic used by both client and server:

```typescript
// shared-form-opts.ts
import { z } from 'zod'

// Define Zod schema
export const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  age: z.coerce.number().min(13, 'Must be at least 13 years old'),
})

export type FormValues = z.infer<typeof formSchema>

// Form options shared between client and server
export const formOpts = {
  defaultValues: {
    email: '',
    name: '',
    age: 0,
  } satisfies FormValues,
}
```

### 2. Create Server Action

Create a server action file (e.g., `action.ts`) with proper validation and error handling:

```typescript
// action.ts
'use server'

import {
  ServerValidateError,
  createServerValidate,
} from '@tanstack/react-form/nextjs'
import { formOpts, formSchema, type FormValues } from './shared-form-opts'

// Create server validator
const serverValidate = createServerValidate({
  ...formOpts,
  onServerValidate: ({ value }) => {
    // Additional server-side validation beyond schema
    if (value.age < 18) {
      return 'Server validation: You must be at least 18 to sign up'
    }
    // Return undefined if validation passes
    return undefined
  },
})

export async function submitFormAction(prev: unknown, formData: FormData) {
  try {
    // Validate form data
    const validatedData = await serverValidate(formData)

    // Perform business logic with validated data
    // Example: Save to database
    // await db.users.create({
    //   data: {
    //     email: validatedData.email,
    //     name: validatedData.name,
    //     age: validatedData.age,
    //   },
    // })

    // Return success response
    return {
      success: true,
      message: 'Form submitted successfully!',
      data: validatedData,
    }
  } catch (e) {
    // Handle validation errors
    if (e instanceof ServerValidateError) {
      return e.formState
    }

    // Handle other errors
    console.error('Unexpected error:', e)
    throw e
  }
}
```

### 3. Client-Side Form Component

Create a form component that uses the server action:

```typescript
// form-component.tsx
'use client'

import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { useActionState } from 'react'
import { formOpts, formSchema, type FormValues } from './shared-form-opts'
import { submitFormAction } from './action'
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function MyForm() {
  const [actionState, formAction] = useActionState(submitFormAction, undefined)

  const form = useForm<FormValues>({
    ...formOpts,
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      // Form will be submitted via server action
      console.log('Form values:', value)
    },
  })

  return (
    <form
      action={formAction as unknown as string}
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      {/* Name Field */}
      <form.Field name="name">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <FieldContent>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </FieldContent>
            </Field>
          )
        }}
      </form.Field>

      {/* Email Field */}
      <form.Field name="email">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Email</FieldLabel>
              <FieldContent>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </FieldContent>
            </Field>
          )
        }}
      </form.Field>

      {/* Age Field */}
      <form.Field name="age">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Age</FieldLabel>
              <FieldContent>
                <Input
                  id={field.name}
                  name={field.name}
                  type="number"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </FieldContent>
            </Field>
          )
        }}
      </form.Field>

      {/* Submit Button */}
      <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
        {({ canSubmit, isSubmitting }) => (
          <Button type="submit" disabled={!canSubmit} loading={isSubmitting}>
            Submit
          </Button>
        )}
      </form.Subscribe>

      {/* Show server response */}
      {actionState && 'success' in actionState && actionState.success && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-800">{actionState.message}</p>
        </div>
      )}
    </form>
  )
}
```

## Advanced Patterns

### Server-Side Only Validation

For validation that should only happen on the server (e.g., checking database constraints):

```typescript
const serverValidate = createServerValidate({
  ...formOpts,
  onServerValidate: async ({ value }) => {
    // Check if email already exists in database
    const existingUser = await db.users.findUnique({
      where: { email: value.email },
    })

    if (existingUser) {
      return {
        form: 'Email already registered',
        fields: {
          email: 'This email is already registered',
        },
      }
    }

    return undefined
  },
})
```

### Complex Validation with Multiple Errors

Return structured error objects for form-level and field-level errors:

```typescript
const serverValidate = createServerValidate({
  ...formOpts,
  onServerValidate: async ({ value }) => {
    const errors: { form?: string; fields?: Record<string, string> } = {}

    // Check multiple conditions
    if (value.password !== value.confirmPassword) {
      errors.fields = {
        ...errors.fields,
        confirmPassword: 'Passwords do not match',
      }
    }

    if (await isEmailBlacklisted(value.email)) {
      errors.fields = {
        ...errors.fields,
        email: 'This email domain is not allowed',
      }
    }

    if (Object.keys(errors).length > 0) {
      return errors
    }

    return undefined
  },
})
```

### Returning Success Data

Return structured success responses with data:

```typescript
export async function submitFormAction(prev: unknown, formData: FormData) {
  try {
    const validatedData = await serverValidate(formData)

    // Create user in database
    const user = await db.users.create({
      data: {
        email: validatedData.email,
        name: validatedData.name,
      },
    })

    // Return success with created resource
    return {
      success: true,
      message: 'Account created successfully!',
      data: {
        userId: user.id,
        email: user.email,
      },
    }
  } catch (e) {
    if (e instanceof ServerValidateError) {
      return e.formState
    }

    // Return structured error response
    return {
      success: false,
      error: 'Failed to create account. Please try again.',
    }
  }
}
```

### Rate Limiting Example

Add rate limiting to server actions:

```typescript
import { headers } from 'next/headers'
import { ratelimit } from '@/lib/rate-limit'

export async function submitFormAction(prev: unknown, formData: FormData) {
  // Rate limit by IP
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'

  const { success: rateLimitSuccess } = await ratelimit.limit(ip)

  if (!rateLimitSuccess) {
    return {
      success: false,
      error: 'Too many requests. Please try again later.',
    }
  }

  try {
    const validatedData = await serverValidate(formData)

    // Process form...

    return {
      success: true,
      message: 'Form submitted successfully!',
    }
  } catch (e) {
    if (e instanceof ServerValidateError) {
      return e.formState
    }
    throw e
  }
}
```

### File Upload Handling

Handle file uploads in server actions:

```typescript
// shared-form-opts.ts
export const formSchema = z.object({
  name: z.string().min(2),
  avatar: z.instanceof(File).optional(),
})

// action.ts
export async function submitFormAction(prev: unknown, formData: FormData) {
  try {
    const validatedData = await serverValidate(formData)

    // Handle file upload
    const avatar = formData.get('avatar') as File
    if (avatar && avatar.size > 0) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!validTypes.includes(avatar.type)) {
        return {
          success: false,
          error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
          fields: {
            avatar: 'Invalid file type',
          },
        }
      }

      // Validate file size (5MB max)
      if (avatar.size > 5 * 1024 * 1024) {
        return {
          success: false,
          error: 'File too large. Maximum size is 5MB.',
          fields: {
            avatar: 'File too large',
          },
        }
      }

      // Upload to storage
      const uploadedUrl = await uploadFile(avatar)

      // Save to database with file URL
      await db.users.create({
        data: {
          name: validatedData.name,
          avatarUrl: uploadedUrl,
        },
      })
    }

    return {
      success: true,
      message: 'Profile created successfully!',
    }
  } catch (e) {
    if (e instanceof ServerValidateError) {
      return e.formState
    }
    throw e
  }
}
```

## Response Type Patterns

### Standard Success Response

```typescript
type SuccessResponse<T = unknown> = {
  success: true
  message: string
  data?: T
}
```

### Standard Error Response

```typescript
type ErrorResponse = {
  success: false
  error: string
  fields?: Record<string, string>
}
```

### Union Type for Actions

```typescript
type ActionResponse<T = unknown> =
  | SuccessResponse<T>
  | ErrorResponse
  | FormState // From ServerValidateError
```

## Best Practices

1. **Always validate on server** - Never trust client-side validation alone
2. **Return structured responses** - Use consistent response types with `success` flag
3. **Handle errors gracefully** - Catch `ServerValidateError` and return form state
4. **Share validation logic** - DRY principle with shared form options
5. **Type everything** - Use TypeScript for form values and responses
6. **Log errors** - Log unexpected errors for debugging
7. **Rate limit** - Protect against abuse with rate limiting
8. **Sanitize inputs** - Clean user input before database operations
9. **Validate files** - Check file types, sizes, and content
10. **Return helpful errors** - Clear messages that help users fix issues

## Security Checklist

- ✅ Server-side validation is required (never skip)
- ✅ Validate all inputs including hidden fields
- ✅ Sanitize inputs before database queries
- ✅ Rate limit form submissions
- ✅ Validate file uploads (type, size, content)
- ✅ Check authentication/authorization before processing
- ✅ Use parameterized queries (prevent SQL injection)
- ✅ Validate CSRF tokens (Next.js handles this automatically)
- ✅ Log security-relevant events
- ✅ Don't leak sensitive error details to client

## Common Validation Patterns

### Email Uniqueness Check

```typescript
onServerValidate: async ({ value }) => {
  const existing = await db.users.findUnique({
    where: { email: value.email },
  })

  if (existing) {
    return {
      fields: { email: 'Email already registered' },
    }
  }
}
```

### Username Availability

```typescript
onServerValidate: async ({ value }) => {
  const existing = await db.users.findUnique({
    where: { username: value.username },
  })

  if (existing) {
    return {
      fields: { username: 'Username is taken' },
    }
  }
}
```

### Cross-Field Validation

```typescript
onServerValidate: ({ value }) => {
  if (value.endDate < value.startDate) {
    return {
      form: 'End date must be after start date',
      fields: {
        endDate: 'Must be after start date',
      },
    }
  }
}
```

### Conditional Validation

```typescript
onServerValidate: ({ value }) => {
  if (value.accountType === 'business' && !value.companyName) {
    return {
      fields: {
        companyName: 'Company name is required for business accounts',
      },
    }
  }
}
```

## Testing Server Actions

### Unit Test Example

```typescript
import { describe, it, expect, vi } from 'vitest'
import { submitFormAction } from './action'

describe('submitFormAction', () => {
  it('validates and submits form data', async () => {
    const formData = new FormData()
    formData.append('name', 'John Doe')
    formData.append('email', 'john@example.com')
    formData.append('age', '25')

    const result = await submitFormAction(undefined, formData)

    expect(result).toEqual({
      success: true,
      message: 'Form submitted successfully!',
    })
  })

  it('returns validation errors for invalid data', async () => {
    const formData = new FormData()
    formData.append('name', 'J') // Too short
    formData.append('email', 'invalid')
    formData.append('age', '10') // Too young

    const result = await submitFormAction(undefined, formData)

    expect(result).toHaveProperty('errors')
  })
})
```

## When Creating Server Actions

1. **Define shared form options** - Create validation schema and default values
2. **Create server action file** - Use `'use server'` directive
3. **Set up createServerValidate** - Add server-specific validation logic
4. **Handle errors properly** - Catch `ServerValidateError` and other exceptions
5. **Return structured responses** - Consistent response types
6. **Add business logic** - Database operations, external API calls, etc.
7. **Test thoroughly** - Unit tests for validation and business logic
8. **Document the action** - JSDoc comments for parameters and return types

## Common Imports

```typescript
// Server action
'use server'

import {
  ServerValidateError,
  createServerValidate,
} from '@tanstack/react-form/nextjs'
import { z } from 'zod'

// Client component
'use client'

import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { useActionState } from 'react'
```

---

**Remember**: Server-side validation is your security boundary. Always validate on the server, never trust client input, and return clear, structured responses.
