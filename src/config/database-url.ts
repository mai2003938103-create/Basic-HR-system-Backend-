/**
 * MySQL 8.4 signs users in with caching_sha2_password. Without TLS the driver needs the server's
 * RSA key, so a plain mysql://user:pass@localhost/db URL works only with allowPublicKeyRetrieval.
 * An explicit value in the URL always wins.
 */
export function databaseUrl(raw: string): string {
  const u = new URL(raw);
  if (!u.searchParams.has('allowPublicKeyRetrieval')) u.searchParams.set('allowPublicKeyRetrieval', 'true');
  return u.toString();
}
