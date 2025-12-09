import {
  CreateTemplateCommand,
  DeleteTemplateCommand,
  GetTemplateCommand,
  SESClient,
  UpdateTemplateCommand,
} from "@aws-sdk/client-ses";
import type { AssumedRoleCredentials } from "./assume-role";

export type SESTemplateParams = {
  templateName: string;
  subject: string;
  htmlPart: string;
  textPart: string;
};

/**
 * Creates an SES client using assumed role credentials
 */
function createSESClient(
  credentials: AssumedRoleCredentials,
  region: string
): SESClient {
  return new SESClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

/**
 * Check if a template exists in SES
 */
export async function templateExists(
  credentials: AssumedRoleCredentials,
  region: string,
  templateName: string
): Promise<boolean> {
  const ses = createSESClient(credentials, region);

  try {
    await ses.send(new GetTemplateCommand({ TemplateName: templateName }));
    return true;
  } catch (error) {
    // AWS SDK v3 error codes - check both name and Code properties
    const err = error as { name?: string; Code?: string };
    if (
      err.name === "TemplateDoesNotExist" ||
      err.Code === "TemplateDoesNotExist"
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Creates or updates an SES template in the customer's AWS account
 */
export async function upsertSESTemplate(
  credentials: AssumedRoleCredentials,
  region: string,
  params: SESTemplateParams
): Promise<void> {
  const ses = createSESClient(credentials, region);
  const { templateName, subject, htmlPart, textPart } = params;

  const templateData = {
    TemplateName: templateName,
    SubjectPart: subject,
    HtmlPart: htmlPart,
    TextPart: textPart,
  };

  // Check if template exists
  const exists = await templateExists(credentials, region, templateName);

  if (exists) {
    // Update existing template
    await ses.send(
      new UpdateTemplateCommand({
        Template: templateData,
      })
    );
  } else {
    // Create new template
    await ses.send(
      new CreateTemplateCommand({
        Template: templateData,
      })
    );
  }
}

/**
 * Deletes an SES template from the customer's AWS account
 */
export async function deleteSESTemplate(
  credentials: AssumedRoleCredentials,
  region: string,
  templateName: string
): Promise<void> {
  const ses = createSESClient(credentials, region);

  try {
    await ses.send(
      new DeleteTemplateCommand({
        TemplateName: templateName,
      })
    );
  } catch (error) {
    // Ignore if template doesn't exist - check both name and Code properties
    const err = error as { name?: string; Code?: string };
    if (
      err.name === "TemplateDoesNotExist" ||
      err.Code === "TemplateDoesNotExist"
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Generates a consistent SES template name from a Wraps template name
 */
export function generateSESTemplateName(
  _templateId: string,
  templateName: string
): string {
  // Sanitize the template name for SES (alphanumeric, hyphens, underscores only)
  // SES template names can be up to 64 characters
  return templateName
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
    .substring(0, 64);
}
