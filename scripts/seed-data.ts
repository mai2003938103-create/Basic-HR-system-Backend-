export const PERMISSIONS: { code: string; module: string }[] = [
  ...['read', 'create', 'update', 'delete'].map((a) => ({ code: `employee.${a}`, module: 'employee' })),
  { code: 'department.read', module: 'department' },
  { code: 'department.manage', module: 'department' },
  { code: 'position.read', module: 'position' },
  { code: 'position.manage', module: 'position' },
  { code: 'attendance.read', module: 'attendance' },
  { code: 'attendance.check', module: 'attendance' },
  { code: 'attendance.manage', module: 'attendance' },
  { code: 'leave.read', module: 'leave' },
  { code: 'leave.request', module: 'leave' },
  { code: 'leave.approve', module: 'leave' },
  { code: 'leave.manage', module: 'leave' },
  { code: 'dashboard.view', module: 'dashboard' },
  { code: 'user.read', module: 'user' },
  { code: 'user.manage', module: 'user' },
  { code: 'role.manage', module: 'user' },
  // Stage 2
  { code: 'payroll.read', module: 'payroll' },
  { code: 'payroll.manage', module: 'payroll' },
  { code: 'payroll.approve', module: 'payroll' },
  { code: 'payslip.self', module: 'payroll' },
  { code: 'report.view', module: 'report' },
  { code: 'settings.manage', module: 'settings' },
];

export type Scope = 'all' | 'department' | 'self';

export const ROLES: { code: string; nameLo: string; nameEn: string; scope: Scope; permissions: string[] | '*'; system?: false }[] = [
  { code: 'super_admin', nameLo: 'ຜູ້ດູແລລະບົບສູງສຸດ', nameEn: 'Super Admin', scope: 'all', permissions: '*' },
  {
    code: 'hr_admin',
    nameLo: 'ຜູ້ດູແລຝ່າຍບຸກຄະລາກອນ',
    nameEn: 'HR Admin',
    scope: 'all',
    // Preparing payroll and approving it are kept apart (spec §3.1).
    permissions: PERMISSIONS.map((p) => p.code).filter((c) => c !== 'role.manage' && c !== 'payroll.approve'),
  },
  {
    code: 'manager',
    nameLo: 'ຫົວໜ້າພະແນກ',
    nameEn: 'Manager',
    scope: 'department',
    permissions: [
      'employee.read', 'department.read', 'position.read', 'attendance.read', 'attendance.check',
      'leave.read', 'leave.request', 'leave.approve', 'dashboard.view', 'payslip.self', 'report.view',
    ],
  },
  {
    code: 'employee',
    nameLo: 'ພະນັກງານ',
    nameEn: 'Employee',
    scope: 'self',
    permissions: ['attendance.check', 'attendance.read', 'leave.request', 'leave.read', 'payslip.self'],
  },
  {
    code: 'director',
    nameLo: 'ຜູ້ອຳນວຍການ',
    nameEn: 'Director',
    scope: 'all',
    system: false,
    permissions: [
      'employee.read', 'department.read', 'position.read', 'attendance.read', 'leave.read', 'dashboard.view',
      'payroll.read', 'payroll.approve', 'report.view', 'payslip.self',
    ],
  },
];

// Sample values only: HR must confirm them against company policy and Lao labour law before go-live.
export const LEAVE_TYPES = [
  { code: 'ANNUAL', nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual Leave', defaultDaysPerYear: '15', isPaid: true, documentRequiredAfterDays: null },
  { code: 'SICK', nameLo: 'ລາປ່ວຍ', nameEn: 'Sick Leave', defaultDaysPerYear: '30', isPaid: true, documentRequiredAfterDays: 2 },
  { code: 'PERSONAL', nameLo: 'ລາກິດສ່ວນຕົວ', nameEn: 'Personal Leave', defaultDaysPerYear: '3', isPaid: true, documentRequiredAfterDays: null },
  { code: 'UNPAID', nameLo: 'ລາບໍ່ຮັບເງິນເດືອນ', nameEn: 'Unpaid Leave', defaultDaysPerYear: '0', isPaid: false, documentRequiredAfterDays: null },
  { code: 'MATERNITY', nameLo: 'ລາເກີດລູກ', nameEn: 'Maternity Leave', defaultDaysPerYear: '105', isPaid: true, documentRequiredAfterDays: 0 },
];

export const DEFAULT_SETTINGS = {
  companyNameLo: 'ບໍລິສັດ ຊິສໂຕຣີ',
  companyNameEn: 'Systory',
  currencyCode: 'LAK',
  currencySymbol: '₭',
  workingDays: [1, 2, 3, 4, 5],
  workStart: '08:00',
  workEnd: '17:00',
  lateGraceMinutes: 15,
  halfDayMinutes: 240,
};

// General allowance types; the company edits them in Settings (spec §11).
export const ALLOWANCE_TYPES = [
  { code: 'POSITION', nameLo: 'ເງິນອຸດໜູນຕຳແໜ່ງ', nameEn: 'Position allowance', taxable: true },
  { code: 'TRANSPORT', nameLo: 'ຄ່າເດີນທາງ', nameEn: 'Transport', taxable: true },
  { code: 'MEAL', nameLo: 'ຄ່າອາຫານ', nameEn: 'Meal', taxable: true },
];
