import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { parseHTMLToTipTap } from "../html-to-tiptap";
import { parseReactEmailToTipTap } from "../react-email-to-tiptap";
import { generateReactEmailCode } from "../tiptap-to-react-email";

/**
 * Comprehensive tests for TipTap serialization/deserialization
 *
 * Tests cover:
 * 1. HTML → TipTap conversion
 * 2. React Email → TipTap conversion (with Tailwind classes)
 * 3. Round-trip conversions
 */

describe("HTML to TipTap Conversion", () => {
  describe("Basic Elements", () => {
    it("should parse headings", () => {
      const html = "<h1>Hello World</h1>";
      const result = parseHTMLToTipTap(html);

      expect(result.type).toBe("doc");
      expect(result.content).toHaveLength(1);
      expect(result.content?.[0]).toMatchObject({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Hello World" }],
      });
    });

    it("should parse all heading levels", () => {
      const html = `
        <h1>H1</h1>
        <h2>H2</h2>
        <h3>H3</h3>
        <h4>H4</h4>
        <h5>H5</h5>
        <h6>H6</h6>
      `;
      const result = parseHTMLToTipTap(html);

      expect(result.content).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        expect(result.content?.[i]).toMatchObject({
          type: "heading",
          attrs: { level: i + 1 },
        });
      }
    });

    it("should parse paragraphs", () => {
      const html = "<p>This is a paragraph.</p>";
      const result = parseHTMLToTipTap(html);

      expect(result.content).toHaveLength(1);
      expect(result.content?.[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "This is a paragraph." }],
      });
    });

    it("should parse divs as paragraphs", () => {
      const html = "<div>Content in a div</div>";
      const result = parseHTMLToTipTap(html);

      expect(result.content).toHaveLength(1);
      expect(result.content?.[0].type).toBe("paragraph");
    });
  });

  describe("Inline Formatting", () => {
    it("should parse bold text", () => {
      const html = "<p><strong>Bold text</strong></p>";
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0].content).toContainEqual({
        type: "text",
        text: "Bold text",
        marks: [{ type: "bold" }],
      });
    });

    it("should parse italic text", () => {
      const html = "<p><em>Italic text</em></p>";
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0].content).toContainEqual({
        type: "text",
        text: "Italic text",
        marks: [{ type: "italic" }],
      });
    });

    it("should parse links", () => {
      const html = '<p><a href="https://example.com">Click here</a></p>';
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0].content).toContainEqual({
        type: "text",
        text: "Click here",
        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
      });
    });
  });

  describe("Images", () => {
    it("should parse images", () => {
      const html =
        '<img src="https://example.com/image.png" alt="Test image" width="300" height="200" />';
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0]).toMatchObject({
        type: "emailImage",
        attrs: {
          src: "https://example.com/image.png",
          alt: "Test image",
          width: "300",
          height: "200",
        },
      });
    });
  });

  describe("Lists", () => {
    it("should parse bullet lists", () => {
      const html = "<ul><li>Item 1</li><li>Item 2</li></ul>";
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0]).toMatchObject({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item 1" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item 2" }],
              },
            ],
          },
        ],
      });
    });

    it("should parse ordered lists", () => {
      const html = "<ol><li>First</li><li>Second</li></ol>";
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0]).toMatchObject({
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "First" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Second" }],
              },
            ],
          },
        ],
      });
    });
  });

  describe("Dividers", () => {
    it("should parse horizontal rules", () => {
      const html = "<hr />";
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0]).toMatchObject({
        type: "emailDivider",
        attrs: {
          color: "#e5e7eb",
          thickness: "1px",
          margin: "24px",
        },
      });
    });
  });

  describe("Buttons", () => {
    it("should parse styled links as buttons", () => {
      const html =
        '<a href="https://example.com" style="background-color: #3b82f6; color: white; padding: 10px 20px;">Click me</a>';
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0]).toMatchObject({
        type: "emailButton",
        attrs: {
          href: "https://example.com",
          backgroundColor: "#3b82f6",
        },
      });
    });
  });

  describe("Sections", () => {
    it("should parse semantic sections", () => {
      const html =
        '<section style="background-color: #f0f0f0; padding: 16px;"><p>Content</p></section>';
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0]).toMatchObject({
        type: "emailSection",
        attrs: {
          backgroundColor: "#f0f0f0",
          padding: "16px",
        },
      });
    });
  });
});

describe("React Email to TipTap Conversion", () => {
  describe("Basic Components", () => {
    it("should parse Text component", () => {
      const code = `
        import { Text } from "@react-email/components";
        export default function Email() {
          return <Text>Hello World</Text>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.type).toBe("doc");
      expect(result.content?.[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "Hello World" }],
      });
    });

    it("should parse Heading component", () => {
      const code = `
        import { Heading } from "@react-email/components";
        export default function Email() {
          return <Heading as="h1">Title</Heading>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Title" }],
      });
    });

    it("should parse Heading with different levels", () => {
      const code = `
        import { Heading } from "@react-email/components";
        export default function Email() {
          return (
            <>
              <Heading as="h1">H1</Heading>
              <Heading as="h2">H2</Heading>
              <Heading as="h3">H3</Heading>
            </>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "heading",
        attrs: { level: 1 },
      });
      expect(result.content?.[1]).toMatchObject({
        type: "heading",
        attrs: { level: 2 },
      });
      expect(result.content?.[2]).toMatchObject({
        type: "heading",
        attrs: { level: 3 },
      });
    });
  });

  describe("Button Component", () => {
    it("should parse Button with href", () => {
      const code = `
        import { Button } from "@react-email/components";
        export default function Email() {
          return <Button href="https://example.com">Click me</Button>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailButton",
        attrs: {
          href: "https://example.com",
        },
        content: [{ type: "text", text: "Click me" }],
      });
    });

    it("should parse Button with Tailwind classes", () => {
      const code = `
        import { Button } from "@react-email/components";
        export default function Email() {
          return (
            <Button
              href="https://example.com"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold"
            >
              Click me
            </Button>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailButton",
        attrs: {
          href: "https://example.com",
          backgroundColor: "#2563eb", // blue-600
          color: "#ffffff", // white
          borderRadius: "8px", // rounded-lg
          fontWeight: "600", // font-semibold
        },
        content: [{ type: "text", text: "Click me" }],
      });
    });

    it("should parse Button wrapped in div for alignment", () => {
      const code = `
        import { Button } from "@react-email/components";
        export default function Email() {
          return (
            <div className="text-center">
              <Button href="#">Centered Button</Button>
            </div>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      // The div should be unwrapped and the button should be directly in the doc
      expect(result.content?.[0]).toMatchObject({
        type: "emailButton",
        content: [{ type: "text", text: "Centered Button" }],
      });
    });
  });

  describe("Image Component", () => {
    it("should parse Img component", () => {
      const code = `
        import { Img } from "@react-email/components";
        export default function Email() {
          return <Img src="https://example.com/image.png" alt="Logo" width="200" />;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailImage",
        attrs: {
          src: "https://example.com/image.png",
          alt: "Logo",
          width: "200",
        },
      });
    });

    it("should parse Img with Tailwind width", () => {
      const code = `
        import { Img } from "@react-email/components";
        export default function Email() {
          return <Img src="https://example.com/image.png" className="max-w-[600px]" />;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailImage",
        attrs: {
          src: "https://example.com/image.png",
          width: "600px", // max-w-[600px] should be parsed when no explicit width
        },
      });
    });

    it("should prefer width over max-width for Img", () => {
      const code = `
        import { Img } from "@react-email/components";
        export default function Email() {
          return <Img src="https://example.com/image.png" className="w-full max-w-[600px]" />;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      // w-full (100%) takes priority over max-w-[600px]
      expect(result.content?.[0]).toMatchObject({
        type: "emailImage",
        attrs: {
          src: "https://example.com/image.png",
          width: "100%",
        },
      });
    });
  });

  describe("Section Component", () => {
    it("should parse Section component", () => {
      const code = `
        import { Section, Text } from "@react-email/components";
        export default function Email() {
          return (
            <Section className="bg-gray-100 p-6 rounded-lg">
              <Text>Content</Text>
            </Section>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailSection",
        attrs: {
          backgroundColor: "#f3f4f6", // gray-100
          padding: "24px", // p-6 = 24px
          borderRadius: "8px", // rounded-lg
        },
      });
    });
  });

  describe("Hr Component", () => {
    it("should parse Hr component", () => {
      const code = `
        import { Hr } from "@react-email/components";
        export default function Email() {
          return <Hr className="border-gray-200 my-6" />;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailDivider",
      });
    });
  });

  describe("Link Component", () => {
    it("should parse Link component", () => {
      const code = `
        import { Link } from "@react-email/components";
        export default function Email() {
          return <Link href="https://example.com">Click here</Link>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Click here",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
        ],
      });
    });
  });

  describe("Container Components", () => {
    it("should unwrap Html, Body, Container", () => {
      const code = `
        import { Html, Body, Container, Text } from "@react-email/components";
        export default function Email() {
          return (
            <Html>
              <Body>
                <Container>
                  <Text>Hello</Text>
                </Container>
              </Body>
            </Html>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      // Should have the Text content, not the containers
      expect(result.content?.[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "Hello" }],
      });
    });

    it("should unwrap Tailwind component", () => {
      const code = `
        import { Html, Tailwind, Text } from "@react-email/components";
        export default function Email() {
          return (
            <Html>
              <Tailwind>
                <Text>Content</Text>
              </Tailwind>
            </Html>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "Content" }],
      });
    });
  });

  describe("Tailwind Class Parsing", () => {
    it("should parse background colors", () => {
      const code = `
        import { Section } from "@react-email/components";
        export default function Email() {
          return <Section className="bg-indigo-600"><p>Test</p></Section>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailSection",
        attrs: {
          backgroundColor: "#4f46e5", // indigo-600
        },
      });
    });

    it("should parse padding classes", () => {
      const code = `
        import { Section } from "@react-email/components";
        export default function Email() {
          return <Section className="p-8"><p>Test</p></Section>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailSection",
        attrs: {
          padding: "32px", // p-8 = 8 * 4 = 32px
        },
      });
    });

    it("should parse border radius classes", () => {
      const code = `
        import { Section } from "@react-email/components";
        export default function Email() {
          return <Section className="rounded-xl"><p>Test</p></Section>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailSection",
        attrs: {
          borderRadius: "12px", // rounded-xl
        },
      });
    });

    it("should parse text colors", () => {
      const code = `
        import { Button } from "@react-email/components";
        export default function Email() {
          return <Button href="#" className="text-red-500">Red Button</Button>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailButton",
        attrs: {
          color: "#ef4444", // red-500
        },
      });
    });

    it("should parse font weight classes", () => {
      const code = `
        import { Button } from "@react-email/components";
        export default function Email() {
          return <Button href="#" className="font-bold">Bold Button</Button>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.content?.[0]).toMatchObject({
        type: "emailButton",
        attrs: {
          fontWeight: "700", // font-bold
        },
      });
    });
  });

  describe("Variables", () => {
    it("should parse variable expressions", () => {
      const code = `
        import { Text } from "@react-email/components";
        export default function Email({ name }) {
          return <Text>Hello {name}</Text>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      // Should contain text and a variable node
      const content = result.content?.[0].content;
      expect(content).toContainEqual({ type: "text", text: "Hello" });
      expect(content).toContainEqual({
        type: "variable",
        attrs: {
          name: "name",
          label: "name",
          fallback: "",
          format: null,
        },
      });
    });
  });

  describe("Complex Templates", () => {
    it("should parse a complete email template", () => {
      const code = `
        import { Html, Head, Body, Container, Section, Heading, Text, Button, Hr, Img, Tailwind } from "@react-email/components";

        export default function WelcomeEmail({ userName }) {
          return (
            <Html>
              <Tailwind>
                <Head />
                <Body className="bg-gray-100 font-sans">
                  <Container className="bg-white mx-auto p-5 max-w-[600px]">
                    <Heading as="h1" className="text-2xl font-bold">Welcome!</Heading>
                    <Text>Hello {userName}, welcome to our platform.</Text>
                    <Hr className="my-4" />
                    <div className="text-center">
                      <Button href="https://example.com" className="bg-blue-600 text-white px-6 py-3 rounded-md">
                        Get Started
                      </Button>
                    </div>
                    <Img src="https://example.com/logo.png" alt="Logo" className="w-[200px]" />
                  </Container>
                </Body>
              </Tailwind>
            </Html>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.type).toBe("doc");
      expect(result.content?.length).toBeGreaterThan(0);

      // Should have heading
      expect(result.content?.some((node) => node.type === "heading")).toBe(
        true
      );

      // Should have paragraph with variable
      const textNode = result.content?.find(
        (node) => node.type === "paragraph"
      );
      expect(textNode?.content?.some((c) => c.type === "variable")).toBe(true);

      // Should have button
      const buttonNode = result.content?.find(
        (node) => node.type === "emailButton"
      );
      expect(buttonNode).toBeDefined();
      expect(buttonNode?.attrs?.href).toBe("https://example.com");

      // Should have image
      const imageNode = result.content?.find(
        (node) => node.type === "emailImage"
      );
      expect(imageNode).toBeDefined();
      expect(imageNode?.attrs?.src).toBe("https://example.com/logo.png");

      // Should have divider
      expect(result.content?.some((node) => node.type === "emailDivider")).toBe(
        true
      );
    });
  });
});

describe("Round-trip Conversion", () => {
  describe("HTML round-trip", () => {
    it("should preserve heading structure", () => {
      const originalHtml = "<h1>Title</h1><h2>Subtitle</h2>";
      const tiptap = parseHTMLToTipTap(originalHtml);

      expect(tiptap.content).toHaveLength(2);
      expect(tiptap.content?.[0]).toMatchObject({
        type: "heading",
        attrs: { level: 1 },
      });
      expect(tiptap.content?.[1]).toMatchObject({
        type: "heading",
        attrs: { level: 2 },
      });
    });

    it("should preserve list structure", () => {
      const originalHtml = "<ul><li>Item 1</li><li>Item 2</li></ul>";
      const tiptap = parseHTMLToTipTap(originalHtml);

      expect(tiptap.content?.[0]).toMatchObject({
        type: "bulletList",
        content: expect.arrayContaining([
          expect.objectContaining({ type: "listItem" }),
          expect.objectContaining({ type: "listItem" }),
        ]),
      });
    });
  });

  describe("React Email structure preservation", () => {
    it("should preserve button attributes through conversion", () => {
      const code = `
        import { Button } from "@react-email/components";
        export default function Email() {
          return (
            <Button
              href="https://test.com"
              className="bg-green-600 text-white rounded-full"
            >
              Test Button
            </Button>
          );
        }
      `;
      const tiptap = parseReactEmailToTipTap(code);

      const button = tiptap.content?.find(
        (node) => node.type === "emailButton"
      );
      expect(button).toBeDefined();
      expect(button?.attrs?.href).toBe("https://test.com");
      expect(button?.attrs?.backgroundColor).toBe("#16a34a"); // green-600
      expect(button?.attrs?.borderRadius).toBe("9999px"); // rounded-full
      expect(button?.content).toContainEqual({
        type: "text",
        text: "Test Button",
      });
    });

    it("should preserve section styling through conversion", () => {
      const code = `
        import { Section, Text } from "@react-email/components";
        export default function Email() {
          return (
            <Section className="bg-purple-100 p-6 rounded-lg">
              <Text>Section content</Text>
            </Section>
          );
        }
      `;
      const tiptap = parseReactEmailToTipTap(code);

      const section = tiptap.content?.find(
        (node) => node.type === "emailSection"
      );
      expect(section).toBeDefined();
      expect(section?.attrs?.backgroundColor).toBe("#f3e8ff"); // purple-100
      expect(section?.attrs?.padding).toBe("24px"); // p-6
      expect(section?.attrs?.borderRadius).toBe("8px"); // rounded-lg
    });

    it("should preserve image attributes through conversion", () => {
      const code = `
        import { Img } from "@react-email/components";
        export default function Email() {
          return <Img src="https://example.com/photo.jpg" alt="Photo" className="w-full h-[300px]" />;
        }
      `;
      const tiptap = parseReactEmailToTipTap(code);

      const image = tiptap.content?.find((node) => node.type === "emailImage");
      expect(image).toBeDefined();
      expect(image?.attrs?.src).toBe("https://example.com/photo.jpg");
      expect(image?.attrs?.alt).toBe("Photo");
      expect(image?.attrs?.width).toBe("100%");
      expect(image?.attrs?.height).toBe("300px");
    });
  });
});

describe("Edge Cases", () => {
  describe("HTML edge cases", () => {
    it("should handle empty content", () => {
      const html = "";
      const result = parseHTMLToTipTap(html);

      expect(result.type).toBe("doc");
      expect(result.content?.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle whitespace-only content", () => {
      const html = "   \n\t  ";
      const result = parseHTMLToTipTap(html);

      expect(result.type).toBe("doc");
    });

    it("should handle nested inline elements", () => {
      const html = "<p><strong><em>Bold and italic</em></strong></p>";
      const result = parseHTMLToTipTap(html);

      expect(result.content?.[0].type).toBe("paragraph");
    });

    it("should handle script and style tags (skip them)", () => {
      const html =
        '<script>alert("test")</script><style>body{}</style><p>Content</p>';
      const result = parseHTMLToTipTap(html);

      // Should only have the paragraph, not script/style
      expect(result.content).toHaveLength(1);
      expect(result.content?.[0].type).toBe("paragraph");
    });
  });

  describe("React Email edge cases", () => {
    it("should handle empty components", () => {
      const code = `
        import { Section } from "@react-email/components";
        export default function Email() {
          return <Section></Section>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      expect(result.type).toBe("doc");
      const section = result.content?.find(
        (node) => node.type === "emailSection"
      );
      expect(section).toBeDefined();
      // Should have default content
      expect(section?.content).toBeDefined();
    });

    it("should handle invalid JSX gracefully", () => {
      const code = "not valid jsx";
      const result = parseReactEmailToTipTap(code);

      // Should return error message in paragraph
      expect(result.type).toBe("doc");
      expect(result.content?.[0].type).toBe("paragraph");
    });

    it("should handle Preview component (skip it)", () => {
      const code = `
        import { Preview, Text } from "@react-email/components";
        export default function Email() {
          return (
            <>
              <Preview>Preview text</Preview>
              <Text>Actual content</Text>
            </>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      // Should only have the Text content, not Preview
      expect(result.content?.some((node) => node.type === "preview")).toBe(
        false
      );
      expect(result.content?.some((node) => node.type === "paragraph")).toBe(
        true
      );
    });

    it("should handle arbitrary Tailwind values", () => {
      const code = `
        import { Section } from "@react-email/components";
        export default function Email() {
          return <Section className="p-[20px] w-[500px]"><p>Test</p></Section>;
        }
      `;
      const result = parseReactEmailToTipTap(code);

      const section = result.content?.find(
        (node) => node.type === "emailSection"
      );
      expect(section?.attrs?.padding).toBe("20px");
    });
  });

  describe("Block/Inline separation", () => {
    it("should not nest block elements in paragraphs", () => {
      const code = `
        import { Container, Button, Text } from "@react-email/components";
        export default function Email() {
          return (
            <Container>
              <Text>Some text</Text>
              <Button href="#">Click</Button>
              <Text>More text</Text>
            </Container>
          );
        }
      `;
      const result = parseReactEmailToTipTap(code);

      // All content should be at the top level, not nested in paragraphs
      result.content?.forEach((node) => {
        if (node.type === "emailButton") {
          // Button should be a direct child, not inside a paragraph
          expect(true).toBe(true);
        }
      });

      // Specifically check that buttons are not inside paragraphs
      const paragraphs =
        result.content?.filter((node) => node.type === "paragraph") || [];
      for (const para of paragraphs) {
        const hasButtonChild = para.content?.some(
          (child) => child.type === "emailButton"
        );
        expect(hasButtonChild).toBeFalsy();
      }
    });
  });
});

describe("TipTap to React Email Conversion", () => {
  describe("Basic Document Structure", () => {
    it("should generate valid React Email template", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello World" }],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain(
        'import { Html, Head, Body, Container, Text, Button, Section, Img, Hr, Heading, Link, Preview, Tailwind, pixelBasedPreset } from "@react-email/components"'
      );
      expect(result).toContain("export default function EmailTemplate()");
      expect(result).toContain("<Html>");
      expect(result).toContain(
        "<Tailwind config={{ presets: [pixelBasedPreset] }}>"
      );
      expect(result).toContain("Hello World");
    });

    it("should generate Text component for paragraphs", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Test paragraph" }],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("<Text");
      expect(result).toContain("Test paragraph");
    });

    it("should generate Heading component with correct level", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "My Heading" }],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain('<Heading as="h2"');
      expect(result).toContain("My Heading");
    });
  });

  describe("Button Styling Preservation", () => {
    it("should preserve button background color", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailButton",
            attrs: {
              href: "https://example.com",
              backgroundColor: "#dc2626", // red-600
              color: "#ffffff",
              borderRadius: "8px",
              padding: "12px 24px",
              fontWeight: "600",
              align: "center",
            },
            content: [{ type: "text", text: "Click Me" }],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      // Uses bracket syntax for colors and border radius for better email compatibility
      expect(result).toContain("bg-[#dc2626]");
      expect(result).toContain("text-white");
      expect(result).toContain("rounded-[8px]");
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain("Click Me");
    });

    it("should preserve custom button colors using arbitrary values", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailButton",
            attrs: {
              href: "#",
              backgroundColor: "#ff5500", // Custom color
              color: "#333333",
              borderRadius: "4px",
              padding: "16px 32px",
              fontWeight: "700",
              align: "left",
            },
            content: [{ type: "text", text: "Custom Button" }],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("bg-[#ff5500]");
      expect(result).toContain("text-[#333333]");
    });

    it("should handle button alignment", () => {
      const centerButton: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailButton",
            attrs: { href: "#", align: "center" },
            content: [{ type: "text", text: "Center" }],
          },
        ],
      };
      const rightButton: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailButton",
            attrs: { href: "#", align: "right" },
            content: [{ type: "text", text: "Right" }],
          },
        ],
      };

      expect(generateReactEmailCode(centerButton)).toContain(
        'className="text-center"'
      );
      expect(generateReactEmailCode(rightButton)).toContain(
        'className="text-right"'
      );
    });
  });

  describe("Section Styling Preservation", () => {
    it("should preserve section background and padding", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailSection",
            attrs: {
              backgroundColor: "#f3e8ff", // purple-100
              padding: "32px",
              borderRadius: "12px",
            },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Section content" }],
              },
            ],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      // Uses bracket syntax for colors, padding, and border radius for better email compatibility
      expect(result).toContain("bg-[#f3e8ff]");
      expect(result).toContain("p-[32px]");
      expect(result).toContain("rounded-[12px]");
    });

    it("should use arbitrary values for custom padding", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailSection",
            attrs: {
              backgroundColor: "#ffffff",
              padding: "17px", // Non-standard
              borderRadius: "0",
            },
            content: [{ type: "paragraph" }],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("p-[17px]");
    });
  });

  describe("Image Attributes Preservation", () => {
    it("should preserve image src and alt", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailImage",
            attrs: {
              src: "https://example.com/image.png",
              alt: "Example Image",
              width: "300px",
              height: "200px",
              align: "center",
            },
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain('src="https://example.com/image.png"');
      expect(result).toContain('alt="Example Image"');
      expect(result).toContain("w-[300px]");
      expect(result).toContain("h-[200px]");
    });

    it("should handle full width images", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailImage",
            attrs: {
              src: "https://example.com/banner.png",
              alt: "Banner",
              width: "100%",
              height: "auto",
            },
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("w-full");
      expect(result).toContain("h-auto");
    });
  });

  describe("Divider and Spacer", () => {
    it("should generate Hr for dividers", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailDivider",
            attrs: {
              borderColor: "#e5e7eb",
              margin: "24px",
            },
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("<Hr");
      expect(result).toContain("border-gray-200");
      expect(result).toContain("my-6");
    });

    it("should generate spacer divs", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailSpacer",
            attrs: { height: "48px" },
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("h-[48px]");
    });
  });

  describe("Lists", () => {
    it("should generate bullet lists", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Item 1" }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Item 2" }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("<ul");
      expect(result).toContain("<li");
      expect(result).toContain("Item 1");
      expect(result).toContain("Item 2");
    });

    it("should generate ordered lists", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "orderedList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "First" }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("<ol");
      expect(result).toContain("First");
    });
  });

  describe("Variables", () => {
    it("should generate variable expressions", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Hello " },
              { type: "variable", attrs: { name: "userName" } },
            ],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("{props.userName}");
    });
  });

  describe("Rows and Columns", () => {
    it("should generate row with columns", () => {
      const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "emailRow",
            attrs: { gap: "16px" },
            content: [
              {
                type: "emailColumn",
                attrs: { width: "50%" },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Left" }],
                  },
                ],
              },
              {
                type: "emailColumn",
                attrs: { width: "50%" },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Right" }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = generateReactEmailCode(doc);

      expect(result).toContain("flex");
      expect(result).toContain("gap-4");
      expect(result).toContain("Left");
      expect(result).toContain("Right");
    });
  });
});

describe("Full Round-Trip Tests", () => {
  it("should preserve button styles through full round-trip", () => {
    // Create TipTap doc
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "emailButton",
          attrs: {
            href: "https://test.com",
            backgroundColor: "#16a34a", // green-600
            color: "#ffffff",
            borderRadius: "9999px",
            padding: "12px 24px",
            fontWeight: "600",
            align: "center",
          },
          content: [{ type: "text", text: "Green Button" }],
        },
      ],
    };

    // Generate React Email code
    const reactEmailCode = generateReactEmailCode(originalDoc);

    // Parse back to TipTap
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    // Verify button was preserved
    const button = parsedDoc.content?.find(
      (node) => node.type === "emailButton"
    );
    expect(button).toBeDefined();
    expect(button?.attrs?.backgroundColor).toBe("#16a34a");
    expect(button?.attrs?.borderRadius).toBe("9999px");
    expect(button?.content).toContainEqual({
      type: "text",
      text: "Green Button",
    });
  });

  it("should preserve section styles through full round-trip", () => {
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "emailSection",
          attrs: {
            backgroundColor: "#f3e8ff", // purple-100
            padding: "32px",
            borderRadius: "8px",
          },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Section text" }],
            },
          ],
        },
      ],
    };

    const reactEmailCode = generateReactEmailCode(originalDoc);
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    const section = parsedDoc.content?.find(
      (node) => node.type === "emailSection"
    );
    expect(section).toBeDefined();
    expect(section?.attrs?.backgroundColor).toBe("#f3e8ff");
    expect(section?.attrs?.padding).toBe("32px");
    expect(section?.attrs?.borderRadius).toBe("8px");
  });

  it("should preserve preview text through full round-trip", () => {
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "emailPreview",
          attrs: {
            text: "Check out our latest updates!",
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Email body" }],
        },
      ],
    };

    const reactEmailCode = generateReactEmailCode(originalDoc);
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    const preview = parsedDoc.content?.find(
      (node) => node.type === "emailPreview"
    );
    expect(preview).toBeDefined();
    expect(preview?.attrs?.text).toBe("Check out our latest updates!");
  });

  it("should preserve image attributes through full round-trip", () => {
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "emailImage",
          attrs: {
            src: "https://example.com/hero.jpg",
            alt: "Hero image",
            width: "600px",
            height: "300px",
            align: "center",
          },
        },
      ],
    };

    const reactEmailCode = generateReactEmailCode(originalDoc);
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    const image = parsedDoc.content?.find((node) => node.type === "emailImage");
    expect(image).toBeDefined();
    expect(image?.attrs?.src).toBe("https://example.com/hero.jpg");
    expect(image?.attrs?.alt).toBe("Hero image");
  });

  it("should preserve spacer through full round-trip", () => {
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "emailSpacer",
          attrs: {
            height: 32,
          },
        },
      ],
    };

    const reactEmailCode = generateReactEmailCode(originalDoc);
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    const spacer = parsedDoc.content?.find(
      (node) => node.type === "emailSpacer"
    );
    expect(spacer).toBeDefined();
    expect(spacer?.attrs?.height).toBe(32);
  });

  it("should preserve divider through full round-trip", () => {
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "emailDivider",
          attrs: {
            color: "#e5e7eb",
            margin: "24px 0",
          },
        },
      ],
    };

    const reactEmailCode = generateReactEmailCode(originalDoc);
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    const divider = parsedDoc.content?.find(
      (node) => node.type === "emailDivider"
    );
    expect(divider).toBeDefined();
  });

  it("should preserve conditional blocks through full round-trip", () => {
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "conditional",
          attrs: {
            variable: "isPremium",
            operator: "equals",
            value: "true",
          },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Premium content" }],
            },
          ],
        },
      ],
    };

    const reactEmailCode = generateReactEmailCode(originalDoc);
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    const conditional = parsedDoc.content?.find(
      (node) => node.type === "conditional"
    );
    expect(conditional).toBeDefined();
    expect(conditional?.attrs?.variable).toBe("isPremium");
    expect(conditional?.attrs?.operator).toBe("equals");
    expect(conditional?.attrs?.value).toBe("true");
  });

  it("should preserve variables through full round-trip", () => {
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello, " },
            {
              type: "variable",
              attrs: {
                name: "firstName",
                label: "firstName",
                fallback: "there",
              },
            },
            { type: "text", text: "!" },
          ],
        },
      ],
    };

    const reactEmailCode = generateReactEmailCode(originalDoc);
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    const paragraph = parsedDoc.content?.find(
      (node) => node.type === "paragraph"
    );
    expect(paragraph).toBeDefined();

    const variable = paragraph?.content?.find(
      (node) => node.type === "variable"
    );
    expect(variable).toBeDefined();
    expect(variable?.attrs?.name).toBe("firstName");
  });

  it("should preserve complex document with multiple components", () => {
    const originalDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "emailPreview",
          attrs: { text: "Weekly newsletter" },
        },
        {
          type: "emailSection",
          attrs: { backgroundColor: "#f3f4f6", padding: "24px" },
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Welcome!" }],
            },
          ],
        },
        {
          type: "emailSpacer",
          attrs: { height: 24 },
        },
        {
          type: "emailButton",
          attrs: {
            href: "https://example.com",
            backgroundColor: "#3b82f6",
            color: "#ffffff",
          },
          content: [{ type: "text", text: "Get Started" }],
        },
      ],
    };

    const reactEmailCode = generateReactEmailCode(originalDoc);
    const parsedDoc = parseReactEmailToTipTap(reactEmailCode);

    // Verify all components are present
    expect(parsedDoc.content?.some((n) => n.type === "emailPreview")).toBe(
      true
    );
    expect(parsedDoc.content?.some((n) => n.type === "emailSection")).toBe(
      true
    );
    expect(parsedDoc.content?.some((n) => n.type === "emailSpacer")).toBe(true);
    expect(parsedDoc.content?.some((n) => n.type === "emailButton")).toBe(true);
  });
});
