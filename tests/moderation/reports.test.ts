import { describe, expect, it } from "vitest";
import {
  reportCaseSeverity,
  PROFILE_REPORT_SEVERITY,
  CONTENT_REPORT_SEVERITY,
} from "@/lib/moderation/reports";

describe("reportCaseSeverity", () => {
  it("gives person-reports a higher priority than content reports", () => {
    expect(reportCaseSeverity("profile")).toBe(PROFILE_REPORT_SEVERITY);
    expect(PROFILE_REPORT_SEVERITY).toBeGreaterThan(CONTENT_REPORT_SEVERITY);
  });

  it("uses the content severity for posts and comments", () => {
    expect(reportCaseSeverity("post")).toBe(CONTENT_REPORT_SEVERITY);
    expect(reportCaseSeverity("comment")).toBe(CONTENT_REPORT_SEVERITY);
  });
});
