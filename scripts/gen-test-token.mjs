import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { execSync } from 'child_process';

const p = new PrismaClient();
const email = process.argv[2] || 'filikifakio@gmail.com';
const runTests = process.argv[3] === '--test';

const u = await p.user.findFirst({ where: { email } });
if (!u) { console.log('NO USER'); process.exit(1); }

const secret = process.env.JWT_SECRET || 'dev-secret';
const token = jwt.sign({ userId: u.id, role: u.role }, secret, { expiresIn: '1h' });

if (runTests) {
  console.log(`User: ${email} | Role: ${u.role} | ID: ${u.id}`);
  await p.$disconnect();
  execSync(`bash scripts/test-sokin-validation.sh ${token}`, { stdio: 'inherit', cwd: '/home/kinsell/Kin-Sell' });
} else {
  console.log('TOKEN=' + token);
  console.log('ROLE=' + u.role);
  console.log('ID=' + u.id);
  await p.$disconnect();
}
