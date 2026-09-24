export const axiomToken = new sst.Secret("AxiomToken");
export const sentryDsn = new sst.Secret("SentryDsn");

/** Sentry settings every platform Lambda gets. */
export const sentryEnv = {
  SENTRY_DSN: sentryDsn.value,
  SENTRY_ENVIRONMENT: $app.stage,
  // The tested commit, passed by deploy-api.yml; absent on local deploys.
  ...(process.env.SENTRY_RELEASE
    ? { SENTRY_RELEASE: process.env.SENTRY_RELEASE }
    : {}),
};
