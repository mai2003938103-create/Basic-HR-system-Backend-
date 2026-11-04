import { z } from 'zod';

export interface ListParams {
  page: number;
  pageSize: number;
  sort: string;
  search?: string;
}

export function listQuerySchema(sortable: readonly string[], defaultSort: string) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => (v ? v : undefined)),
    sort: z
      .string()
      .default(defaultSort)
      .refine((v) => {
        const [field, dir] = v.split(':');
        return sortable.includes(field) && (dir === 'asc' || dir === 'desc');
      }, 'errors.validation.invalidSort'),
  });
}

export function toPaging(q: Pick<ListParams, 'page' | 'pageSize' | 'sort'>) {
  const [sortField, dir] = q.sort.split(':');
  return { offset: (q.page - 1) * q.pageSize, limit: q.pageSize, sortField, sortDir: dir as 'asc' | 'desc' };
}

export function page<T>(data: T[], total: number, q: Pick<ListParams, 'page' | 'pageSize'>) {
  return { data, meta: { page: q.page, pageSize: q.pageSize, total } };
}
