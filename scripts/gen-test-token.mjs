import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const p = new PrismaClient();
const email = process.argv[2] || 'filikifakio@gmail.com';

const u = await p.user.findFirst({ where: { email } });
if (!u) { console.log('NO USER'); process.exit(1); }

const secret = process.env.JWT_SECRET || 'dev-secret';
const token = jwt.sign({ userId: u.id, role: u.role }, secret, { expiresIn: '1h' });
console.log('TOKEN=' + token);
console.log('ROLE=' + u.role);
console.log('ID=' + u.id);
await p.$disconnect();
