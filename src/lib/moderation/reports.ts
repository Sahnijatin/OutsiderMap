/**
 * Report intake helpers (#122). Person-reports ("report this user") get a
 * higher base severity than content reports so they surface at the top of the
 * moderation queue - the "report-a-person → priority review" requirement.
 * Pure, so it's unit-tested and shared.
 */

export type ReportTargetType = "post" | "comment" | "profile";

export const CONTENT_REPORT_SEVERITY = 40;
export const PROFILE_REPORT_SEVERITY = 60;

export function reportCaseSeverity(targetType: ReportTargetType): number {
  return targetType === "profile"
    ? PROFILE_REPORT_SEVERITY
    : CONTENT_REPORT_SEVERITY;
}
