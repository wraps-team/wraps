# Create Form Skill

You are an expert at building forms using TanStack Form with shadcn/ui components in the Wraps monorepo.

## Core Principles

1. **Always use TanStack Form** (`@tanstack/react-form`) - never React Hook Form or other form libraries
2. **Use shadcn/ui components** - Field, Input, Textarea, Select, InputGroup, etc.
3. **Zod validation** - Define schemas and use with TanStack Form's validators
4. **Type-safe** - Full TypeScript with proper types from Zod schema inference
5. **Accessible** - Proper ARIA attributes, labels, and error announcements
6. **Beautiful UX** - Loading states, validation feedback, clear error messages

## Required Components

Always use these shadcn/ui components (already available in the codebase):

- `Field`, `FieldSet`, `FieldLegend`, `FieldGroup`, `FieldLabel`, `FieldContent`, `FieldTitle`, `FieldDescription`, `FieldError`, `FieldSeparator`
- `Input`, `InputGroup`, `InputGroupInput`, `InputGroupAddon`, `InputGroupButton`, `InputGroupText`, `InputGroupTextarea`
- `Textarea`
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`
- `Button`
- `Spinner` (for loading states)
- `Item` (for list items in array fields)
- Other components as needed (Checkbox, RadioGroup, Switch, etc.)

## Standard Form Pattern

### 1. Define Zod Schema

```typescript
import { z } from 'zod'

const formSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().max(100, 'Description must be under 100 characters').optional(),
  email: z.string().email('Invalid email address'),
})

type FormValues = z.infer<typeof formSchema>
```

### 2. Initialize Form

```typescript
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'

const form = useForm<FormValues>({
  defaultValues: {
    title: '',
    description: '',
    email: '',
  },
  validators: {
    onSubmit: formSchema,
  },
  onSubmit: async ({ value }) => {
    // Handle form submission
    console.log('Form values:', value)
  },
})
```

### 3. Build Form Fields

```typescript
<form
  onSubmit={(e) => {
    e.preventDefault()
    form.handleSubmit()
  }}
>
  {/* Text Input Field */}
  <form.Field
    name="title"
    validators={{
      onChange: ({ value }) =>
        value.length < 5 ? 'Title must be at least 5 characters' : undefined
    }}
  >
    {(field) => {
      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
      return (
        <Field data-invalid={isInvalid}>
          <FieldLabel htmlFor={field.name}>Title</FieldLabel>
          <FieldContent>
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              aria-invalid={isInvalid}
            />
            <FieldDescription>Enter a descriptive title</FieldDescription>
            {isInvalid && <FieldError errors={field.state.meta.errors} />}
          </FieldContent>
        </Field>
      )
    }}
  </form.Field>

  {/* Textarea Field */}
  <form.Field name="description">
    {(field) => {
      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
      return (
        <Field data-invalid={isInvalid}>
          <FieldLabel htmlFor={field.name}>Description</FieldLabel>
          <FieldContent>
            <Textarea
              id={field.name}
              name={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              aria-invalid={isInvalid}
              rows={4}
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
</form>
```

## Component-Specific Patterns

### Select Field

```typescript
<form.Field name="category">
  {(field) => {
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
    return (
      <Field data-invalid={isInvalid}>
        <FieldLabel htmlFor={field.name}>Category</FieldLabel>
        <FieldContent>
          <Select
            value={field.state.value}
            onValueChange={(value) => field.handleChange(value)}
          >
            <SelectTrigger id={field.name} aria-invalid={isInvalid}>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="option1">Option 1</SelectItem>
              <SelectItem value="option2">Option 2</SelectItem>
            </SelectContent>
          </Select>
          {isInvalid && <FieldError errors={field.state.meta.errors} />}
        </FieldContent>
      </Field>
    )
  }}
</form.Field>
```

### Input with Addon (InputGroup)

```typescript
<form.Field name="amount">
  {(field) => {
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
    return (
      <Field data-invalid={isInvalid}>
        <FieldLabel htmlFor={field.name}>Amount</FieldLabel>
        <FieldContent>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id={field.name}
              name={field.name}
              type="number"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              aria-invalid={isInvalid}
              placeholder="0.00"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>USD</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {isInvalid && <FieldError errors={field.state.meta.errors} />}
        </FieldContent>
      </Field>
    )
  }}
</form.Field>
```

### Array Fields (Dynamic Lists)

```typescript
// Schema
const formSchema = z.object({
  emails: z.array(z.object({
    address: z.string().email('Invalid email'),
  })).min(1, 'At least one email required').max(5, 'Maximum 5 emails'),
})

// Form Field
<form.Field name="emails" mode="array">
  {(field) => (
    <FieldSet>
      <FieldLegend>Email Addresses</FieldLegend>
      {field.state.value.map((_, index) => (
        <form.Field key={index} name={`emails[${index}].address`}>
          {(subField) => {
            const isInvalid = subField.state.meta.isTouched && !subField.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldContent>
                  <div className="flex gap-2">
                    <Input
                      value={subField.state.value}
                      onChange={(e) => subField.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="email@example.com"
                    />
                    {field.state.value.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => field.removeValue(index)}
                      >
                        <TrashIcon />
                      </Button>
                    )}
                  </div>
                  {isInvalid && <FieldError errors={subField.state.meta.errors} />}
                </FieldContent>
              </Field>
            )
          }}
        </form.Field>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => field.pushValue({ address: '' })}
        disabled={field.state.value.length >= 5}
      >
        Add Email
      </Button>
    </FieldSet>
  )}
</form.Field>
```

## Validation Strategies

### onChange Validation (Real-time)

```typescript
<form.Field
  name="username"
  validators={{
    onChange: ({ value }) => {
      if (value.length < 3) return 'Username must be at least 3 characters'
      if (!/^[a-z0-9_]+$/.test(value)) return 'Only lowercase letters, numbers, and underscores'
      return undefined
    },
  }}
>
  {/* field render */}
</form.Field>
```

### onBlur Validation

```typescript
<form.Field
  name="email"
  validators={{
    onBlur: ({ value }) => {
      if (!z.string().email().safeParse(value).success) {
        return 'Invalid email address'
      }
      return undefined
    },
  }}
>
  {/* field render */}
</form.Field>
```

### Async Validation (e.g., username availability)

```typescript
<form.Field
  name="username"
  validators={{
    onChangeAsync: async ({ value }) => {
      await new Promise((resolve) => setTimeout(resolve, 500)) // Debounce
      const available = await checkUsernameAvailability(value)
      return available ? undefined : 'Username already taken'
    },
  }}
>
  {(field) => {
    const isValidating = field.state.meta.isValidating
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
    return (
      <Field data-invalid={isInvalid}>
        <FieldLabel htmlFor={field.name}>Username</FieldLabel>
        <FieldContent>
          <InputGroup>
            <InputGroupInput
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              aria-invalid={isInvalid}
            />
            <InputGroupAddon align="inline-end">
              {isValidating && <Spinner />}
            </InputGroupAddon>
          </InputGroup>
          {isInvalid && <FieldError errors={field.state.meta.errors} />}
        </FieldContent>
      </Field>
    )
  }}
</form.Field>
```

## Advanced Patterns

### Conditional Fields

```typescript
<form.Subscribe selector={(state) => state.values.accountType}>
  {(accountType) => (
    accountType === 'business' && (
      <form.Field name="companyName">
        {/* company name field */}
      </form.Field>
    )
  )}
</form.Subscribe>
```

### Form-level Validation

```typescript
const form = useForm({
  defaultValues: { password: '', confirmPassword: '' },
  validators: {
    onSubmit: ({ value }) => {
      const result = formSchema.safeParse(value)
      if (!result.success) {
        return result.error.formErrors
      }
      if (value.password !== value.confirmPassword) {
        return {
          form: 'Passwords do not match',
          fields: { confirmPassword: 'Passwords do not match' }
        }
      }
      return undefined
    }
  },
  onSubmit: async ({ value }) => { /* ... */ }
})
```

### Reset Form

```typescript
<Button
  type="button"
  variant="outline"
  onClick={() => form.reset()}
>
  Reset Form
</Button>
```

## Accessibility Checklist

- ✅ All inputs have associated labels (`FieldLabel` with `htmlFor`)
- ✅ Required fields marked with `required` attribute or aria-required
- ✅ Invalid fields have `aria-invalid={true}`
- ✅ Error messages properly associated with inputs
- ✅ Form has clear submit button
- ✅ Loading states announced (Spinner with aria-live region)
- ✅ Field descriptions provide helpful context

## UX Best Practices

1. **Show validation on blur/submit** - Don't overwhelm users with errors as they type (unless explicitly needed)
2. **Clear error messages** - Be specific about what's wrong and how to fix it
3. **Loading states** - Always show Spinner during async operations
4. **Disable submit during submission** - Prevent double submissions
5. **Success feedback** - Show toast/message after successful submission
6. **Preserve data** - Don't clear form on error, let users fix mistakes
7. **Auto-focus first error** - Improve keyboard navigation

## Example: Complete Contact Form

```typescript
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { z } from 'zod'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  subject: z.enum(['support', 'sales', 'feedback'], {
    errorMap: () => ({ message: 'Please select a subject' }),
  }),
  message: z.string().min(10, 'Message must be at least 10 characters').max(500, 'Message too long'),
})

type ContactFormValues = z.infer<typeof contactSchema>

export function ContactForm() {
  const form = useForm<ContactFormValues>({
    defaultValues: {
      name: '',
      email: '',
      subject: undefined,
      message: '',
    },
    validators: {
      onSubmit: contactSchema,
    },
    onSubmit: async ({ value }) => {
      // Submit to API
      await new Promise((resolve) => setTimeout(resolve, 2000))
      console.log('Contact form submitted:', value)
      // Show success toast
      form.reset()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="space-y-6"
    >
      <FieldSet>
        <FieldLegend>Contact Information</FieldLegend>

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
                    autoComplete="name"
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
                    autoComplete="email"
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </FieldContent>
              </Field>
            )
          }}
        </form.Field>

        {/* Subject Field */}
        <form.Field name="subject">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Subject</FieldLabel>
                <FieldContent>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value)}
                  >
                    <SelectTrigger id={field.name} aria-invalid={isInvalid}>
                      <SelectValue placeholder="Select a subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="support">Support</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="feedback">Feedback</SelectItem>
                    </SelectContent>
                  </Select>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </FieldContent>
              </Field>
            )
          }}
        </form.Field>

        {/* Message Field */}
        <form.Field name="message">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Message</FieldLabel>
                <FieldContent>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    rows={5}
                  />
                  <FieldDescription>
                    {field.state.value.length}/500 characters
                  </FieldDescription>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </FieldContent>
              </Field>
            )
          }}
        </form.Field>
      </FieldSet>

      {/* Submit Button */}
      <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
        {({ canSubmit, isSubmitting }) => (
          <div className="flex gap-3">
            <Button type="submit" disabled={!canSubmit} loading={isSubmitting}>
              Send Message
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
              disabled={isSubmitting}
            >
              Reset
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}
```

## When Creating Forms

1. **Ask for requirements** - What fields are needed? What validation rules?
2. **Define Zod schema first** - Type-safe validation schema
3. **Initialize form** - Set up useForm with validators
4. **Build fields incrementally** - One field at a time with proper validation
5. **Add submit handler** - Handle form submission with loading states
6. **Test accessibility** - Ensure all fields are properly labeled and validated
7. **Style appropriately** - Use consistent spacing and layouts

## Common Imports

```typescript
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { z } from 'zod'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldGroup,
  FieldSeparator,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Item } from '@/components/ui/item'
```

---

**Remember**: Always prioritize accessibility, type safety, and user experience when building forms. Follow the established patterns and use the proper shadcn/ui components.
