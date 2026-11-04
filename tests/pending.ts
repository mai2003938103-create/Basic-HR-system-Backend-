// Integration test files whose module has not moved to the MVC/Prisma layout yet (removed task by task; deleted in Task 7).
export const PENDING = [
  'allowances', 'attendance', 'calendar', 'dashboard', 'departments', 'employees', 'files', 'leave',
  'notifications', 'openapi', 'payroll-inputs', 'positions', 'review-fixes', 'roles', 'settings', 
].map((n) => `tests/integration/${n}.test.ts`);
