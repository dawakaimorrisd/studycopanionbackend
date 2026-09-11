<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const note = $derived(data.note);
	const chapters = $derived(data.chapters);
	const eligibleStudents = $derived(data.eligibleStudents);
	let generating = $state(false);
	let editingText = $state(false);

	// Note-wide glossary — every dictionaryEntry across all question units,
	// deduplicated by term (first definition wins if a term somehow appears
	// twice, which shouldn't normally happen but isn't worth erroring over).
	const allDictionaryEntries = $derived.by(() => {
		const byTerm = new Map<string, { term: string; definition: string; example: string | null }>();
		for (const qu of note.questionUnits) {
			for (const d of qu.dictionaryEntries) {
				if (!byTerm.has(d.term)) byTerm.set(d.term, d);
			}
		}
		return Array.from(byTerm.values()).sort((a, b) => a.term.localeCompare(b.term));
	});
</script>

<svelte:head>
	<title>{note.title ?? 'Note'} — Console</title>
</svelte:head>

<div class="header-row">
	<div>
		<h1>{note.title ?? 'Untitled note'}</h1>
		<p class="meta">
			{note.course.name} ({note.course.courseCode})
			{#if note.chapterLabel}
				· <strong>{note.chapterLabel}</strong>
			{/if}
			· uploaded by {note.uploadedBy?.name ?? '—'}
			{#if note.sourceFileName}
				· from <a href="/console/files/{note.sourceFileUrl?.replace('local:', '')}" target="_blank"
					><code>{note.sourceFileName}</code></a
				>
			{/if}
		</p>
	</div>
	<div class="status">
		{#if note.generationError}
			<span class="badge badge-danger">Generation failed</span>
		{:else if note.generatedAt}
			<span class="badge badge-success">Generated</span>
		{:else}
			<span class="badge badge-neutral">Not generated</span>
		{/if}
		{#if note.testRevealedAt}
			<span class="badge badge-success" title="Instructor released results">Test revealed</span>
		{:else if note.testStartedAt}
			<span class="badge badge-neutral" title="Instructor started the test; not yet revealed">
				Test in progress
			</span>
		{/if}
		<form
			method="POST"
			action="?/generate"
			use:enhance={() => {
				generating = true;
				return async ({ update }) => {
					await update();
					generating = false;
				};
			}}
			class="generate-form"
		>
			{#if data.groqKeyOptions.length > 1}
				<select name="groqKey" title="Leave blank to use the default: this note's first configured Groq key">
					<option value="">Auto (default Groq key)</option>
					{#each data.groqKeyOptions as label (label)}
						<option value={label}>Force: {label}</option>
					{/each}
				</select>
			{/if}
			<button type="submit" class="btn btn-primary" disabled={generating}>
				{generating ? 'Generating…' : note.generatedAt ? 'Regenerate' : 'Generate'}
			</button>
		</form>
	</div>
</div>

{#if note.testAttempts.length > 0}
	<p class="muted test-summary">
		{note.testAttempts.length} student{note.testAttempts.length === 1 ? '' : 's'} have submitted this
		chapter's test.
		{#if !note.testRevealedAt}
			Results aren't visible to students yet — that happens once the test is marked done, below or
			by the Instructor.
		{/if}
	</p>
{/if}

{#if note.generatedAt}
	<div class="card test-controls">
		<h2>Pre-test controls</h2>
		<p class="muted">
			An Instructor can do the first two from their own app for their own courses. These do the
			same thing from here — useful when an Instructor doesn't have time to run the cycle
			themselves, since without it students can't access this chapter's pre-test at all.
		</p>
		<div class="test-controls-row">
			<form
				method="POST"
				action="?/startTest"
				use:enhance
				title={note.testStartedAt ? 'Already started' : 'Let students take this chapter\'s pre-test'}
			>
				<button type="submit" class="btn btn-secondary" disabled={Boolean(note.testStartedAt)}>
					Start pre-test
				</button>
			</form>
			<form
				method="POST"
				action="?/endTest"
				use:enhance
				title={note.testRevealedAt
					? 'Already revealed'
					: !note.testStartedAt
						? 'Start the pre-test first'
						: 'Reveal answers + scores to everyone who took it'}
			>
				<button
					type="submit"
					class="btn btn-secondary"
					disabled={!note.testStartedAt || Boolean(note.testRevealedAt)}
				>
					End pre-test & reveal
				</button>
			</form>
			<a href="/console/notes/{note.id}/results" class="btn btn-secondary">View results</a>
		</div>

		<div class="override-row">
			<form
				method="POST"
				action="?/overrideReveal"
				use:enhance
				title="Skip the pre-test entirely — show every sent student the questions and answers directly, as study material"
			>
				<button type="submit" class="btn btn-outline">
					{note.testRevealedAt && note.testStartedAt
						? 'Re-apply override (already showing)'
						: 'Override: show test & answers directly'}
				</button>
			</form>
			<p class="hint">
				For chapters where no Instructor is going to run a pre-test. Skips straight to what
				"start" + "end" would produce together — students see the full Q&A immediately, no
				submission required from them.
			</p>
		</div>
	</div>
{/if}

{#if note.generationError}
	<div class="card error-card">
		<strong>Last generation attempt failed:</strong>
		<p>{note.generationError}</p>
	</div>
{/if}

<div class="grid">
	<div class="card">
		<div class="card-header-row">
			<h2>Content</h2>
			{#if !editingText}
				<button type="button" class="link-btn" onclick={() => (editingText = true)}>Edit</button>
			{/if}
		</div>
		{#if editingText}
			<form
				method="POST"
				action="?/editText"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						editingText = false;
					};
				}}
				class="edit-text-form"
			>
				<textarea name="rawText" rows="16">{note.rawText}</textarea>
				<p class="hint">
					Exactly what's saved here is exactly what every reader sees — API, Frontend, console.
					There's no font or formatting applied on top of this anywhere; if a source document came
					in messy, this is where to clean it up by hand.
				</p>
				<div class="edit-text-actions">
					<button type="submit" class="btn btn-primary btn-sm">Save</button>
					<button type="button" class="btn btn-secondary btn-sm" onclick={() => (editingText = false)}>
						Cancel
					</button>
				</div>
			</form>
		{:else}
			<pre class="raw-text">{note.rawText}</pre>
		{/if}
	</div>

	<div class="card">
		<h2>Question units {note.questionUnits.length > 0 ? `(${note.questionUnits.length})` : ''}</h2>
		{#if note.questionUnits.length === 0}
			<p class="muted">Nothing generated yet — click Generate above.</p>
		{:else}
			{#each note.questionUnits as qu (qu.id)}
				<div class="qu">
					<p class="q"><strong>Q:</strong> {qu.question}</p>
					<ul class="options">
						{#each [['A', qu.optionA], ['B', qu.optionB], ['C', qu.optionC], ['D', qu.optionD]] as [letter, text] (letter)}
							<li class:correct={letter === qu.correctOption}>
								<strong>{letter}.</strong>
								{text}
								{#if letter === qu.correctOption}<span class="badge badge-success badge-xs">Correct</span
									>{/if}
							</li>
						{/each}
					</ul>
					{#if qu.explanation}
						<p class="explain"><strong>Explanation:</strong> {qu.explanation}</p>
					{/if}
					{#if qu.dictionaryEntries.length > 0}
						<div class="dict">
							{#each qu.dictionaryEntries as d (d.id)}
								<span class="term-def">
									<strong>{d.term}</strong> — {d.definition}
									{#if d.example}<em> e.g. {d.example}</em>{/if}
								</span>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	{#if allDictionaryEntries.length > 0}
		<div class="card full-width">
			<h2>Dictionary ({allDictionaryEntries.length})</h2>
			<p class="muted small">Every term across this note's question units, in one glossary.</p>
			<dl class="glossary">
				{#each allDictionaryEntries as d (d.term)}
					<dt>{d.term}</dt>
					<dd>
						{d.definition}
						{#if d.example}<br /><em>e.g. {d.example}</em>{/if}
					</dd>
				{/each}
			</dl>
		</div>
	{/if}

	<div class="card">
		<div class="card-header-row">
			<h2>Chapter</h2>
		</div>
		<form method="POST" action="?/setChapter" use:enhance class="inline-form">
			<select name="chapterId">
				<option value="">No chapter</option>
				{#each chapters as chapter (chapter.id)}
					<option value={chapter.id} selected={chapter.id === note.chapter?.id}>{chapter.title}</option>
				{/each}
			</select>
			<button type="submit" class="btn btn-secondary btn-sm">Save</button>
		</form>
	</div>

	<div class="card">
		<div class="card-header-row">
			<h2>Publish</h2>
			{#if note.publishedAt}
				<span class="badge badge-success badge-xs">Published</span>
			{:else}
				<span class="badge badge-neutral badge-xs">Draft</span>
			{/if}
		</div>

		<p class="muted">
			{#if note.publishedAt}
				Visible to every paid + enrolled student in {note.course.name} for the current semester —
				published by {note.publishedBy?.name ?? '—'} on {new Date(note.publishedAt).toLocaleString()}.
				No recipient list to manage; enrollment and payment (console → Students) control who sees it.
			{:else}
				Not yet visible to any student, regardless of their enrollment or payment status. Generate the
				note first, then save it for students.
			{/if}
		</p>

		{#if note.publishedAt}
			<form method="POST" action="?/unpublish" use:enhance>
				<button type="submit" class="btn btn-secondary btn-sm">Unpublish</button>
			</form>
		{:else}
			<form method="POST" action="?/publish" use:enhance>
				<button type="submit" class="btn btn-primary btn-sm" disabled={!note.generatedAt}>
					Save for students
				</button>
			</form>
		{/if}
	</div>

	<div class="card">
		<h2>Eligible students ({eligibleStudents.length})</h2>
		<p class="muted">
			Every student currently paid + enrolled in {note.course.name} for this semester — automatic,
			not a sent list. Managed from each student's page under Students, or in bulk from the course
			roster.
		</p>

		{#if eligibleStudents.length > 0}
			<ul class="sent-list">
				{#each eligibleStudents.slice(0, 5) as student (student.id)}
					{@const attempt = note.testAttempts.find((a) => a.studentId === student.id)}
					<li>
						<span>{student.name} ({student.studentCode})</span>
						{#if attempt}
							{#if note.testRevealedAt}
								<span class="badge badge-success badge-xs"
									>Test: {attempt.score}/{note.questionUnits.length}</span
								>
							{:else}
								<span class="badge badge-neutral badge-xs">Test: submitted</span>
							{/if}
						{:else if note.testStartedAt}
							<span class="badge badge-neutral badge-xs">Test: not submitted</span>
						{/if}
					</li>
				{/each}
			</ul>
			{#if eligibleStudents.length > 5}
				<p class="muted">+{eligibleStudents.length - 5} more.</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	.header-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.25rem;
		gap: 1rem;
	}
	.card-header-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}
	.test-controls {
		border-color: var(--accent, #6366f1);
	}
	.test-controls h2 {
		margin-top: 0;
	}
	.test-controls-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem;
		margin: 0.75rem 0 1.25rem;
	}
	.override-row {
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.hint {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 0.5rem 0 0;
	}
	.btn-outline {
		background: transparent;
		border: 1px solid var(--danger, #dc2626);
		color: var(--danger, #dc2626);
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
	}
	.btn-outline:hover {
		background: var(--danger-soft, #fef2f2);
	}
	.status {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.generate-form {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.meta {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0;
	}
	.error-card {
		background: var(--danger-soft);
		border-color: var(--danger);
		margin-bottom: 1.25rem;
	}
	.error-card p {
		margin: 0.25rem 0 0;
		color: var(--danger);
		font-size: 0.875rem;
	}
	.grid {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 1.25rem;
	}
	.grid .card:last-child,
	.grid .card.full-width {
		grid-column: 1 / -1;
	}
	.raw-text {
		white-space: pre-wrap;
		font-family: inherit;
		font-size: 0.875rem;
		line-height: 1.6;
		max-height: 480px;
		overflow-y: auto;
		margin: 0;
	}
	.edit-text-form {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}
	.edit-text-form textarea {
		width: 100%;
		font-family: inherit;
		font-size: 0.875rem;
		line-height: 1.6;
		padding: 0.625rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		resize: vertical;
	}
	.edit-text-actions {
		display: flex;
		gap: 0.5rem;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.qu {
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--border);
	}
	.qu:last-child {
		border-bottom: none;
	}
	.qu p {
		margin: 0 0 0.25rem;
		font-size: 0.875rem;
	}
	.qu .explain {
		color: var(--text-muted);
	}
	.options {
		list-style: none;
		margin: 0.375rem 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1875rem;
	}
	.options li {
		font-size: 0.875rem;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.options li.correct {
		color: var(--accent);
		font-weight: 600;
	}
	.test-summary {
		margin: -0.5rem 0 1.25rem;
	}
	.dict {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px dashed var(--border);
	}
	.term-def {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.small {
		font-size: 0.8125rem;
	}
	.glossary {
		margin: 0;
	}
	.glossary dt {
		font-weight: 600;
		font-size: 0.875rem;
		margin-top: 0.625rem;
	}
	.glossary dt:first-child {
		margin-top: 0;
	}
	.glossary dd {
		margin: 0.125rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.sent-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.875rem;
	}
	.sent-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.sent-list li span:first-child {
		flex: 1;
	}
	.link-btn {
		background: none;
		border: none;
		color: var(--accent);
		cursor: pointer;
		font-size: 0.8125rem;
		text-decoration: underline;
		padding: 0;
		white-space: nowrap;
	}
	.btn-sm {
		padding: 0.3125rem 0.625rem;
		font-size: 0.8125rem;
	}
	.badge-xs {
		font-size: 0.6875rem;
		padding: 0.0625rem 0.375rem;
		margin-left: 0.375rem;
	}
</style>