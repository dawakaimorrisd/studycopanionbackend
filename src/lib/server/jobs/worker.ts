import { Worker } from 'bullmq';
import { redis } from './redis';
import { workerConfig } from './workerEnv';
import { runGeneration } from '$lib/server/generation/generate';
import { processNote } from './noteProcessor';
import { processAssignment } from './assignmentProcessor';
import type { AppJob } from './queue';

export const appWorker = new Worker<AppJob>(
	'app-processing',
	async (job) => {
		console.log(
			`[worker] Processing job ${job.id}: ${job.name}`
		);

		switch (job.data.type) {
			case 'NOTE_PROCESSING':
				await processNote(job.data.noteId);
				break;

			case 'NOTE_GENERATION':
				await runGeneration('NOTE', job.data.noteId, {
					forceGroqKeyLabel: job.data.groqKeyLabel,
					configOverride: workerConfig
				});
				break;

			case 'ASSIGNMENT_PROCESSING':
				await processAssignment(
					job.data.assignmentId
				);
				break;

			default:
				throw new Error('Unknown job type.');
		}
	},
	{
		connection: redis,
		concurrency: 2
	}
);

appWorker.on('completed', (job) => {
	console.log(
		`[worker] Job completed: ${job.id}`
	);
});

appWorker.on('failed', (job, err) => {
	console.error(
		`[worker] Job failed: ${job?.id}`,
		err
	);
});

appWorker.on('error', (err) => {
	console.error(
		'[worker] Worker error:',
		err
	);
});

console.log(
	'[worker] App processing worker is running...'
);