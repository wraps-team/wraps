/**
 * CI environment detection utilities
 * @module utils/shared/ci-detection
 */

/**
 * Detect if running in CI environment
 *
 * Checks for common CI environment variables to determine
 * if the CLI is running in a continuous integration environment.
 *
 * @returns {boolean} True if running in CI, false otherwise
 *
 * @example
 * ```typescript
 * if (isCI()) {
 *   console.log('Running in CI environment');
 * }
 * ```
 */
export function isCI(): boolean {
  // Universal CI indicator
  if (process.env.CI === "true" || process.env.CI === "1") {
    return true;
  }

  // Common CI providers
  const ciEnvVars = [
    "GITHUB_ACTIONS", // GitHub Actions
    "GITLAB_CI", // GitLab CI
    "CIRCLECI", // CircleCI
    "TRAVIS", // Travis CI
    "JENKINS_URL", // Jenkins
    "BUILDKITE", // Buildkite
    "DRONE", // Drone
    "SEMAPHORE", // Semaphore
    "TEAMCITY_VERSION", // TeamCity
    "TF_BUILD", // Azure Pipelines
    "CODEBUILD_BUILD_ID", // AWS CodeBuild
    "NETLIFY", // Netlify
    "VERCEL", // Vercel
    "HEROKU_TEST_RUN_ID", // Heroku CI
    "BUDDY", // Buddy
    "BITBUCKET_BUILD_NUMBER", // Bitbucket Pipelines
  ];

  return ciEnvVars.some((envVar) => process.env[envVar] !== undefined);
}
