import { describe, expect, it } from "vitest";
import { autoMapColumns } from "../csv-column-mapping";

describe("autoMapColumns", () => {
  it("maps exact match headers", () => {
    const result = autoMapColumns(["email", "phone", "company"]);
    expect(result).toEqual({
      email: "email",
      phone: "phone",
      company: "company",
    });
  });

  it("maps alias headers case-insensitively", () => {
    const result = autoMapColumns([
      "Email Address",
      "Phone Number",
      "First Name",
      "Last Name",
      "Company Name",
      "Job Title",
    ]);
    expect(result).toEqual({
      "Email Address": "email",
      "Phone Number": "phone",
      "First Name": "firstName",
      "Last Name": "lastName",
      "Company Name": "company",
      "Job Title": "jobTitle",
    });
  });

  it("treats unmapped columns as properties", () => {
    const result = autoMapColumns(["email", "Favorite Color", "Signup Source"]);
    expect(result).toEqual({
      email: "email",
      "Favorite Color": "property",
      "Signup Source": "property",
    });
  });

  it("prevents duplicate field assignments (first match wins)", () => {
    const result = autoMapColumns(["email", "mail", "e-mail"]);
    expect(result).toEqual({
      email: "email",
      mail: "property",
      "e-mail": "property",
    });
  });

  it("handles mixed case headers", () => {
    const result = autoMapColumns(["EMAIL", "PHONE", "FIRST_NAME"]);
    expect(result).toEqual({
      EMAIL: "email",
      PHONE: "phone",
      FIRST_NAME: "firstName",
    });
  });

  it("handles all known aliases", () => {
    const result = autoMapColumns([
      "e-mail",
      "mobile",
      "fname",
      "surname",
      "org",
      "position",
      "date_added",
    ]);
    expect(result).toEqual({
      "e-mail": "email",
      mobile: "phone",
      fname: "firstName",
      surname: "lastName",
      org: "company",
      position: "jobTitle",
      date_added: "createdAt",
    });
  });

  it("maps createdAt aliases", () => {
    const result = autoMapColumns(["email", "Created At"]);
    expect(result).toEqual({
      email: "email",
      "Created At": "createdAt",
    });

    const result2 = autoMapColumns(["email", "signup_date"]);
    expect(result2).toEqual({
      email: "email",
      signup_date: "createdAt",
    });
  });

  it("returns empty mapping for empty headers", () => {
    expect(autoMapColumns([])).toEqual({});
  });

  it("handles whitespace in headers", () => {
    const result = autoMapColumns(["  email  ", "  phone  "]);
    expect(result).toEqual({
      "  email  ": "email",
      "  phone  ": "phone",
    });
  });

  it("maps SMS consent headers", () => {
    const result = autoMapColumns([
      "Email",
      "Phone",
      "SMS Status",
      "Consent Date",
    ]);
    expect(result).toEqual({
      Email: "email",
      Phone: "phone",
      "SMS Status": "smsStatus",
      "Consent Date": "smsConsentedAt",
    });
  });

  it("maps SMS consent aliases", () => {
    const result = autoMapColumns(["email", "sms_opt_in", "opted_in_at"]);
    expect(result).toEqual({
      email: "email",
      sms_opt_in: "smsStatus",
      opted_in_at: "smsConsentedAt",
    });
  });
});
