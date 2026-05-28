import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const db = new PrismaClient();
const secret = process.env.HANDY_MASTER_SECRET;

async function main() {
    // Create a user account
    const user = await db.account.upsert({
        where: { publicKey: 'mt-happy-cli-user' },
        update: { updatedAt: new Date() },
        create: { publicKey: 'mt-happy-cli-user' }
    });

    // Create a JWT token
    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '365d' });

    console.log('TOKEN=' + token);
    console.log('USER_ID=' + user.id);

    await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
