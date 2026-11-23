// Os testes unitários não abrem o banco, mas alguns módulos importam src/lib/db.ts, que exige DATABASE_URL.
// Sem isto, `npm test` falha numa pasta sem .env (e, numa com .env, aponta para o banco de verdade).
process.env.DATABASE_URL = "file:./tests/.banco-nao-usado.db";
