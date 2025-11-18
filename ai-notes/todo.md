SDK:
  1. ✅ Core email sending (single, bulk, templates)
  2. ✅ React.email integration
  3. ✅ Template management (CRUD operations)
  4. ✅ Error handling with typed errors
  5. ✅ Attachment support (already stubbed at client.ts:141)
  6. ❓ Enhanced React template operations
  await email.templates.updateFromReact({...})
  await email.templates.previewTemplate('name', data) // Render without sending
  7. ❌ Rate limiting & retry logic (SDK-level, for application use)
  8. ❓ Email validation (pre-send checks)
  9. ❌ Chunked bulk sending (auto-split >50 recipients)

Should ADD to CLI:

Let's do the following:

1. ✅ Remove legacy commands now (No one is really using this yet afaik)
2. ✅ Rename update command to config
3. ✅ Consolidate verify into domains command group
4. ✅ Standardize flag naming
5. ✅ move it to global scope since it's not email-specific: `wraps dashboard`  # Works for all service
6. 🏗️ Add a version field to metadata to support future migrations


  ---
  4. Standardize flag naming ✅ RECOMMENDED

  Make flag naming consistent across all commands:

  # Current inconsistencies
  --provider, --region, --domain, --preset, --yes

  # Standardize
  --provider, -p
  --region, -r
  --domain, -d
  --preset
  --yes, -y
  --force, -f (instead of --yes for destructive operations)

  ---
  5. Rename Console ??? 🤔 CONSIDER

  The console command launches a local web dashboard, but "console" is ambiguous so move it to global scope since it's not email-specific:
  wraps dev         # Works for all services
  wraps local
  wraps dashboard 
  ---
  6. Version metadata format ✅ RECOMMENDED

  Add a version field to metadata to support future migrations:

  {
    "version": "1.0.0",
    "accountId": "...",
    "services": {
      "email": {...}
    }
  }

  This makes future breaking changes easier to handle with automated migrations.


  1. wraps templates - Template management commands
  wraps templates list
  wraps templates get <name>
  wraps templates create <name> --file template.html
  wraps templates delete <name>
  wraps templates preview <name> --data '{"name":"John"}'

  3. wraps send - Quick test emails from CLI
  wraps send --to user@example.com --subject "Test" --html "<h1>Hello</h1>"
  wraps send --to user@example.com --template welcome --data '{"name":"John"}'
  4. wraps quota - Show SES sending quotas (you have fetchSendQuota in ses-service.ts)
  wraps quota
  # Shows: Daily quota, send rate, sent in last 24h
  5. wraps logs - View email delivery logs
  wraps logs
  wraps logs --email user@example.com
  wraps logs --message-id abc123
  wraps logs --filter bounces
  6. wraps archive - Manage email archiving (you have email-archive.ts)
  wraps archive enable
  wraps archive search --to user@example.com
  wraps archive get <message-id>
  7. wraps sandbox - SES sandbox management
  wraps sandbox status
  wraps sandbox request-production  # Request production access
  wraps sandbox verify-email user@example.com  # Add to verified list
  8. wraps metrics - Analytics & stats (you have metrics.ts route)
  wraps metrics --range 7d
  wraps metrics --type bounces
  wraps metrics --export csv
  9. wraps webhooks - SNS webhook setup for events
  wraps webhooks setup --bounce https://myapp.com/webhooks/bounce
  wraps webhooks list
  wraps webhooks test
  10. wraps suppressions - Suppression list management
  wraps suppressions list
  wraps suppressions add user@example.com --reason bounce
  wraps suppressions remove user@example.com

Hosted Dashboard (apps/web)
  - Real-time email analytics with charts
  - Team management & collaboration
  - Advanced filtering & search
  - Email preview & testing UI
  - A/B testing for templates
  - Delivery rate optimization insights
  - Custom alerts & notifications
