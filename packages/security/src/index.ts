export const roles = [
  "owner",
  "admin",
  "clinician",
  "receptionist",
  "finance",
  "auditor",
] as const;

export type Role = (typeof roles)[number];

export const permissions = [
  "tenant.manage",
  "users.manage",
  "security.audit.read",
  "patients.read",
  "patients.write",
  "appointments.read",
  "appointments.write",
  "records.read",
  "records.write",
  "records.finalize",
  "records.addendum",
  "documents.read",
  "documents.write",
  "finance.read",
  "finance.write",
  "finance.close",
  "reports.operational.read",
  "reports.financial.read",
] as const;

export type Permission = (typeof permissions)[number];

const allPermissions = new Set<Permission>(permissions);

export const rolePermissions: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: allPermissions,
  admin: allPermissions,
  clinician: new Set([
    "patients.read",
    "patients.write",
    "appointments.read",
    "appointments.write",
    "records.read",
    "records.write",
    "records.finalize",
    "records.addendum",
    "documents.read",
    "documents.write",
    "finance.read",
    "reports.operational.read",
  ]),
  receptionist: new Set([
    "patients.read",
    "patients.write",
    "appointments.read",
    "appointments.write",
  ]),
  finance: new Set([
    "patients.read",
    "appointments.read",
    "finance.read",
    "finance.write",
    "finance.close",
    "reports.financial.read",
  ]),
  auditor: new Set([
    "security.audit.read",
    "patients.read",
    "appointments.read",
    "records.read",
    "documents.read",
    "finance.read",
    "reports.operational.read",
    "reports.financial.read",
  ]),
};

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
