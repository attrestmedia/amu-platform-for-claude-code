export function isGaReportApplicableToPropertyRole(
  config: { propertyRoles?: string[] },
  propertyRole: string,
) {
  return !config.propertyRoles?.length || config.propertyRoles.includes(propertyRole);
}
