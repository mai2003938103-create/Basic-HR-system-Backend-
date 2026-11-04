import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tz = (name?: string) => (name ? timestamp(name, { withTimezone: true }) : timestamp({ withTimezone: true }));
const stamps = {
  createdAt: tz().notNull().defaultNow(),
  updatedAt: tz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
const id = () => uuid().primaryKey().defaultRandom();
const day = () => date({ mode: 'string' });

export const roleScope = pgEnum('role_scope', ['all', 'department', 'self']);
export const gender = pgEnum('gender', ['male', 'female', 'other']);
export const employmentStatus = pgEnum('employment_status', ['active', 'probation', 'inactive', 'terminated']);
export const attendanceStatus = pgEnum('attendance_status', ['present', 'late', 'absent', 'half_day', 'leave']);
export const halfDay = pgEnum('half_day', ['none', 'morning', 'afternoon']);
export const leaveStatus = pgEnum('leave_status', ['pending', 'approved', 'rejected', 'cancelled']);
export const payRunStatus = pgEnum('pay_run_status', ['draft', 'pending', 'approved', 'paid']);
export const tokenType = pgEnum('token_type', ['refresh', 'password_reset']);

export const departments = pgTable(
  'departments',
  {
    id: id(),
    code: text().notNull().unique(),
    nameLo: text().notNull(),
    nameEn: text().notNull(),
    description: text(),
    // Circular FK (employees → departments → employees): resolved lazily.
    managerId: uuid().references((): any => employees.id, { onDelete: 'restrict' }),
    isActive: boolean().notNull().default(true),
    ...stamps,
  },
  (t) => [index().on(t.managerId)],
);

export const positions = pgTable(
  'positions',
  {
    id: id(),
    code: text().notNull().unique(),
    nameLo: text().notNull(),
    nameEn: text().notNull(),
    departmentId: uuid()
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    description: text(),
    isActive: boolean().notNull().default(true),
    ...stamps,
  },
  (t) => [index().on(t.departmentId)],
);

export const employees = pgTable(
  'employees',
  {
    id: id(),
    employeeCode: text().notNull().unique(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    gender: gender().notNull(),
    dateOfBirth: day().notNull(),
    phone: text().notNull(),
    email: text().notNull().unique(),
    address: text(),
    photoUrl: text(),
    departmentId: uuid()
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    positionId: uuid()
      .notNull()
      .references(() => positions.id, { onDelete: 'restrict' }),
    hireDate: day().notNull(),
    employmentStatus: employmentStatus().notNull().default('active'),
    basicSalary: numeric({ precision: 14, scale: 2 }).notNull().default('0'),
    emergencyContactName: text(),
    emergencyContactPhone: text(),
    emergencyContactRelation: text(),
    bankName: text(),
    bankAccount: text(),
    // Set when the employee is terminated; ends payroll eligibility after this date.
    endDate: day(),
    searchText: text().notNull().default(''),
    ...stamps,
  },
  (t) => [
    index().on(t.departmentId, t.employmentStatus),
    index().on(t.lastName, t.firstName),
    index().on(t.searchText),
  ],
);

export const users = pgTable('users', {
  id: id(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  isActive: boolean().notNull().default(true),
  mustChangePassword: boolean().notNull().default(false),
  lastLoginAt: tz(),
  employeeId: uuid()
    .unique()
    .references(() => employees.id, { onDelete: 'restrict' }),
  ...stamps,
});

export const roles = pgTable('roles', {
  id: id(),
  code: text().notNull().unique(),
  nameLo: text().notNull(),
  nameEn: text().notNull(),
  scope: roleScope().notNull(),
  isSystem: boolean().notNull().default(false),
  ...stamps,
});

export const permissions = pgTable('permissions', {
  id: id(),
  code: text().notNull().unique(),
  module: text().notNull(),
  description: text(),
  ...stamps,
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    ...stamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid()
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    ...stamps,
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique(),
    type: tokenType().notNull().default('refresh'),
    expiresAt: tz().notNull(),
    revokedAt: tz(),
    /** Set when the token was rotated (not on logout); allows a short grace for concurrent tabs. */
    replacedAt: tz(),
    ...stamps,
  },
  (t) => [index().on(t.userId)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
    ...stamps,
  },
  (t) => [index().on(t.entity, t.entityId), index().on(t.createdAt)],
);

export const attendance = pgTable(
  'attendance',
  {
    id: id(),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    workDate: day().notNull(),
    checkInAt: tz(),
    checkOutAt: tz(),
    workedMinutes: integer().notNull().default(0),
    lateMinutes: integer().notNull().default(0),
    earlyLeaveMinutes: integer().notNull().default(0),
    status: attendanceStatus().notNull(),
    overtimeMinutes: integer().notNull().default(0),
    note: text(),
    checkInIp: text(),
    ...stamps,
  },
  (t) => [uniqueIndex().on(t.employeeId, t.workDate), index().on(t.workDate)],
);

export const leaveTypes = pgTable('leave_types', {
  id: id(),
  code: text().notNull().unique(),
  nameLo: text().notNull(),
  nameEn: text().notNull(),
  defaultDaysPerYear: numeric({ precision: 5, scale: 1 }).notNull().default('0'),
  isPaid: boolean().notNull().default(true),
  documentRequiredAfterDays: integer(),
  isActive: boolean().notNull().default(true),
  ...stamps,
});

export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: id(),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    leaveTypeId: uuid()
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'restrict' }),
    year: integer().notNull(),
    entitledDays: numeric({ precision: 5, scale: 1 }).notNull(),
    usedDays: numeric({ precision: 5, scale: 1 }).notNull().default('0'),
    ...stamps,
  },
  (t) => [uniqueIndex().on(t.employeeId, t.leaveTypeId, t.year)],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: id(),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    leaveTypeId: uuid()
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'restrict' }),
    startDate: day().notNull(),
    endDate: day().notNull(),
    days: numeric({ precision: 5, scale: 1 }).notNull(),
    halfDay: halfDay().notNull().default('none'),
    reason: text().notNull(),
    documentUrl: text(),
    status: leaveStatus().notNull().default('pending'),
    approverId: uuid().references(() => employees.id, { onDelete: 'restrict' }),
    decidedAt: tz(),
    decisionNote: text(),
    /** Days charged per year at approval, e.g. {"2026": 2, "2027": 1}; refunded exactly on cancel. */
    daysByYear: jsonb(),
    ...stamps,
  },
  (t) => [index().on(t.employeeId, t.status), index().on(t.status, t.startDate)],
);

export const holidays = pgTable('holidays', {
  id: id(),
  date: day().notNull().unique(),
  nameLo: text().notNull(),
  nameEn: text().notNull(),
  ...stamps,
});

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    titleKey: text().notNull(),
    data: jsonb(),
    readAt: tz(),
    ...stamps,
  },
  (t) => [index().on(t.userId, t.readAt)],
);

export const companySettings = pgTable(
  'company_settings',
  {
    // Fixed id 1 + CHECK keeps this a single-row table.
    id: integer().primaryKey().default(1),
    companyNameLo: text().notNull(),
    companyNameEn: text().notNull(),
    logoUrl: text(),
    addressLo: text(),
    addressEn: text(),
    taxId: text(),
    phone: text(),
    email: text(),
    currencyCode: text().notNull().default('LAK'),
    currencySymbol: text().notNull().default('₭'),
    workingDays: integer().array().notNull(),
    workStart: text().notNull().default('08:00'),
    workEnd: text().notNull().default('17:00'),
    lateGraceMinutes: integer().notNull().default(15),
    halfDayMinutes: integer().notNull().default(240),
    payrollConfig: jsonb().notNull().default({}),
    notificationConfig: jsonb().notNull().default({}),
    ...stamps,
  },
  (t) => [check('company_settings_single_row', sql`${t.id} = 1`)],
);

// ---- Stage 2: payroll ----
const money = () => numeric({ precision: 14, scale: 0, mode: 'number' });

export const allowanceTypes = pgTable('allowance_types', {
  id: id(),
  code: text().notNull().unique(),
  nameLo: text().notNull(),
  nameEn: text().notNull(),
  taxable: boolean().notNull().default(true),
  isActive: boolean().notNull().default(true),
  ...stamps,
});

export const employeeAllowances = pgTable(
  'employee_allowances',
  {
    id: id(),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    allowanceTypeId: uuid()
      .notNull()
      .references(() => allowanceTypes.id, { onDelete: 'restrict' }),
    amount: money().notNull(),
    ...stamps,
  },
  (t) => [uniqueIndex().on(t.employeeId, t.allowanceTypeId)],
);

export const payRuns = pgTable('pay_runs', {
  id: id(),
  period: text().notNull().unique(), // YYYY-MM
  status: payRunStatus().notNull().default('draft'),
  payDate: day().notNull(),
  configSnapshot: jsonb(),
  createdById: uuid().references(() => users.id, { onDelete: 'set null' }),
  submittedById: uuid().references(() => users.id, { onDelete: 'set null' }),
  submittedAt: tz(),
  approvedById: uuid().references(() => users.id, { onDelete: 'set null' }),
  approvedAt: tz(),
  paidById: uuid().references(() => users.id, { onDelete: 'set null' }),
  paidAt: tz(),
  lastReturnNote: text(),
  ...stamps,
});

export const payItems = pgTable(
  'pay_items',
  {
    id: id(),
    payRunId: uuid()
      .notNull()
      .references(() => payRuns.id, { onDelete: 'cascade' }),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    // inputs
    basic: money().notNull(),
    periodWorkDays: integer().notNull(),
    paidWorkDays: integer().notNull(),
    allowances: jsonb().notNull().default([]),
    overtimeMinutesWeekday: integer().notNull().default(0),
    overtimeMinutesRestday: integer().notNull().default(0),
    bonus: money().notNull().default(0),
    otherDeduction: money().notNull().default(0),
    unpaidDays: numeric({ precision: 4, scale: 1, mode: 'number' }).notNull().default(0),
    note: text(),
    manualFields: text().array().notNull().default(sql`'{}'::text[]`),
    // results
    basicEarned: money().notNull().default(0),
    allowanceTotal: money().notNull().default(0),
    overtimePay: money().notNull().default(0),
    unpaidDeduction: money().notNull().default(0),
    gross: money().notNull().default(0),
    ssBase: money().notNull().default(0),
    ssEmployee: money().notNull().default(0),
    ssEmployer: money().notNull().default(0),
    taxable: money().notNull().default(0),
    incomeTax: money().notNull().default(0),
    totalDeductions: money().notNull().default(0),
    net: money().notNull().default(0),
    employerCost: money().notNull().default(0),
    result: jsonb().notNull().default({}), // full PayResult incl. taxSteps
    ...stamps,
  },
  (t) => [uniqueIndex().on(t.payRunId, t.employeeId), index().on(t.employeeId)],
);

export const payRunEvents = pgTable(
  'pay_run_events',
  {
    id: id(),
    payRunId: uuid()
      .notNull()
      .references(() => payRuns.id, { onDelete: 'cascade' }),
    action: text().notNull(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    note: text(),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [index().on(t.payRunId, t.createdAt)],
);

// ---- relations (for the relational query API) ----
export const usersRelations = relations(users, ({ one, many }) => ({
  employee: one(employees, { fields: [users.employeeId], references: [employees.id] }),
  roles: many(userRoles),
}));
export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(userRoles),
  permissions: many(rolePermissions),
}));
export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));
export const permissionsRelations = relations(permissions, ({ many }) => ({ roles: many(rolePermissions) }));
export const departmentsRelations = relations(departments, ({ one, many }) => ({
  manager: one(employees, { fields: [departments.managerId], references: [employees.id], relationName: 'manager' }),
  positions: many(positions),
  employees: many(employees, { relationName: 'department' }),
}));
export const positionsRelations = relations(positions, ({ one, many }) => ({
  department: one(departments, { fields: [positions.departmentId], references: [departments.id] }),
  employees: many(employees),
}));
export const employeesRelations = relations(employees, ({ one, many }) => ({
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
    relationName: 'department',
  }),
  position: one(positions, { fields: [employees.positionId], references: [positions.id] }),
  user: one(users, { fields: [employees.id], references: [users.employeeId] }),
  managedDepartments: many(departments, { relationName: 'manager' }),
  leaveRequests: many(leaveRequests, { relationName: 'requester' }),
  approvedLeaves: many(leaveRequests, { relationName: 'approver' }),
}));
export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(employees, { fields: [leaveRequests.employeeId], references: [employees.id], relationName: 'requester' }),
  leaveType: one(leaveTypes, { fields: [leaveRequests.leaveTypeId], references: [leaveTypes.id] }),
  approver: one(employees, { fields: [leaveRequests.approverId], references: [employees.id], relationName: 'approver' }),
}));
export const payRunsRelations = relations(payRuns, ({ many }) => ({ items: many(payItems), events: many(payRunEvents) }));
export const payItemsRelations = relations(payItems, ({ one }) => ({
  run: one(payRuns, { fields: [payItems.payRunId], references: [payRuns.id] }),
  employee: one(employees, { fields: [payItems.employeeId], references: [employees.id] }),
}));
export const payRunEventsRelations = relations(payRunEvents, ({ one }) => ({ run: one(payRuns, { fields: [payRunEvents.payRunId], references: [payRuns.id] }) }));
export const employeeAllowancesRelations = relations(employeeAllowances, ({ one }) => ({
  type: one(allowanceTypes, { fields: [employeeAllowances.allowanceTypeId], references: [allowanceTypes.id] }),
}));
