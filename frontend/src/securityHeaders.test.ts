import nginx_template from "../nginx.conf.template?raw";
import { apiOriginOf, contentSecurityPolicy, securityHeaders } from "../securityHeaders";

describe("security headers", () => {
  it("are what nginx sends in production", () => {
    for (const [header_name, header_value] of Object.entries(securityHeaders("${API_ORIGIN}"))) {
      expect(nginx_template).toContain(`add_header ${header_name} "${header_value}" always;`);
    }
  });

  it("allow scripts only from the app, with WASM but no eval", () => {
    const policy = contentSecurityPolicy("https://api.example.com");
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).toContain("connect-src 'self' https://api.example.com ");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
  });

  it("take the API origin from its URL", () => {
    expect(apiOriginOf("https://api.example.com/v1")).toBe("https://api.example.com");
    expect(apiOriginOf("http://localhost:8080")).toBe("http://localhost:8080");
    expect(apiOriginOf("/api")).toBe("");
    expect(apiOriginOf(undefined)).toBe("");
    expect(contentSecurityPolicy("")).toContain("connect-src 'self' https://fonts.googleapis.com");
  });
});
