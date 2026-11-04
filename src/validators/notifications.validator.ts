import { z } from 'zod';
import { boolQuery } from '../utils/http.js';

export const listNotificationsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unread: boolQuery,
});
