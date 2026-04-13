// Global test environment setup – runs before every test module
// These must be set before any import of app/lib/env (which throws if missing)
process.env.JWT_SECRET = 'test-jwt-secret-for-vitest-32chars!!';
process.env.ADMIN_PASS = 'test-admin-pass';
process.env.ADMIN_USER = 'testadmin';
process.env.MAX_SELLERS = '200';
process.env.SMTP_PORT = '587';
