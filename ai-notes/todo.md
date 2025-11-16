Should ADD to CLI:

  1. wraps templates - Template management commands
  wraps templates list
  wraps templates get <name>
  wraps templates create <name> --file template.html
  wraps templates delete <name>
  wraps templates preview <name> --data '{"name":"John"}'
  2. wraps domains - Domain verification & DKIM management
  wraps domains add yourapp.com
  wraps domains verify yourapp.com
  wraps domains get-dkim yourapp.com  # Show DKIM tokens
  wraps domains list
  wraps domains remove yourapp.com
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