# Express + Lambda + world-aws Example

Order processing workflow running on Express locally and AWS Lambda in production, backed by DynamoDB + SQS.

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create AWS infrastructure:
   ```bash
   npx world-aws-setup --region us-east-1
   ```

3. Copy `.env.example` to `.env` and fill in your values.

4. Start the dev server:
   ```bash
   pnpm dev
   ```

5. Trigger the workflow:
   ```bash
   curl -X POST http://localhost:3001/orders \
     -H "Content-Type: application/json" \
     -d '{"orderId": "ord_1", "items": [{"sku": "WIDGET", "quantity": 2}], "customerEmail": "buyer@example.com"}'
   ```

## Deploy to Lambda

The `src/lambda.ts` file exports an SQS handler. Configure your Lambda function with an SQS event source mapping pointing to the `workflow-workflows` queue. The handler uses partial batch failure reporting.
