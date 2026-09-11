// Run with `npm run seed`. Creates exactly one Admin account, from
// SEED_ADMIN_NAME / SEED_ADMIN_PASSWORD in .env, so there's a way to log
// into the console for the first time. Safe to re-run — it's a no-op if
// that name already exists.
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const db = new PrismaClient();

async function main() {
	const name = process.env.SEED_ADMIN_NAME;
	const password = process.env.SEED_ADMIN_PASSWORD;

	if (!name || !password) {
		throw new Error('Set SEED_ADMIN_NAME and SEED_ADMIN_PASSWORD in .env before seeding.');
	}

	const existing = await db.staffUser.findFirst({ where: { name, role: 'ADMIN' } });
	if (existing) {
		console.log(`Admin "${name}" already exists — nothing to do.`);
		return;
	}

	const passwordHash = await argon2.hash(password);
	await db.staffUser.create({
		data: { name, passwordHash, role: 'ADMIN' }
	});

	console.log(`Created Admin "${name}". Sign in at /console/login with this name and password.`);
	console.log(`Change SEED_ADMIN_PASSWORD before running this against production data.`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
