// apps/web/src/lib/ai/block-examples.ts
// Comprehensive TipTap JSON block examples for AI generation
// Based on React Email component patterns

export type BlockExample = {
  id: string;
  name: string;
  category: BlockCategory;
  description: string;
  tags: string[];
  tiptapJson: Record<string, unknown>;
};

export type BlockCategory =
  | "header"
  | "footer"
  | "hero"
  | "feature"
  | "testimonial"
  | "pricing"
  | "product"
  | "gallery"
  | "stats"
  | "article"
  | "cta"
  | "social"
  | "divider";

// =============================================================================
// HEADERS
// =============================================================================

export const HEADER_EXAMPLES: BlockExample[] = [
  {
    id: "header-logo-centered",
    name: "Header with Centered Logo",
    category: "header",
    description: "Simple header with centered company logo",
    tags: ["header", "logo", "centered", "simple"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailImage",
          attrs: {
            src: "{{logoUrl}}",
            alt: "{{companyName}}",
            width: 140,
            align: "center",
          },
        },
      ],
    },
  },
  {
    id: "header-logo-nav",
    name: "Header with Logo and Navigation",
    category: "header",
    description: "Header with logo on left and navigation links on right",
    tags: ["header", "logo", "navigation", "menu"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "16px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "40%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{logoUrl}}",
                    alt: "{{companyName}}",
                    width: 120,
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "60%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "right" },
                  content: [
                    {
                      type: "text",
                      marks: [{ type: "link", attrs: { href: "{{homeUrl}}" } }],
                      text: "Home",
                    },
                    { type: "text", text: "  |  " },
                    {
                      type: "text",
                      marks: [
                        { type: "link", attrs: { href: "{{productsUrl}}" } },
                      ],
                      text: "Products",
                    },
                    { type: "text", text: "  |  " },
                    {
                      type: "text",
                      marks: [
                        { type: "link", attrs: { href: "{{supportUrl}}" } },
                      ],
                      text: "Support",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "header-with-social",
    name: "Header with Social Icons",
    category: "header",
    description: "Header with logo and social media icons",
    tags: ["header", "logo", "social", "icons"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "24px",
        backgroundColor: "#f8fafc",
      },
      content: [
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{logoUrl}}",
                    alt: "{{companyName}}",
                    width: 120,
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailSocialLinks",
                  attrs: {
                    links: [
                      { platform: "twitter", url: "{{twitterUrl}}" },
                      { platform: "linkedin", url: "{{linkedinUrl}}" },
                      { platform: "instagram", url: "{{instagramUrl}}" },
                    ],
                    iconSize: 20,
                    iconColor: "#6b7280",
                    iconSpacing: "12px",
                    align: "right",
                    style: "icons",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

// =============================================================================
// FOOTERS
// =============================================================================

export const FOOTER_EXAMPLES: BlockExample[] = [
  {
    id: "footer-simple",
    name: "Simple Footer",
    category: "footer",
    description: "Minimal footer with company info and unsubscribe link",
    tags: ["footer", "simple", "unsubscribe", "minimal"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "32px 24px",
        backgroundColor: "#f8fafc",
      },
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: "{{companyName}} | {{companyAddress}}",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [
                { type: "textStyle", attrs: { color: "#9ca3af" } },
                { type: "link", attrs: { href: "{{unsubscribeUrl}}" } },
              ],
              text: "Unsubscribe",
            },
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#9ca3af" } }],
              text: " | ",
            },
            {
              type: "text",
              marks: [
                { type: "textStyle", attrs: { color: "#9ca3af" } },
                { type: "link", attrs: { href: "{{preferencesUrl}}" } },
              ],
              text: "Manage Preferences",
            },
          ],
        },
      ],
    },
  },
  {
    id: "footer-two-column",
    name: "Two Column Footer",
    category: "footer",
    description: "Footer with company info on left and links on right",
    tags: ["footer", "two-column", "links", "company"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#1f2937",
      },
      content: [
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{logoUrl}}",
                    alt: "{{companyName}}",
                    width: 100,
                  },
                },
                { type: "emailSpacer", attrs: { height: 16 } },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#9ca3af" } },
                      ],
                      text: "{{companyAddress}}",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#ffffff" } },
                      ],
                      text: "Quick Links",
                    },
                  ],
                },
                { type: "emailSpacer", attrs: { height: 12 } },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#9ca3af" } },
                        { type: "link", attrs: { href: "{{helpUrl}}" } },
                      ],
                      text: "Help Center",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#9ca3af" } },
                        { type: "link", attrs: { href: "{{privacyUrl}}" } },
                      ],
                      text: "Privacy Policy",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#9ca3af" } },
                        { type: "link", attrs: { href: "{{unsubscribeUrl}}" } },
                      ],
                      text: "Unsubscribe",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "footer-with-social",
    name: "Footer with Social Icons",
    category: "footer",
    description: "Comprehensive footer with social links and company info",
    tags: ["footer", "social", "icons", "comprehensive"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#f1f5f9",
      },
      content: [
        {
          type: "emailSocialLinks",
          attrs: {
            links: [
              { platform: "twitter", url: "{{twitterUrl}}" },
              { platform: "linkedin", url: "{{linkedinUrl}}" },
              { platform: "instagram", url: "{{instagramUrl}}" },
              { platform: "facebook", url: "{{facebookUrl}}" },
            ],
            iconSize: 24,
            iconColor: "#64748b",
            iconSpacing: "16px",
            align: "center",
            style: "icons",
          },
        },
        {
          type: "emailDivider",
          attrs: { color: "#cbd5e1", margin: "24px" },
        },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#64748b" } }],
              text: "{{companyName}} | {{companyAddress}}",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#94a3b8" } }],
              text: "You're receiving this because you signed up at {{companyName}}. ",
            },
            {
              type: "text",
              marks: [
                { type: "textStyle", attrs: { color: "#94a3b8" } },
                { type: "link", attrs: { href: "{{unsubscribeUrl}}" } },
              ],
              text: "Unsubscribe",
            },
          ],
        },
      ],
    },
  },
];

// =============================================================================
// HERO SECTIONS
// =============================================================================

export const HERO_EXAMPLES: BlockExample[] = [
  {
    id: "hero-simple",
    name: "Simple Hero",
    category: "hero",
    description: "Clean hero with heading, description and CTA button",
    tags: ["hero", "simple", "cta", "heading"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "48px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center" },
          content: [{ type: "text", text: "Welcome to {{companyName}}" }],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: "We're excited to have you on board. Get started with your account and explore everything we have to offer.",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 24 } },
        {
          type: "emailButton",
          attrs: {
            href: "{{dashboardUrl}}",
            backgroundColor: "#5046e5",
            color: "#ffffff",
            padding: "14px 32px",
            borderRadius: "8px",
            align: "center",
          },
          content: [{ type: "text", text: "Get Started" }],
        },
      ],
    },
  },
  {
    id: "hero-with-image",
    name: "Hero with Image",
    category: "hero",
    description: "Hero section with a prominent image above the content",
    tags: ["hero", "image", "visual", "banner"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "0",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailImage",
          attrs: {
            src: "{{heroImageUrl}}",
            alt: "Hero banner",
            align: "center",
          },
        },
        {
          type: "emailSection",
          attrs: {
            padding: "32px 24px",
            backgroundColor: "#ffffff",
          },
          content: [
            {
              type: "heading",
              attrs: { level: 1, textAlign: "center" },
              content: [{ type: "text", text: "Your Heading Here" }],
            },
            { type: "emailSpacer", attrs: { height: 16 } },
            {
              type: "paragraph",
              attrs: { textAlign: "center" },
              content: [
                {
                  type: "text",
                  marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
                  text: "A compelling description that explains your value proposition and encourages action.",
                },
              ],
            },
            { type: "emailSpacer", attrs: { height: 24 } },
            {
              type: "emailButton",
              attrs: {
                href: "{{ctaUrl}}",
                backgroundColor: "#5046e5",
                color: "#ffffff",
                padding: "14px 32px",
                borderRadius: "8px",
                align: "center",
              },
              content: [{ type: "text", text: "Learn More" }],
            },
          ],
        },
      ],
    },
  },
  {
    id: "hero-gradient-bg",
    name: "Hero with Gradient Background",
    category: "hero",
    description: "Eye-catching hero with colored background",
    tags: ["hero", "gradient", "colorful", "bold"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "64px 24px",
        backgroundColor: "#5046e5",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#ffffff" } }],
              text: "Big News!",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#e0e7ff" } }],
              text: "Something exciting is happening and we couldn't wait to tell you about it.",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 24 } },
        {
          type: "emailButton",
          attrs: {
            href: "{{ctaUrl}}",
            backgroundColor: "#ffffff",
            color: "#5046e5",
            padding: "14px 32px",
            borderRadius: "8px",
            align: "center",
          },
          content: [{ type: "text", text: "Check It Out" }],
        },
      ],
    },
  },
];

// =============================================================================
// FEATURE SECTIONS
// =============================================================================

export const FEATURE_EXAMPLES: BlockExample[] = [
  {
    id: "features-list",
    name: "Feature List",
    category: "feature",
    description: "Vertical list of features with icons and descriptions",
    tags: ["features", "list", "benefits", "vertical"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "What You'll Get" }],
        },
        { type: "emailSpacer", attrs: { height: 32 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "15%" },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "✓" }],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "85%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "Feature One" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Description of the first feature and why it matters to the user.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "15%" },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "✓" }],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "85%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "Feature Two" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Description of the second feature and its benefits.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "15%" },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "✓" }],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "85%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "Feature Three" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Description of the third feature and what makes it special.",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "features-numbered",
    name: "Numbered Features",
    category: "feature",
    description: "Step-by-step features with numbered badges",
    tags: ["features", "numbered", "steps", "process"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#f8fafc",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "How It Works" }],
        },
        { type: "emailSpacer", attrs: { height: 32 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "15%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "bold" },
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "1",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "85%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "Sign Up" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Create your account in less than 30 seconds.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "15%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "bold" },
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "2",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "85%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "Configure" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Customize settings to fit your needs.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "15%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "bold" },
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "3",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "85%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "Launch" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Start using the platform immediately.",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "features-three-column",
    name: "Three Column Features",
    category: "feature",
    description: "Features displayed in a three-column grid",
    tags: ["features", "grid", "three-column", "icons"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "Why Choose Us" }],
        },
        { type: "emailSpacer", attrs: { height: 32 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [{ type: "text", text: "🚀" }],
                },
                {
                  type: "heading",
                  attrs: { level: 3, textAlign: "center" },
                  content: [{ type: "text", text: "Fast" }],
                },
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Lightning quick performance",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [{ type: "text", text: "🔒" }],
                },
                {
                  type: "heading",
                  attrs: { level: 3, textAlign: "center" },
                  content: [{ type: "text", text: "Secure" }],
                },
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Enterprise-grade security",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [{ type: "text", text: "💡" }],
                },
                {
                  type: "heading",
                  attrs: { level: 3, textAlign: "center" },
                  content: [{ type: "text", text: "Simple" }],
                },
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Easy to use interface",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

// =============================================================================
// TESTIMONIALS
// =============================================================================

export const TESTIMONIAL_EXAMPLES: BlockExample[] = [
  {
    id: "testimonial-simple",
    name: "Simple Testimonial",
    category: "testimonial",
    description: "Clean testimonial with quote and attribution",
    tags: ["testimonial", "quote", "simple", "customer"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#f8fafc",
        borderRadius: "8px",
      },
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [
                { type: "italic" },
                { type: "textStyle", attrs: { color: "#374151" } },
              ],
              text: '"This product has completely transformed how we work. The time savings alone have been incredible."',
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [
                { type: "bold" },
                { type: "textStyle", attrs: { color: "#111827" } },
              ],
              text: "Sarah Johnson",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: "CEO, TechCorp",
            },
          ],
        },
      ],
    },
  },
  {
    id: "testimonial-with-avatar",
    name: "Testimonial with Avatar",
    category: "testimonial",
    description: "Testimonial featuring customer photo",
    tags: ["testimonial", "avatar", "photo", "customer"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailAvatar",
          attrs: {
            src: "{{testimonialAvatarUrl}}",
            alt: "Customer photo",
            size: 80,
            shape: "circle",
            align: "center",
          },
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [
                { type: "italic" },
                { type: "textStyle", attrs: { color: "#374151" } },
              ],
              text: '"The best investment we\'ve made for our business this year. Highly recommended!"',
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "Michael Chen",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: "Founder, StartupXYZ",
            },
          ],
        },
      ],
    },
  },
  {
    id: "testimonial-with-rating",
    name: "Testimonial with Rating",
    category: "testimonial",
    description: "Testimonial with star rating",
    tags: ["testimonial", "rating", "stars", "review"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "32px 24px",
        backgroundColor: "#fffbeb",
        borderRadius: "8px",
      },
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#f59e0b" } }],
              text: "★★★★★",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [
                { type: "italic" },
                { type: "textStyle", attrs: { color: "#374151" } },
              ],
              text: '"Exceptional quality and outstanding customer service. Five stars all the way!"',
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "Emily Rodriguez",
            },
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: " • Verified Buyer",
            },
          ],
        },
      ],
    },
  },
];

// =============================================================================
// PRICING
// =============================================================================

export const PRICING_EXAMPLES: BlockExample[] = [
  {
    id: "pricing-single",
    name: "Single Price Card",
    category: "pricing",
    description: "Highlighted pricing card with features list",
    tags: ["pricing", "card", "features", "single"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailSection",
          attrs: {
            padding: "32px",
            backgroundColor: "#f8fafc",
            borderRadius: "12px",
          },
          content: [
            {
              type: "heading",
              attrs: { level: 2, textAlign: "center" },
              content: [{ type: "text", text: "Pro Plan" }],
            },
            { type: "emailSpacer", attrs: { height: 8 } },
            {
              type: "heading",
              attrs: { level: 1, textAlign: "center" },
              content: [
                {
                  type: "text",
                  marks: [{ type: "textStyle", attrs: { color: "#5046e5" } }],
                  text: "$49",
                },
                {
                  type: "text",
                  marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
                  text: "/month",
                },
              ],
            },
            { type: "emailSpacer", attrs: { height: 24 } },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "textStyle", attrs: { color: "#059669" } }],
                  text: "✓",
                },
                { type: "text", text: " Unlimited projects" },
              ],
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "textStyle", attrs: { color: "#059669" } }],
                  text: "✓",
                },
                { type: "text", text: " Priority support" },
              ],
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "textStyle", attrs: { color: "#059669" } }],
                  text: "✓",
                },
                { type: "text", text: " Advanced analytics" },
              ],
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "textStyle", attrs: { color: "#059669" } }],
                  text: "✓",
                },
                { type: "text", text: " Custom integrations" },
              ],
            },
            { type: "emailSpacer", attrs: { height: 24 } },
            {
              type: "emailButton",
              attrs: {
                href: "{{upgradeUrl}}",
                backgroundColor: "#5046e5",
                color: "#ffffff",
                padding: "14px 32px",
                borderRadius: "8px",
                align: "center",
              },
              content: [{ type: "text", text: "Upgrade Now" }],
            },
          ],
        },
      ],
    },
  },
  {
    id: "pricing-comparison",
    name: "Two Tier Pricing",
    category: "pricing",
    description: "Side-by-side pricing comparison",
    tags: ["pricing", "comparison", "two-tier", "plans"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "Choose Your Plan" }],
        },
        { type: "emailSpacer", attrs: { height: 32 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailSection",
                  attrs: {
                    padding: "24px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                  },
                  content: [
                    {
                      type: "heading",
                      attrs: { level: 3, textAlign: "center" },
                      content: [{ type: "text", text: "Basic" }],
                    },
                    {
                      type: "heading",
                      attrs: { level: 2, textAlign: "center" },
                      content: [{ type: "text", text: "$19/mo" }],
                    },
                    { type: "emailSpacer", attrs: { height: 16 } },
                    {
                      type: "paragraph",
                      attrs: { textAlign: "center" },
                      content: [
                        {
                          type: "text",
                          marks: [
                            { type: "textStyle", attrs: { color: "#6b7280" } },
                          ],
                          text: "5 projects\n1GB storage\nEmail support",
                        },
                      ],
                    },
                    { type: "emailSpacer", attrs: { height: 16 } },
                    {
                      type: "emailButton",
                      attrs: {
                        href: "{{basicPlanUrl}}",
                        backgroundColor: "#6b7280",
                        color: "#ffffff",
                        padding: "10px 24px",
                        borderRadius: "6px",
                        align: "center",
                      },
                      content: [{ type: "text", text: "Select" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailSection",
                  attrs: {
                    padding: "24px",
                    backgroundColor: "#5046e5",
                    borderRadius: "8px",
                  },
                  content: [
                    {
                      type: "heading",
                      attrs: { level: 3, textAlign: "center" },
                      content: [
                        {
                          type: "text",
                          marks: [
                            { type: "textStyle", attrs: { color: "#ffffff" } },
                          ],
                          text: "Pro",
                        },
                      ],
                    },
                    {
                      type: "heading",
                      attrs: { level: 2, textAlign: "center" },
                      content: [
                        {
                          type: "text",
                          marks: [
                            { type: "textStyle", attrs: { color: "#ffffff" } },
                          ],
                          text: "$49/mo",
                        },
                      ],
                    },
                    { type: "emailSpacer", attrs: { height: 16 } },
                    {
                      type: "paragraph",
                      attrs: { textAlign: "center" },
                      content: [
                        {
                          type: "text",
                          marks: [
                            { type: "textStyle", attrs: { color: "#e0e7ff" } },
                          ],
                          text: "Unlimited projects\n100GB storage\nPriority support",
                        },
                      ],
                    },
                    { type: "emailSpacer", attrs: { height: 16 } },
                    {
                      type: "emailButton",
                      attrs: {
                        href: "{{proPlanUrl}}",
                        backgroundColor: "#ffffff",
                        color: "#5046e5",
                        padding: "10px 24px",
                        borderRadius: "6px",
                        align: "center",
                      },
                      content: [{ type: "text", text: "Select" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

// =============================================================================
// PRODUCT / ECOMMERCE
// =============================================================================

export const PRODUCT_EXAMPLES: BlockExample[] = [
  {
    id: "product-card",
    name: "Product Card",
    category: "product",
    description: "Single product with image, description and buy button",
    tags: ["product", "card", "ecommerce", "single"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "24px",
        backgroundColor: "#ffffff",
        borderRadius: "8px",
      },
      content: [
        {
          type: "emailImage",
          attrs: {
            src: "{{productImageUrl}}",
            alt: "{{productName}}",
            align: "center",
          },
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "{{productName}}" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: "{{productDescription}}",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 12 } },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [
                { type: "bold" },
                { type: "textStyle", attrs: { color: "#111827" } },
              ],
              text: "{{productPrice}}",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "emailButton",
          attrs: {
            href: "{{productUrl}}",
            backgroundColor: "#5046e5",
            color: "#ffffff",
            padding: "12px 24px",
            borderRadius: "6px",
          },
          content: [{ type: "text", text: "Shop Now" }],
        },
      ],
    },
  },
  {
    id: "product-grid",
    name: "Product Grid",
    category: "product",
    description: "Two products side by side",
    tags: ["product", "grid", "ecommerce", "multiple"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "32px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "Featured Products" }],
        },
        { type: "emailSpacer", attrs: { height: 24 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{product1ImageUrl}}",
                    alt: "{{product1Name}}",
                  },
                },
                { type: "emailSpacer", attrs: { height: 12 } },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [{ type: "bold" }],
                      text: "{{product1Name}}",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "{{product1Price}}",
                    },
                  ],
                },
                {
                  type: "emailButton",
                  attrs: {
                    href: "{{product1Url}}",
                    backgroundColor: "#5046e5",
                    color: "#ffffff",
                    padding: "10px 20px",
                    borderRadius: "6px",
                  },
                  content: [{ type: "text", text: "View" }],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{product2ImageUrl}}",
                    alt: "{{product2Name}}",
                  },
                },
                { type: "emailSpacer", attrs: { height: 12 } },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [{ type: "bold" }],
                      text: "{{product2Name}}",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "{{product2Price}}",
                    },
                  ],
                },
                {
                  type: "emailButton",
                  attrs: {
                    href: "{{product2Url}}",
                    backgroundColor: "#5046e5",
                    color: "#ffffff",
                    padding: "10px 20px",
                    borderRadius: "6px",
                  },
                  content: [{ type: "text", text: "View" }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "order-item",
    name: "Order Item Row",
    category: "product",
    description: "Order line item with image, details and price",
    tags: ["order", "item", "ecommerce", "receipt"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "16px 0",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "20%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{itemImageUrl}}",
                    alt: "{{itemName}}",
                    width: 80,
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "55%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [{ type: "bold" }],
                      text: "{{itemName}}",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Qty: {{itemQuantity}} | Size: {{itemSize}}",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "25%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "right" },
                  content: [
                    {
                      type: "text",
                      marks: [{ type: "bold" }],
                      text: "{{itemPrice}}",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "emailDivider",
          attrs: { color: "#e5e7eb", margin: "16px" },
        },
      ],
    },
  },
  {
    id: "order-summary",
    name: "Order Summary",
    category: "product",
    description: "Order total with subtotal, shipping, and tax",
    tags: ["order", "summary", "total", "checkout"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "24px",
        backgroundColor: "#f8fafc",
        borderRadius: "8px",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Order Summary" }],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "70%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Subtotal",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "30%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "right" },
                  content: [{ type: "text", text: "{{subtotal}}" }],
                },
              ],
            },
          ],
        },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "70%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Shipping",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "30%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "right" },
                  content: [{ type: "text", text: "{{shipping}}" }],
                },
              ],
            },
          ],
        },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "70%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Tax",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "30%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "right" },
                  content: [{ type: "text", text: "{{tax}}" }],
                },
              ],
            },
          ],
        },
        {
          type: "emailDivider",
          attrs: { color: "#e5e7eb", margin: "16px" },
        },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "70%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", marks: [{ type: "bold" }], text: "Total" },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "30%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "right" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "bold" },
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "{{total}}",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

// =============================================================================
// GALLERY
// =============================================================================

export const GALLERY_EXAMPLES: BlockExample[] = [
  {
    id: "gallery-two-column",
    name: "Two Column Gallery",
    category: "gallery",
    description: "Two images side by side",
    tags: ["gallery", "images", "two-column", "grid"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{image1Url}}",
                    alt: "{{image1Alt}}",
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{image2Url}}",
                    alt: "{{image2Alt}}",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "gallery-three-column",
    name: "Three Column Gallery",
    category: "gallery",
    description: "Three images in a row",
    tags: ["gallery", "images", "three-column", "grid"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{image1Url}}",
                    alt: "{{image1Alt}}",
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{image2Url}}",
                    alt: "{{image2Alt}}",
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{image3Url}}",
                    alt: "{{image3Alt}}",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "gallery-with-captions",
    name: "Gallery with Captions",
    category: "gallery",
    description: "Images with descriptive captions below",
    tags: ["gallery", "images", "captions", "descriptive"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "32px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "Gallery" }],
        },
        { type: "emailSpacer", attrs: { height: 24 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{image1Url}}",
                    alt: "{{image1Alt}}",
                  },
                },
                { type: "emailSpacer", attrs: { height: 8 } },
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "{{image1Caption}}",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{image2Url}}",
                    alt: "{{image2Alt}}",
                  },
                },
                { type: "emailSpacer", attrs: { height: 8 } },
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "{{image2Caption}}",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

// =============================================================================
// STATS
// =============================================================================

export const STATS_EXAMPLES: BlockExample[] = [
  {
    id: "stats-three-column",
    name: "Three Column Stats",
    category: "stats",
    description: "Three key metrics displayed prominently",
    tags: ["stats", "metrics", "numbers", "kpi"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#f8fafc",
      },
      content: [
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 1, textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "99%",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Uptime",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 1, textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "10K+",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Customers",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "33%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 1, textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "24/7",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  attrs: { textAlign: "center" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "Support",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "stats-highlighted",
    name: "Highlighted Stat",
    category: "stats",
    description: "Single prominent statistic with context",
    tags: ["stats", "single", "highlight", "metric"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "48px 24px",
        backgroundColor: "#5046e5",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#ffffff" } }],
              text: "{{statValue}}",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 8 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#e0e7ff" } }],
              text: "{{statLabel}}",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#c7d2fe" } }],
              text: "{{statDescription}}",
            },
          ],
        },
      ],
    },
  },
];

// =============================================================================
// ARTICLE
// =============================================================================

export const ARTICLE_EXAMPLES: BlockExample[] = [
  {
    id: "article-card",
    name: "Article Card",
    category: "article",
    description: "Blog post preview with image and excerpt",
    tags: ["article", "blog", "card", "preview"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "24px",
        backgroundColor: "#ffffff",
        borderRadius: "8px",
      },
      content: [
        {
          type: "emailImage",
          attrs: {
            src: "{{articleImageUrl}}",
            alt: "{{articleTitle}}",
            align: "center",
          },
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#5046e5" } }],
              text: "{{articleCategory}}",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "{{articleTitle}}" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: "{{articleExcerpt}}",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 16 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "60%" },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#9ca3af" } },
                      ],
                      text: "By {{authorName}} • {{publishDate}}",
                    },
                  ],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "40%" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlign: "right" },
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "link", attrs: { href: "{{articleUrl}}" } },
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "Read More →",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "article-horizontal",
    name: "Horizontal Article",
    category: "article",
    description: "Article preview with image on left",
    tags: ["article", "blog", "horizontal", "compact"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "20px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "35%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{articleImageUrl}}",
                    alt: "{{articleTitle}}",
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "65%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "{{articleTitle}}" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "{{articleExcerpt}}",
                    },
                  ],
                },
                { type: "emailSpacer", attrs: { height: 8 } },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "link", attrs: { href: "{{articleUrl}}" } },
                        { type: "textStyle", attrs: { color: "#5046e5" } },
                      ],
                      text: "Read More →",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "article-list",
    name: "Article List",
    category: "article",
    description: "Multiple articles in a newsletter format",
    tags: ["article", "blog", "list", "newsletter"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "32px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "Latest from the Blog" }],
        },
        { type: "emailSpacer", attrs: { height: 24 } },
        // Article 1
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "30%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{article1ImageUrl}}",
                    alt: "{{article1Title}}",
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "70%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "{{article1Title}}" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "{{article1Excerpt}}",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "emailDivider",
          attrs: { color: "#e5e7eb", margin: "20px" },
        },
        // Article 2
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "30%" },
              content: [
                {
                  type: "emailImage",
                  attrs: {
                    src: "{{article2ImageUrl}}",
                    alt: "{{article2Title}}",
                  },
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "70%" },
              content: [
                {
                  type: "heading",
                  attrs: { level: 3 },
                  content: [{ type: "text", text: "{{article2Title}}" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      marks: [
                        { type: "textStyle", attrs: { color: "#6b7280" } },
                      ],
                      text: "{{article2Excerpt}}",
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 24 } },
        {
          type: "emailButton",
          attrs: {
            href: "{{blogUrl}}",
            backgroundColor: "#5046e5",
            color: "#ffffff",
            padding: "12px 24px",
            borderRadius: "6px",
            align: "center",
          },
          content: [{ type: "text", text: "View All Articles" }],
        },
      ],
    },
  },
];

// =============================================================================
// CTA SECTIONS
// =============================================================================

export const CTA_EXAMPLES: BlockExample[] = [
  {
    id: "cta-simple",
    name: "Simple CTA",
    category: "cta",
    description: "Clean call-to-action with text and button",
    tags: ["cta", "simple", "button", "action"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#f8fafc",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "Ready to Get Started?" }],
        },
        { type: "emailSpacer", attrs: { height: 12 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: "Join thousands of satisfied customers today.",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "emailButton",
          attrs: {
            href: "{{ctaUrl}}",
            backgroundColor: "#5046e5",
            color: "#ffffff",
            padding: "14px 32px",
            borderRadius: "8px",
            align: "center",
          },
          content: [{ type: "text", text: "Start Free Trial" }],
        },
      ],
    },
  },
  {
    id: "cta-two-buttons",
    name: "Two Button CTA",
    category: "cta",
    description: "CTA section with primary and secondary actions",
    tags: ["cta", "buttons", "dual", "action"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "40px 24px",
        backgroundColor: "#ffffff",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "Take the Next Step" }],
        },
        { type: "emailSpacer", attrs: { height: 24 } },
        {
          type: "emailRow",
          content: [
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailButton",
                  attrs: {
                    href: "{{primaryCtaUrl}}",
                    backgroundColor: "#5046e5",
                    color: "#ffffff",
                    padding: "12px 24px",
                    borderRadius: "6px",
                    align: "center",
                  },
                  content: [{ type: "text", text: "Get Started" }],
                },
              ],
            },
            {
              type: "emailColumn",
              attrs: { width: "50%" },
              content: [
                {
                  type: "emailButton",
                  attrs: {
                    href: "{{secondaryCtaUrl}}",
                    backgroundColor: "#ffffff",
                    color: "#5046e5",
                    padding: "12px 24px",
                    borderRadius: "6px",
                    border: "2px solid #5046e5",
                    align: "center",
                  },
                  content: [{ type: "text", text: "Learn More" }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "cta-urgent",
    name: "Urgent CTA",
    category: "cta",
    description: "Time-sensitive call-to-action",
    tags: ["cta", "urgent", "limited", "countdown"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "32px 24px",
        backgroundColor: "#fef2f2",
        borderRadius: "8px",
      },
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [
                { type: "bold" },
                { type: "textStyle", attrs: { color: "#dc2626" } },
              ],
              text: "⏰ LIMITED TIME OFFER",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 12 } },
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [{ type: "text", text: "50% Off - Ends Tonight!" }],
        },
        { type: "emailSpacer", attrs: { height: 12 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }],
              text: "Don't miss out on this exclusive deal. Use code: {{promoCode}}",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "emailButton",
          attrs: {
            href: "{{offerUrl}}",
            backgroundColor: "#dc2626",
            color: "#ffffff",
            padding: "14px 32px",
            borderRadius: "8px",
            align: "center",
          },
          content: [{ type: "text", text: "Claim Your Discount" }],
        },
      ],
    },
  },
];

// =============================================================================
// SOCIAL
// =============================================================================

export const SOCIAL_EXAMPLES: BlockExample[] = [
  {
    id: "social-icons-centered",
    name: "Centered Social Links",
    category: "social",
    description: "Social media links centered in a row",
    tags: ["social", "icons", "centered", "links"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "24px",
        backgroundColor: "#f8fafc",
      },
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [{ type: "text", text: "Follow us:" }],
        },
        { type: "emailSpacer", attrs: { height: 12 } },
        {
          type: "emailSocialLinks",
          attrs: {
            links: [
              { platform: "twitter", url: "{{twitterUrl}}" },
              { platform: "linkedin", url: "{{linkedinUrl}}" },
              { platform: "instagram", url: "{{instagramUrl}}" },
            ],
            iconSize: 24,
            iconColor: "#5046e5",
            iconSpacing: "16px",
            align: "center",
            style: "icons",
          },
        },
      ],
    },
  },
  {
    id: "social-with-cta",
    name: "Social with CTA",
    category: "social",
    description: "Social links with a follow call-to-action",
    tags: ["social", "cta", "follow", "engagement"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "32px 24px",
        backgroundColor: "#5046e5",
      },
      content: [
        {
          type: "heading",
          attrs: { level: 3, textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#ffffff" } }],
              text: "Stay Connected",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 12 } },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "textStyle", attrs: { color: "#e0e7ff" } }],
              text: "Follow us for the latest updates and exclusive content",
            },
          ],
        },
        { type: "emailSpacer", attrs: { height: 20 } },
        {
          type: "emailSocialLinks",
          attrs: {
            links: [
              { platform: "twitter", url: "{{twitterUrl}}" },
              { platform: "linkedin", url: "{{linkedinUrl}}" },
              { platform: "instagram", url: "{{instagramUrl}}" },
              { platform: "facebook", url: "{{facebookUrl}}" },
            ],
            iconSize: 28,
            iconColor: "#ffffff",
            iconSpacing: "20px",
            align: "center",
            style: "icons",
          },
        },
      ],
    },
  },
];

// =============================================================================
// DIVIDERS
// =============================================================================

export const DIVIDER_EXAMPLES: BlockExample[] = [
  {
    id: "divider-simple",
    name: "Simple Divider",
    category: "divider",
    description: "Basic horizontal line divider",
    tags: ["divider", "line", "simple", "separator"],
    tiptapJson: {
      type: "emailDivider",
      attrs: {
        color: "#e5e7eb",
        thickness: "1px",
        margin: "24px",
      },
    },
  },
  {
    id: "divider-with-spacing",
    name: "Divider with Spacing",
    category: "divider",
    description: "Divider with extra vertical spacing",
    tags: ["divider", "spacing", "margin", "separator"],
    tiptapJson: {
      type: "emailSection",
      attrs: {
        padding: "0",
        backgroundColor: "transparent",
      },
      content: [
        { type: "emailSpacer", attrs: { height: 32 } },
        {
          type: "emailDivider",
          attrs: {
            color: "#d1d5db",
            thickness: "1px",
            margin: "0",
          },
        },
        { type: "emailSpacer", attrs: { height: 32 } },
      ],
    },
  },
  {
    id: "divider-bold",
    name: "Bold Divider",
    category: "divider",
    description: "Thicker, more prominent divider",
    tags: ["divider", "bold", "thick", "separator"],
    tiptapJson: {
      type: "emailDivider",
      attrs: {
        color: "#5046e5",
        thickness: "3px",
        margin: "32px",
      },
    },
  },
];

// =============================================================================
// EXPORT ALL EXAMPLES
// =============================================================================

export const ALL_BLOCK_EXAMPLES: BlockExample[] = [
  ...HEADER_EXAMPLES,
  ...FOOTER_EXAMPLES,
  ...HERO_EXAMPLES,
  ...FEATURE_EXAMPLES,
  ...TESTIMONIAL_EXAMPLES,
  ...PRICING_EXAMPLES,
  ...PRODUCT_EXAMPLES,
  ...GALLERY_EXAMPLES,
  ...STATS_EXAMPLES,
  ...ARTICLE_EXAMPLES,
  ...CTA_EXAMPLES,
  ...SOCIAL_EXAMPLES,
  ...DIVIDER_EXAMPLES,
];

// Helper to get examples by category
export function getExamplesByCategory(category: BlockCategory): BlockExample[] {
  return ALL_BLOCK_EXAMPLES.filter((example) => example.category === category);
}

// Helper to get examples by tags
export function getExamplesByTags(tags: string[]): BlockExample[] {
  return ALL_BLOCK_EXAMPLES.filter((example) =>
    tags.some((tag) => example.tags.includes(tag))
  );
}

// Helper to search examples
export function searchExamples(query: string): BlockExample[] {
  const lowerQuery = query.toLowerCase();
  return ALL_BLOCK_EXAMPLES.filter(
    (example) =>
      example.name.toLowerCase().includes(lowerQuery) ||
      example.description.toLowerCase().includes(lowerQuery) ||
      example.tags.some((tag) => tag.includes(lowerQuery))
  );
}

// Get all category labels
export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = {
  header: "Headers",
  footer: "Footers",
  hero: "Hero Sections",
  feature: "Features",
  testimonial: "Testimonials",
  pricing: "Pricing",
  product: "Products & Ecommerce",
  gallery: "Galleries",
  stats: "Statistics",
  article: "Articles & Blog",
  cta: "Call to Actions",
  social: "Social",
  divider: "Dividers",
};
