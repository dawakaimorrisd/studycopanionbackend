import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';

export interface StoredFile {
	buffer: Buffer;
	name: string;
	mimeType: string;
}

export interface FileStorage {
	save(file: StoredFile): Promise<{ url: string }>;
	read(url: string): Promise<Buffer>;
}

/**
 * Local filesystem storage.
 *
 * Used for development so Cloudinary credentials are not required.
 * Files are stored under static/uploads/studycompanion and served
 * by SvelteKit as /uploads/studycompanion/...
 *
 * CRITICAL LIMITATION, confirmed as the likely real cause of the
 * instructor-facing 404 that prompted the PDF-reading redesign
 * (see pdfConversion.ts, contentUpload.ts, submissionUpload.ts): this
 * writes to the LOCAL DISK OF WHATEVER PROCESS HANDLED THE UPLOAD. On a
 * typical serverless/edge deploy target (this project's `netlify.toml`
 * suggests Netlify Functions), each request can be served by a different,
 * short-lived function instance with its own ephemeral filesystem — a
 * file saved during one invocation is NOT guaranteed to still exist, or
 * be visible, to a later invocation that serves a subsequent GET for it,
 * even seconds later. The reported 404
 * (`GET /uploads/studycompanion/<uuid>.docx`) matches this storage
 * adapter's exact URL scheme, which strongly suggests this — not a
 * missing route, not a Cloudinary misconfiguration — is what actually
 * happened: the file was written to a container that no longer existed,
 * or was never the one handling the read.
 *
 * This adapter is fine for local development (`npm run dev` — one
 * long-lived process, one real filesystem) and should be treated as
 * UNSAFE for any real multi-instance/serverless deployment. Set
 * `STORAGE_PROVIDER=cloudinary` (see CloudinaryStorage below) for any
 * environment where uploads need to survive being written by one instance
 * and read by another — which, on most serverless hosts, is every
 * request. This is a deployment/configuration decision, not a code fix —
 * flagged here plainly rather than silently patched around, since
 * switching providers has real cost/setup implications only the project
 * owner can decide on.
 */
class LocalFileStorage implements FileStorage {
	private readonly uploadDir = join(process.cwd(), 'static', 'uploads', 'studycompanion');

	async save(file: StoredFile): Promise<{ url: string }> {
		const extension = this.getExtension(file.name);
		const filename = `${randomUUID()}${extension}`;
		const filePath = join(this.uploadDir, filename);

		await mkdir(this.uploadDir, { recursive: true });
		await writeFile(filePath, file.buffer);

		return {
			url: `/uploads/studycompanion/${filename}`
		};
	}

	async read(url: string): Promise<Buffer> {
		const prefix = '/uploads/studycompanion/';

		if (!url.startsWith(prefix)) {
			throw new Error(`Invalid local storage URL: ${url}`);
		}

		const filename = url.slice(prefix.length);

		if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
			throw new Error('Invalid local storage filename.');
		}

		const filePath = join(this.uploadDir, filename);

		return readFile(filePath);
	}

	private getExtension(name: string): string {
		const lastDot = name.lastIndexOf('.');
		return lastDot >= 0 ? name.slice(lastDot).toLowerCase() : '';
	}
}

/**
 * Cloudinary storage.
 *
 * Only instantiated when STORAGE_PROVIDER=cloudinary.
 * This means development does not require Cloudinary credentials.
 *
 * This is the provider every uploaded file — Note/Assignment source
 * files, generated PDFs (pdfConversion.ts), and AssignmentSubmission
 * uploads — should use for any deployment where more than one server
 * instance might handle requests. See LocalFileStorage's comment above
 * for why.
 */
class CloudinaryStorage implements FileStorage {
	private readonly cloudinary;

	constructor() {
		const { v2: cloudinary } = require('cloudinary') as typeof import('cloudinary');

		const cloudName = env.CLOUDINARY_CLOUD_NAME;
		const apiKey = env.CLOUDINARY_API_KEY;
		const apiSecret = env.CLOUDINARY_API_SECRET;

		if (!cloudName || !apiKey || !apiSecret) {
			throw new Error(
				'Cloudinary storage is enabled, but CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET is missing.'
			);
		}

		cloudinary.config({
			cloud_name: cloudName,
			api_key: apiKey,
			api_secret: apiSecret
		});

		this.cloudinary = cloudinary;
	}

	async save(file: StoredFile): Promise<{ url: string }> {
		const publicId = `studycompanion/${randomUUID()}`;

		const result = await new Promise<{
			secure_url: string;
		}>((resolve, reject) => {
			const upload = this.cloudinary.uploader.upload_stream(
				{
					public_id: publicId,
					resource_type: 'raw',
					use_filename: false,
					overwrite: false
				},
				(error, result) => {
					if (error) {
						reject(error);
					} else if (!result) {
						reject(new Error('Cloudinary upload returned no result.'));
					} else {
						resolve(result);
					}
				}
			);

			upload.end(file.buffer);
		});

		return { url: result.secure_url };
	}

	async read(url: string): Promise<Buffer> {
		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`Unable to retrieve stored file: ${response.status}`);
		}

		return Buffer.from(await response.arrayBuffer());
	}
}

function createStorage(): FileStorage {
	const provider = env.STORAGE_PROVIDER?.toLowerCase();

	if (provider === 'cloudinary') {
		return new CloudinaryStorage();
	}

	// Local is the safe development default.
	return new LocalFileStorage();
}

export const storage: FileStorage = createStorage();
