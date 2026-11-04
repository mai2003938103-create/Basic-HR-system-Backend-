import type { AllowanceType } from '../generated/prisma/client.js';
import type { EmployeeAllowanceWithType } from '../models/allowance.model.js';

export const allowanceTypeView = (t: AllowanceType) => ({ id: t.id, code: t.code, nameLo: t.nameLo, nameEn: t.nameEn, taxable: t.taxable, isActive: t.isActive });

export const employeeAllowanceView = ({ amount, type: t }: EmployeeAllowanceWithType) => ({ typeId: t.id, code: t.code, nameLo: t.nameLo, nameEn: t.nameEn, taxable: t.taxable, amount: amount.toNumber() });
