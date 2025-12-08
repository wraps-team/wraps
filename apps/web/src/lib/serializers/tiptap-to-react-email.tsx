/**
 * TipTap to React Email Serializer
 *
 * Converts TipTap JSON content to React Email components.
 * This is a core part of the template editor that transforms
 * the editor's document structure into renderable email HTML.
 */

import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import type { JSONContent } from "@tiptap/core";
import type { ReactElement } from "react";

interface SerializerOptions {
	previewText?: string;
}

/**
 * Resolves a variable in the content with test data
 */
function resolveVariable(
	name: string,
	testData: Record<string, unknown>,
	fallback?: string
): string {
	const value = testData[name];
	if (value !== undefined && value !== null) {
		return String(value);
	}
	return fallback || `{{${name}}}`;
}

/**
 * Evaluates a conditional expression
 */
function evaluateCondition(
	variableName: string,
	operator: string,
	compareValue: unknown,
	testData: Record<string, unknown>
): boolean {
	const value = testData[variableName];

	switch (operator) {
		case "equals":
			return value === compareValue;
		case "notEquals":
			return value !== compareValue;
		case "exists":
			return value !== undefined && value !== null;
		case "notExists":
			return value === undefined || value === null;
		case "contains":
			return String(value).includes(String(compareValue));
		case "greaterThan":
			return Number(value) > Number(compareValue);
		case "lessThan":
			return Number(value) < Number(compareValue);
		default:
			return false;
	}
}

/**
 * Converts a TipTap node to React Email component(s)
 */
function nodeToReactEmail(
	node: JSONContent,
	testData: Record<string, unknown>,
	index: number
): ReactElement | ReactElement[] | string | null {
	const key = `node-${index}`;

	switch (node.type) {
		case "doc":
			return (
				<>
					{node.content?.map((child, i) =>
						nodeToReactEmail(child, testData, i)
					)}
				</>
			);

		case "paragraph":
			return (
				<Text key={key} style={{ margin: "16px 0", lineHeight: "1.5" }}>
					{node.content?.map((child, i) =>
						nodeToReactEmail(child, testData, i)
					)}
				</Text>
			);

		case "text":
			let text = node.text || "";

			// Apply marks (bold, italic, etc.)
			if (node.marks) {
				for (const mark of node.marks) {
					switch (mark.type) {
						case "bold":
							return <strong key={key}>{text}</strong>;
						case "italic":
							return <em key={key}>{text}</em>;
						case "underline":
							return <u key={key}>{text}</u>;
						case "link":
							return (
								<Link key={key} href={mark.attrs?.href}>
									{text}
								</Link>
							);
					}
				}
			}

			return text;

		case "heading":
			const level = node.attrs?.level || 1;
			const HeadingTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
			return (
				<Heading key={key} as={HeadingTag}>
					{node.content?.map((child, i) =>
						nodeToReactEmail(child, testData, i)
					)}
				</Heading>
			);

		case "emailButton":
			return (
				<Button
					key={key}
					href={node.attrs?.href || "#"}
					style={{
						backgroundColor: node.attrs?.backgroundColor || "#007bff",
						color: node.attrs?.textColor || "#ffffff",
						padding: "12px 24px",
						borderRadius: node.attrs?.borderRadius || "4px",
						textDecoration: "none",
						display: "inline-block",
					}}
				>
					{node.attrs?.text || "Click here"}
				</Button>
			);

		case "emailSection":
			return (
				<Section
					key={key}
					style={{
						backgroundColor: node.attrs?.backgroundColor,
						padding: node.attrs?.padding || "20px",
					}}
				>
					{node.content?.map((child, i) =>
						nodeToReactEmail(child, testData, i)
					)}
				</Section>
			);

		case "emailImage":
			return (
				<Img
					key={key}
					src={node.attrs?.src || ""}
					alt={node.attrs?.alt || ""}
					width={node.attrs?.width}
					height={node.attrs?.height}
					style={{
						maxWidth: "100%",
						height: "auto",
					}}
				/>
			);

		case "emailDivider":
		case "horizontalRule":
			return (
				<Hr
					key={key}
					style={{
						borderColor: node.attrs?.color || "#e5e5e5",
						margin: "24px 0",
					}}
				/>
			);

		case "emailSpacer":
			return (
				<div
					key={key}
					style={{
						height: node.attrs?.height || "20px",
					}}
				/>
			);

		case "variable":
			return resolveVariable(
				node.attrs?.name || "",
				testData,
				node.attrs?.fallback
			);

		case "conditional":
			const shouldShow = evaluateCondition(
				node.attrs?.variableName || "",
				node.attrs?.operator || "exists",
				node.attrs?.value,
				testData
			);

			if (shouldShow) {
				return (
					<>
						{node.content?.map((child, i) =>
							nodeToReactEmail(child, testData, i)
						)}
					</>
				);
			}
			return null;

		case "bulletList":
			return (
				<ul key={key} style={{ paddingLeft: "20px", margin: "16px 0" }}>
					{node.content?.map((child, i) =>
						nodeToReactEmail(child, testData, i)
					)}
				</ul>
			);

		case "orderedList":
			return (
				<ol key={key} style={{ paddingLeft: "20px", margin: "16px 0" }}>
					{node.content?.map((child, i) =>
						nodeToReactEmail(child, testData, i)
					)}
				</ol>
			);

		case "listItem":
			return (
				<li key={key}>
					{node.content?.map((child, i) =>
						nodeToReactEmail(child, testData, i)
					)}
				</li>
			);

		case "blockquote":
			return (
				<blockquote
					key={key}
					style={{
						borderLeft: "4px solid #e5e5e5",
						paddingLeft: "16px",
						margin: "16px 0",
						color: "#666",
					}}
				>
					{node.content?.map((child, i) =>
						nodeToReactEmail(child, testData, i)
					)}
				</blockquote>
			);

		case "codeBlock":
			return (
				<pre
					key={key}
					style={{
						backgroundColor: "#f5f5f5",
						padding: "16px",
						borderRadius: "4px",
						overflow: "auto",
						fontFamily: "monospace",
					}}
				>
					<code>
						{node.content?.map((child, i) =>
							nodeToReactEmail(child, testData, i)
						)}
					</code>
				</pre>
			);

		default:
			// For unknown nodes, try to render children
			if (node.content) {
				return (
					<>
						{node.content.map((child, i) =>
							nodeToReactEmail(child, testData, i)
						)}
					</>
				);
			}
			return null;
	}
}

/**
 * Converts TipTap JSON content to a complete React Email component
 */
export function tiptapToReactEmail(
	content: JSONContent,
	testData: Record<string, unknown> = {},
	options: SerializerOptions = {}
): ReactElement {
	const emailContent = nodeToReactEmail(content, testData, 0);

	return (
		<Html>
			<Head />
			{options.previewText && <Preview>{options.previewText}</Preview>}
			<Body
				style={{
					backgroundColor: "#f6f6f6",
					fontFamily:
						'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
				}}
			>
				<Container
					style={{
						backgroundColor: "#ffffff",
						margin: "0 auto",
						padding: "20px",
						maxWidth: "600px",
					}}
				>
					{emailContent}
				</Container>
			</Body>
		</Html>
	);
}
