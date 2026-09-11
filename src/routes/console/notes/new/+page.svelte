<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let mode = $state<'paste' | 'upload'>('paste');
	let submitting = $state(false);
</script>

<svelte:head>
	<title>New note — Console</title>
</svelte:head>

<h1>New note</h1>
<p class="subtitle">Paste text directly, or upload a PDF/DOCX — either way it becomes the note's content.</p>

<div class="card form-card">
	<form
		method="POST"
		enctype="multipart/form-data"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				await update();
				if (result.type !== 'redirect') submitting = false;
			};
		}}
	>
		<div class="field">
			<label for="courseId">Course</label>
			<select id="courseId" name="courseId" required>
				<option value="" disabled selected>Choose a course</option>
				{#each data.courses as course (course.id)}
					<option value={course.id}>{course.name} ({course.courseCode})</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label for="title">Title (optional)</label>
			<input id="title" name="title" type="text" placeholder="e.g. Week 3 — Cell Structure" />
		</div>

		<div class="field">
			<label for="chapterLabel">Chapter / section label (optional)</label>
			<input id="chapterLabel" name="chapterLabel" type="text" placeholder="e.g. Chapter 3" />
			<p class="hint">
				One Note = one chapter's worth of content for testing purposes. Leave blank if this note
				isn't going to be tested per-chapter.
			</p>
		</div>

		<div class="field">
			<label for="chapterId">Course chapter (optional)</label>
			<select id="chapterId" name="chapterId">
				<option value="">No chapter</option>
				{#each data.chapters as chapter (chapter.id)}
					<option value={chapter.id}>{chapter.title}</option>
				{/each}
			</select>
			<p class="hint">
				For chapter-level analytics ({data.semester.name}). Separate from the free-text label
				above — that's for display, this is what powers "most/least studied chapter" reporting.
			</p>
		</div>

		<div class="field">
			<span>Content</span>
			<div class="mode-toggle">
				<button type="button" class:active={mode === 'paste'} onclick={() => (mode = 'paste')}>
					Paste text
				</button>
				<button type="button" class:active={mode === 'upload'} onclick={() => (mode = 'upload')}>
					Upload file
				</button>
			</div>

			{#if mode === 'paste'}
				<textarea name="pastedText" rows="12" placeholder="Paste the note content here…"></textarea>
			{:else}
				<input name="file" type="file" accept=".pdf,.docx" />
				<p class="hint">PDF or DOCX. Text is extracted automatically once uploaded.</p>
			{/if}
		</div>

		{#if form?.error}
			<p class="error-text">{form.error}</p>
		{/if}

		<button type="submit" class="btn btn-primary" disabled={submitting}>
			{submitting ? 'Uploading…' : 'Create note'}
		</button>
	</form>
</div>

<style>
	.subtitle {
		color: var(--text-muted);
		font-size: 0.875rem;
		max-width: 520px;
	}
	.form-card {
		max-width: 560px;
	}
	.mode-toggle {
		display: flex;
		gap: 0.5rem;
		margin: 0.375rem 0 0.625rem;
	}
	.mode-toggle button {
		padding: 0.375rem 0.75rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface-card);
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
	}
	.mode-toggle button.active {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.hint {
		color: var(--text-muted);
		font-size: 0.8125rem;
		margin-top: 0.375rem;
	}
	textarea {
		width: 100%;
		padding: 0.625rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-family: inherit;
		resize: vertical;
	}
</style>
