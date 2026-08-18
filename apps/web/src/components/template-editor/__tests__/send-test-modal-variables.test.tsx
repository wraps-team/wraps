// @vitest-environment jsdom
/**
 * Drives the real SendTestModal, because the bug this pins was invisible to a
 * unit test of the helpers.
 *
 * TanStack Form reads a dotted `name` as a deep path, so a field named
 * "contact.firstName" writes to `values.contact.firstName` rather than the
 * flat key the modal reads when it builds preview and send data. The modal
 * keys its fields by `toSesVariableName(name)` to avoid that — but the schema,
 * defaults, submit payload and field JSX all have to agree. An earlier fix
 * updated every consumer and left the `<form.Field name=...>` on the dotted
 * name, which typechecked, passed the helper unit tests, and still rendered
 * an empty value in both the preview and the sent email.
 *
 * These tests go through the rendered form, so any half-applied fix fails.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { email: "tester@example.test" } } }),
}));

import { SendTestModal } from "../send-test-modal";

afterEach(cleanup);

const COMPILED_HTML =
  "<p>{{contact.firstName}} at {{organization.name}}</p>" +
  "<p>{{heading}}</p><p>Hi {{greetingName|there}}</p><p>{{content}}</p>";

function renderModal() {
  render(
    <SendTestModal
      compiledHtml={COMPILED_HTML}
      isOpen
      onClose={() => {
        // no-op
      }}
      orgSlug="acme"
      templateId="tmpl_1"
      templateVariables={[
        { name: "contact.firstName" },
        { name: "organization.name" },
        { name: "heading" },
        { name: "greetingName" },
        { name: "content" },
      ]}
    />
  );
}

describe("SendTestModal template variable fields", () => {
  it("labels dotted variables with their authoring name", () => {
    renderModal();
    expect(screen.getByText("{{contact.firstName}}")).toBeTruthy();
    expect(screen.getByText("{{organization.name}}")).toBeTruthy();
  });

  it("renders dotted variable values typed into the form", () => {
    renderModal();

    fireEvent.change(
      screen.getByPlaceholderText("Value for contact.firstName"),
      {
        target: { value: "Jane" },
      }
    );
    fireEvent.change(
      screen.getByPlaceholderText("Value for organization.name"),
      { target: { value: "ACME Inc" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const frame = screen.getByTitle("Test email preview") as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toContain("Jane at ACME Inc");
  });

  it("renders plain variables and fallback syntax alongside them", () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("Value for heading"), {
      target: { value: "Checklist" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const srcDoc = (
      screen.getByTitle("Test email preview") as HTMLIFrameElement
    ).getAttribute("srcdoc");
    expect(srcDoc).toContain("Checklist");
    // greetingName left blank — the {{var|fallback}} branch should apply.
    expect(srcDoc).toContain("Hi there");
  });

  it("keeps the preview isolated in a sandboxed iframe", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const frame = screen.getByTitle("Test email preview");
    expect(frame.getAttribute("sandbox")).toBe("");
  });

  // An <input> cannot hold a newline, so a long-form variable typed into one
  // silently loses its line breaks before the value ever reaches the renderer.
  // The broadcast mapper gives these a textarea; the test form has to agree,
  // or the same variable behaves differently depending on which form you use.
  it("gives a long-form variable a textarea, not a single-line input", () => {
    renderModal();
    const field = screen.getByPlaceholderText("Value for content");
    expect(field.tagName).toBe("TEXTAREA");
  });

  it("keeps short variables on a single-line input", () => {
    renderModal();
    expect(screen.getByPlaceholderText("Value for heading").tagName).toBe(
      "INPUT"
    );
  });

  it("carries newlines typed into a long-form variable through to the render", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("Value for content"), {
      target: { value: "line one\nline two" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const srcDoc = (
      screen.getByTitle("Test email preview") as HTMLIFrameElement
    ).getAttribute("srcdoc");
    expect(srcDoc).toContain("line one\nline two");
  });
});
