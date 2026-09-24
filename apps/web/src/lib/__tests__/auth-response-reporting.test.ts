import { classifyAuthResponse } from "@/lib/auth-response-reporting";

const URL_ = "http://localhost:3000/api/auth/callback/google";

describe("classifyAuthResponse", () => {
  it("classifies a 500 as a server_error with the request path", () => {
    const response = new Response(null, { status: 500 });

    expect(classifyAuthResponse(URL_, response)).toEqual({
      kind: "server_error",
      status: 500,
      path: "/api/auth/callback/google",
    });
  });

  it("classifies a redirect to ?error=internal_server_error as error level", () => {
    const response = new Response(null, {
      status: 302,
      headers: { location: "/auth?error=internal_server_error" },
    });

    expect(classifyAuthResponse(URL_, response)).toEqual({
      kind: "error_redirect",
      code: "internal_server_error",
      level: "error",
      path: "/api/auth/callback/google",
    });
  });

  it("classifies a redirect to ?error=access_denied as warning level", () => {
    const response = new Response(null, {
      status: 302,
      headers: { location: "/auth?error=access_denied" },
    });

    const issue = classifyAuthResponse(URL_, response);
    expect(issue?.kind).toBe("error_redirect");
    expect(issue?.kind === "error_redirect" && issue.level).toBe("warning");
  });

  it("returns undefined for a redirect with no error param", () => {
    const response = new Response(null, {
      status: 302,
      headers: { location: "/onboarding" },
    });

    expect(classifyAuthResponse(URL_, response)).toBeUndefined();
  });

  it("returns undefined for 200 and 401", () => {
    expect(
      classifyAuthResponse(URL_, new Response(null, { status: 200 }))
    ).toBeUndefined();
    expect(
      classifyAuthResponse(URL_, new Response(null, { status: 401 }))
    ).toBeUndefined();
  });

  it("returns undefined for a redirect with no location header", () => {
    const response = new Response(null, { status: 302 });

    expect(classifyAuthResponse(URL_, response)).toBeUndefined();
  });
});
