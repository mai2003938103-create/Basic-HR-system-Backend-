import { z } from 'zod';
import { boolQuery, code, optionalText, requiredText } from '../../lib/http.js';
import { listQuerySchema } from '../../lib/list-query.js';

export const SORTABLE = ['code', 'nameLo', 'nameEn', 'createdAt'] as const;
export const listPositionsQuery = listQuerySchema(SORTABLE, 'code:asc').extend({
  isActive: boolQuery,
  departmentId: z.string().uuid().optional(),
});
export const createPositionBody = z.object({
  code,
  nameLo: requiredText(),
  nameEn: requiredText(),
  departmentId: z.string().uuid('errors.position.invalidDepartment'),
  description: optionalText,
  isActive: z.boolean().optional(),
});
export const updatePositionBody = createPositionBody.partial();
