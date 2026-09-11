import argon2 from 'argon2';

export async function hashPassword(plain: string): Promise<string> {
	return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, plain);
	} catch {
		// Malformed hash, etc. — treat as a failed login, never throw through
		// to the caller (which would leak whether the account exists).
		return false;
	}
}
