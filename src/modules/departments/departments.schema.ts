import { z } from 'zod';
import { boolQuery, code, optionalText, requiredText } from '../../utils/http.js';
import { listQuerySchema } from '../../utils/list-query.js';

export const SORTABLE = ['code', 'nameLo', 'nameEn', 'createdAt'] as const;

export const listDepartmentsQuery = listQuerySchema(SORTABLE, 'code:asc').extend({ isActive: boolQuery });

export const createDepartmentBody = z.object({
  code,
  nameLo: requiredText(),
  nameEn: requiredText(),
  description: optionalText,
  managerId: z.string().uuid().nullish(),
  isActive: z.boolean().optional(),
});
export const updateDepartmentBody = createDepartmentBody.partial();
