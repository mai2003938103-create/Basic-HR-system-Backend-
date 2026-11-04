import { databaseUrl } from '../../src/config/database-url.js';

describe('databaseUrl (Review Focus 2: MySQL 8.4 caching_sha2_password without TLS)', () => {
  it('allows public key retrieval when the URL does not say otherwise', () => {
    const u = new URL(databaseUrl('mysql://u:p@h:3306/db'));
    expect(u.searchParams.get('allowPublicKeyRetrieval')).toBe('true');
    expect(u.pathname).toBe('/db');
    expect(u.username).toBe('u');
  });

  it('keeps explicit options', () => {
    const u = new URL(databaseUrl('mysql://u:p@h/db?allowPublicKeyRetrieval=false&ssl=true'));
    expect(u.searchParams.get('allowPublicKeyRetrieval')).toBe('false');
    expect(u.searchParams.get('ssl')).toBe('true');
  });
});
