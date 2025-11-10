# Wraps CLI Testing Documentation

## Test Coverage Summary

**Overall Coverage: 97.25%** ✅

- **Statements:** 97.25%
- **Branches:** 86.86%
- **Functions:** 100%
- **Lines:** 97.15%

### Coverage by Module

| Module | Statements | Branches | Functions | Lines |
|--------|-----------|----------|-----------|-------|
| **commands/** | 97.77% | 79.16% | 100% | 97.64% |
| status.ts | 91.66% | 58.33% | 100% | 91.66% |
| verify.ts | 100% | 86.11% | 100% | 100% |
| **utils/** | 97.01% | 91.01% | 100% | 96.93% |
| aws.ts | 100% | 83.33% | 100% | 100% |
| errors.ts | 100% | 100% | 100% | 100% |
| metadata.ts | 89.47% | 94.11% | 100% | 89.28% |
| output.ts | 100% | 90% | 100% | 100% |
| route53.ts | 100% | 100% | 100% | 100% |

## Test Suite Statistics

- **Total Tests:** 110
- **Passing:** 109
- **Skipped:** 1
- **Test Files:** 7

## Test Structure

```
packages/cli/src/
├── utils/__tests__/
│   ├── aws.test.ts (21 tests)
│   ├── errors.test.ts (13 tests)
│   ├── metadata.test.ts (28 tests)
│   ├── output.test.ts (19 tests)
│   └── route53.test.ts (16 tests)
└── commands/__tests__/
    ├── status.test.ts (5 tests)
    └── verify.test.ts (8 tests)
```

## Test Categories

### Unit Tests (97 tests)

#### AWS Utilities (`aws.test.ts`)
- ✅ AWS credentials validation
- ✅ Region validation
- ✅ Environment variable handling
- ✅ SES domain listing
- ✅ SES sandbox detection
- ✅ Error handling

#### Error Handling (`errors.test.ts`)
- ✅ Custom WrapsError class
- ✅ CLI error handler
- ✅ All error factory functions
- ✅ Error message formatting
- ✅ Suggestion and docs URL display

#### Metadata Management (`metadata.test.ts`)
- ✅ Connection metadata creation
- ✅ Feature configuration tracking
- ✅ Identity configuration management
- ✅ File persistence (save/load/delete)
- ✅ Connection listing
- ✅ Modified and replaced resource tracking

#### Output Formatting (`output.test.ts`)
- ✅ Deployment progress tracking
- ✅ Success message display
- ✅ Status output formatting
- ✅ DNS record formatting
- ✅ Resource display

#### Route53 Operations (`route53.test.ts`)
- ✅ Hosted zone discovery
- ✅ DNS record creation (DKIM, SPF, DMARC)
- ✅ UPSERT operations
- ✅ Error handling
- ✅ Edge cases (empty tokens, trailing dots)

### Integration Tests (13 tests)

#### Status Command (`status.test.ts`)
- ✅ AWS credential validation
- ✅ Pulumi stack detection
- ✅ Dashboard-only integration display
- ✅ Enhanced integration display (skipped due to complex mocking)
- ✅ Multiple domain handling

#### Verify Command (`verify.test.ts`)
- ✅ Domain not found handling
- ✅ DNS record verification (DKIM, SPF, DMARC)
- ✅ Missing record detection
- ✅ Incorrect record detection
- ✅ Edge cases (no tokens, trailing dots)

## Testing Tools & Libraries

### Core Testing Framework
- **vitest ^4.0.7** - Fast, modern test runner
- **@vitest/coverage-v8 4.0.7** - Code coverage reporting

### AWS SDK Mocking
- **aws-sdk-client-mock 4.1.0** - Mock AWS SDK v3 clients
- **aws-sdk-client-mock-vitest 7.0.1** - Vitest integration for AWS mocks

### Configuration
- **vitest.config.ts** - Coverage thresholds, test environment setup
- Coverage threshold: 70% for lines, functions, branches, and statements

## Running Tests

### Quick Reference

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (for development)
pnpm test:watch

# Run tests with coverage report
pnpm test:coverage

# Run tests with UI
pnpm test:ui

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**GitHub Actions Workflow:** `.github/workflows/test.yml`
- Runs on Node.js 20.x and 22.x
- Generates coverage reports
- Uploads to Codecov (optional)

## Test Patterns & Best Practices

### Mocking Strategy

#### AWS SDK Mocking
```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const stsMock = mockClient(STSClient);

stsMock.on(GetCallerIdentityCommand).resolves({
  Account: '123456789012',
  UserId: 'AIDAI123456789',
  Arn: 'arn:aws:iam::123456789012:user/test',
});
```

#### File System Mocking
```typescript
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});
```

#### Module Mocking
```typescript
vi.mock('@clack/prompts', () => ({
  log: {
    error: vi.fn(),
    success: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));
```

### Test Structure

Each test file follows this pattern:

1. **Setup**: Import dependencies, create mock clients
2. **beforeEach**: Reset mocks, set up fresh state
3. **Tests**: Organized by function/feature
4. **afterEach**: Clean up (restore spies, reset state)

### Testing Principles

1. **Test behavior, not implementation** - Focus on what the code does, not how
2. **Mock external dependencies** - AWS SDK, file system, process.exit
3. **Isolate tests** - Each test runs independently
4. **Clear assertions** - Use descriptive expect statements
5. **Handle edge cases** - Test error paths and boundary conditions

## Future Improvements

### Planned Tests
- [ ] E2E tests with real AWS (sandboxed account)
- [ ] Integration tests for `init` command
- [ ] Integration tests for `connect` command
- [ ] Integration tests for `upgrade` command
- [ ] Infrastructure tests for Pulumi stacks
- [ ] Lambda function tests

### Coverage Goals
- Increase branch coverage to 90%+
- Add tests for command error scenarios
- Test Pulumi stack generation and deployment flows

## Troubleshooting

### Common Issues

**Issue**: Tests fail with "Module not found"
```bash
# Solution: Rebuild the project
pnpm build
```

**Issue**: Coverage not generated
```bash
# Solution: Install coverage dependencies
pnpm add -D @vitest/coverage-v8
```

**Issue**: AWS SDK mocks not working
```bash
# Solution: Ensure using correct mock pattern
# Use mockClient() from aws-sdk-client-mock
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [AWS SDK Client Mock](https://github.com/m-radzikowski/aws-sdk-client-mock)
- [Testing Best Practices](https://vitest.dev/guide/best-practices.html)
- [Coverage Configuration](https://vitest.dev/guide/coverage.html)

---

**Last Updated:** 2025-11-06
**Test Success Rate:** 99.1% (109/110 passing)
**Coverage:** 97.25%
