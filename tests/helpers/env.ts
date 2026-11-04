// Test environment: point the app at the test database before any module loads.
process.env.NODE_ENV = 'test';
// Review Focus 1: run every test with a non-UTC server clock, like the company server.
process.env.TZ = 'Asia/Vientiane';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'mysql://root:root@127.0.0.1:3306/hrms_test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.ADMIN_EMAIL ??= 'admin@systory.test';
process.env.ADMIN_PASSWORD ??= 'Admin1234';
process.env.UPLOAD_DIR ??= 'uploads-test';
