// Server profile is authoritative. Unknown/missing flags fail closed for other roles.
export function canUseConsultant(roleKind: string, enabled: boolean | undefined) {
  return roleKind === "sa" || enabled === true;
}
