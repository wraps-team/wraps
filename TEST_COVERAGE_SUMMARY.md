# Test Coverage Summary - Quick Reference

## Current State

```
Test Coverage by Category:
├── Commands (8 files)
│   ├── ✅ status.ts - TESTED (good coverage)
│   ├── ✅ verify.ts - TESTED (good coverage)  
│   ├── ❌ init.ts - UNTESTED (critical)
│   ├── ❌ upgrade.ts - UNTESTED (critical)
│   ├── ❌ connect.ts - UNTESTED (critical)
│   ├── ❌ destroy.ts - UNTESTED
│   ├── ❌ restore.ts - UNTESTED
│   └── ❌ console.ts - UNTESTED
│   Total: 2/8 (25%)
│
├── Utilities (14 files)
│   ├── ✅ output.ts - PARTIAL (some tests)
│   ├── ✅ errors.ts - TESTED (good coverage)
│   ├── ✅ route53.ts - PARTIAL (some tests)
│   ├── ✅ metadata.ts - PARTIAL (some tests)
│   ├── ✅ aws.ts - PARTIAL (some tests)
│   ├── ❌ scanner.ts - UNTESTED (critical)
│   ├── ❌ presets.ts - PARTIAL (missing key functions)
│   ├── ❌ costs.ts - PARTIAL (missing edge cases)
│   ├── ❌ prompts.ts - PARTIAL (mocked but no tests)
│   ├── ❌ assume-role.ts - UNTESTED
│   ├── ❌ fs.ts - UNTESTED
│   ├── ❌ completion.ts - UNTESTED
│   ├── ❌ ses-simulator.ts - UNTESTED
│   └── ❌ pulumi.ts - UNTESTED
│   Total: 5/14 (36%)
│
├── Infrastructure (8 files)
│   ├── ❌ email-stack.ts - UNTESTED
│   ├── ❌ vercel-oidc.ts - UNTESTED
│   ├── ❌ iam.ts - UNTESTED
│   ├── ❌ ses.ts - UNTESTED
│   ├── ❌ dynamodb.ts - UNTESTED
│   ├── ❌ lambda.ts - UNTESTED
│   ├── ❌ sqs.ts - UNTESTED
│   └── ❌ eventbridge.ts - UNTESTED
│   Total: 0/8 (0%)
│
└── Console/Dashboard (13+ files)
    ├── ❌ server.ts - UNTESTED
    ├── ❌ middleware/* - UNTESTED (2 files)
    ├── ❌ routes/* - UNTESTED (5 files)
    └── ❌ services/* - UNTESTED (5+ files)
    Total: 0/13 (0%)

OVERALL: 7/43+ files tested (16%)
```

---

## Test Files Inventory

| File | Status | Line Count | Tests |
|------|--------|-----------|-------|
| route53.test.ts | ✅ | ~150 | ~8 |
| output.test.ts | ✅ | ~200 | ~10 |
| status.test.ts | ✅ | ~246 | ~7 |
| verify.test.ts | ✅ | ~200 | ~8 |
| aws.test.ts | ✅ | ~150 | ~6 |
| errors.test.ts | ✅ | ~100 | ~4 |
| metadata.test.ts | ✅ | ~150 | ~7 |
| event-processor.test.ts | ✅ | ~250 | ~10 |
| **TOTAL** | | **1,446** | **~60** |

---

## Critical Gaps Summary

### 🔴 HIGHEST PRIORITY (Implement First)

These files are user-facing commands with complex logic and zero tests:

**1. init.ts** (9.5 KB)
- Handles initial infrastructure deployment
- Complex flow: credentials → config → cost calculation → Pulumi deployment → DNS setup
- Risk: 🔴 CRITICAL - 30% of user interactions
- Tests needed: 25-30
- Estimated effort: 25-30 hours

**2. upgrade.ts** (17 KB)
- Most complex command, handles multiple upgrade paths
- Shows cost impact, multiple configuration changes
- Risk: 🔴 CRITICAL - 20% of user interactions
- Tests needed: 25-30
- Estimated effort: 25-30 hours

**3. scanner.ts** (10 KB)
- Scans AWS resources with pagination and error handling
- Used by connect command
- Risk: 🔴 CRITICAL - AWS API complexity
- Tests needed: 20-25
- Estimated effort: 20-25 hours

---

### 🟠 HIGH PRIORITY (Implement Next)

These utilities are heavily used but lack comprehensive coverage:

**4. costs.ts** (10 KB)
- Cost calculations have many edge cases
- Used in init and upgrade for cost display
- Risk: 🟠 HIGH - Financial implications
- Tests needed: 25-30
- Estimated effort: 15-20 hours

**5. presets.ts** (7.4 KB)
- Configuration presets and validation
- Used by init, upgrade, connect
- Risk: 🟠 HIGH - Configuration correctness
- Tests needed: 20
- Estimated effort: 12-15 hours

**6. prompts.ts** (15 KB)
- User input validation and formatting
- Used by all commands
- Risk: 🟠 HIGH - UX impact
- Tests needed: 20-25
- Estimated effort: 15-20 hours

---

### 🟡 MEDIUM PRIORITY (Implement After)

Infrastructure code without tests:

**7. Infrastructure Stack Files** (8 files, 800+ lines)
- email-stack.ts, iam.ts, ses.ts, dynamodb.ts, lambda.ts, sqs.ts, eventbridge.ts, vercel-oidc.ts
- Core deployment logic
- Risk: 🟡 MEDIUM - Only affect deployment
- Tests needed: 120-140 total
- Estimated effort: 70-90 hours

---

### 🟢 LOWER PRIORITY (Nice to Have)

Console and dashboard code:

**8. Console/Dashboard** (13+ files)
- server.ts, routes/*, services/*, middleware/*
- Not essential for core functionality
- Risk: 🟢 LOW - Only affect dashboard
- Tests needed: 120-165 total
- Estimated effort: 70-90 hours

---

## Test Scenarios by Category

### Most Critical Gaps (Quick Reference)

#### Commands
| Command | Gap | Severity | Tests |
|---------|-----|----------|-------|
| init | Happy path deployment | 🔴 | 5 |
| init | Error handling (lock, creds, etc) | 🔴 | 8 |
| init | DNS integration | 🔴 | 5 |
| init | Metadata state | 🔴 | 3 |
| upgrade | Preset upgrades | 🔴 | 6 |
| upgrade | Cost calculations | 🔴 | 5 |
| upgrade | Configuration changes | 🔴 | 8 |
| upgrade | Metadata updates | 🔴 | 3 |
| connect | Resource scanning | 🔴 | 6 |
| connect | Configuration setup | 🟠 | 4 |
| destroy | Core destruction | 🟠 | 3 |
| destroy | Error handling | 🟠 | 3 |

#### Utilities
| Utility | Gap | Severity | Tests |
|---------|-----|----------|-------|
| scanner | SES scanning | 🔴 | 6 |
| scanner | DynamoDB/Lambda/IAM scanning | 🔴 | 6 |
| scanner | Error handling | 🟠 | 4 |
| scanner | Filtering/aggregation | 🟠 | 3 |
| costs | Cost calculation | 🔴 | 8 |
| costs | Feature-specific costs | 🔴 | 8 |
| costs | Edge cases | 🟠 | 6 |
| presets | Validation warnings | 🟠 | 5 |
| presets | Upgrade paths | 🟠 | 5 |
| prompts | Individual prompts | 🟠 | 8 |
| prompts | Validation | 🟠 | 5 |

---

## Impact Analysis

### Tests Missing → Real-World Bugs Possible

Without tests, these bugs could happen in production:

1. **Cost Calculation Bug**
   - Wrong cost display for certain feature combinations
   - User deployed wrong tier
   - Impact: Financial/UX

2. **Metadata Corruption**
   - Concurrent upgrades corrupt state
   - User loses deployment info
   - Impact: Data loss

3. **DNS Record Creation Failure**
   - Route53 integration fails silently
   - Tracking domain not verified
   - Impact: Feature broken

4. **IAM Policy Misconfiguration**
   - Missing permissions in role
   - Application can't send emails
   - Impact: Broken functionality

5. **Pulumi Lock Error Not Handled**
   - Stack locked from previous failed run
   - User can't deploy or upgrade
   - Impact: Blocked deployment

6. **Scanner Pagination Bug**
   - With 101+ SES identities, only 100 returned
   - User can't connect some domains
   - Impact: Missing infrastructure

---

## Effort Estimate

### By Phase

```
Phase 1 (Commands): 70-75 tests, 40-50 hours
├── init.ts: 25-30 tests
├── upgrade.ts: 25-30 tests
└── destroy.ts: 12-15 tests

Phase 2 (Utilities): 85-100 tests, 50-60 hours
├── scanner.ts: 20-25 tests
├── costs.ts: 25-30 tests
├── presets.ts: 20 tests
└── prompts.ts: 20-25 tests

Phase 3 (Infrastructure): 114-138 tests, 70-80 hours
├── email-stack.ts: 15-20 tests
├── iam.ts: 20-25 tests
├── ses.ts: 12-15 tests
├── dynamodb.ts: 15 tests
├── lambda.ts: 15-18 tests
├── sqs.ts: 12-15 tests
├── eventbridge.ts: 15 tests
└── vercel-oidc.ts: 10-12 tests

Phase 4 (Console): 121-165 tests, 70-90 hours
├── server.ts: 15-20 tests
├── routes: 40-50 tests
├── services: 50-75 tests
└── middleware: 16-20 tests

Phase 5 (Integration): 23-35 tests, 45-65 hours
├── E2E scenarios: 10-15 tests
├── Multi-region: 5-8 tests
└── Provider-specific: 8-12 tests

TOTAL: 413-513 tests, 275-345 hours
```

### Timeline

- **Fast Track (Priority 1):** Phase 1 + 2 = 155-175 tests, 90-110 hours (2-3 weeks)
- **Standard:** Phase 1 + 2 + 3 = 269-313 tests, 160-190 hours (4-6 weeks)
- **Complete:** All phases = 413-513 tests, 275-345 hours (8-12 weeks)

---

## Testing Strategy

### Recommended Approach

1. **Start with highest-risk files** (init, upgrade, scanner, costs)
2. **Use established patterns** from existing tests
3. **Mock AWS SDK** with aws-sdk-client-mock
4. **Mock Pulumi** automation module
5. **Mock file system** with memfs for metadata tests
6. **Add to CI/CD** to prevent regression

### Test Fixtures Needed

- AWS CLI responses (SES, DynamoDB, Lambda, IAM, STS)
- Pulumi stack outputs
- Metadata file examples
- DNS records
- Cost calculation scenarios

---

## Key Files to Review First

1. `/packages/cli/src/commands/status.test.ts` - Follow this pattern
2. `/packages/cli/src/commands/verify.test.ts` - Good example of fixture usage
3. `/packages/cli/src/utils/__tests__/metadata.test.ts` - File I/O testing

---

## Actionable Next Steps

1. **Read full analysis:** `TEST_COVERAGE_ANALYSIS.md`
2. **Pick first file:** Start with `init.ts` tests
3. **Use test template:** Copy from `status.test.ts`
4. **Follow patterns:** Mock AWS, Pulumi, clack as shown
5. **Write 25-30 tests** for init.ts
6. **Create CI check:** Fail PR if coverage drops
7. **Iterate:** Move to next highest priority

---

## Questions to Answer Before Testing

- [ ] Should we mock Pulumi or use integration tests?
- [ ] What's the minimum acceptable test coverage percentage?
- [ ] Should we test error recovery (Pulumi lock files, API retries)?
- [ ] How do we test DNS verification without real Route53?
- [ ] Should console/dashboard tests be E2E or unit?

