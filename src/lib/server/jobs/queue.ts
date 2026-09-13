import { Queue } from 'bullmq';
import { redis } from './redis';

export const appQueue = new Queue('app-processing', {
  connection: redis
});

export type NoteProcessingJob = {
  type: 'NOTE_PROCESSING';
  noteId: string;
};

export type NoteGenerationJob = {
  type: 'NOTE_GENERATION';
  noteId: string;
  groqKeyLabel?: string;
};

export type AssignmentProcessingJob = {
  type: 'ASSIGNMENT_PROCESSING';
  assignmentId: string;
};

export type AppJob =
  | NoteProcessingJob
  | NoteGenerationJob
  | AssignmentProcessingJob;

export async function enqueueNoteProcessing(
  noteId: string
) {
  return appQueue.add(
    'NOTE_PROCESSING',
    {
      type: 'NOTE_PROCESSING',
      noteId
    } satisfies NoteProcessingJob,
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );
}

export async function enqueueNoteGeneration(
  noteId: string,
  groqKeyLabel?: string
) {
  return appQueue.add(
    'NOTE_GENERATION',
    {
      type: 'NOTE_GENERATION',
      noteId,
      groqKeyLabel
    } satisfies NoteGenerationJob,
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );
}

export async function enqueueAssignmentProcessing(
  assignmentId: string
) {
  return appQueue.add(
    'ASSIGNMENT_PROCESSING',
    {
      type: 'ASSIGNMENT_PROCESSING',
      assignmentId
    } satisfies AssignmentProcessingJob,
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );
}