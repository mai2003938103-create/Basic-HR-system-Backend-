import { listQuerySchema, toPaging, page } from '../../src/utils/list-query.js';

describe('list query', () => {
  const schema = listQuerySchema(['name', 'createdAt'], 'name:asc');

  it('applies defaults', () => {
    expect(schema.parse({})).toMatchObject({ page: 1, pageSize: 20, sort: 'name:asc' });
  });

  it('rejects pageSize above 100', () => {
    expect(() => schema.parse({ pageSize: '500' })).toThrow();
  });

  it('rejects a non-sortable field', () => {
    expect(() => schema.parse({ sort: 'salary:asc' })).toThrow();
  });

  it('converts to offset paging', () => {
    expect(toPaging({ page: 3, pageSize: 20, sort: 'name:desc' })).toEqual({ offset: 40, limit: 20, sortField: 'name', sortDir: 'desc' });
  });

  it('builds the list envelope', () => {
    expect(page([1, 2], 12, { page: 2, pageSize: 2 })).toEqual({ data: [1, 2], meta: { page: 2, pageSize: 2, total: 12 } });
  });
});
