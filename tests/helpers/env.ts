// Test environment: point the app at the test database before any module loads.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/hrms_test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.ADMIN_EMAIL ??= 'admin@systory.test';
process.env.ADMIN_PASSWORD ??= 'Admin1234';
process.env.UPLOAD_DIR ??= 'uploads-test';
