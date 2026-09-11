<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const { note, submitted, notYetSubmitted } = data;
</script>

<svelte:head>
	<title>Results — {note.title ?? 'Note'} — Console</title>
</svelte:head>

<a href="/console/notes/{note.id}" class="back-link">← Back to {note.title ?? 'this note'}</a>

<div class="header-row">
	<div>
		<h1>Pre-test results: {note.title ?? 'Untitled note'}</h1>
		<p class="meta">
			{#if note.chapterLabel}<strong>{note.chapterLabel}</strong> · {/if}{note.totalQuestions} questions
		</p>
	</div>
	<div class="status">
		{#if note.testRevealedAt}
			<span class="badge badge-success">Revealed to students</span>
		{:else if note.testStartedAt}
			<span class="badge badge-neutral">Started · not yet revealed</span>
		{:else}
			<span class="badge badge-neutral">Not started</span>
		{/if}
	</div>
</div>

<p class="hint">
	This view is never gated by reveal state — you see every score the moment it's submitted, so you
	can decide when there's enough in to reveal (or override) with confidence.
</p>

<div class="card">
	<h2>Submitted ({submitted.length})</h2>
	{#if submitted.length === 0}
		<p class="muted">No submissions yet.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Student</th>
					<th>Score</th>
					<th>Submitted</th>
				</tr>
			</thead>
			<tbody>
				{#each submitted as s (s.studentId)}
					<tr>
						<td>{s.studentName} ({s.studentCode})</td>
						<td>{s.score}/{note.totalQuestions}</td>
						<td class="muted">{new Date(s.submittedAt).toLocaleString()}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<div class="card">
	<h2>Not yet submitted ({notYetSubmitted.length})</h2>
	{#if notYetSubmitted.length === 0}
		<p class="muted">Everyone who was sent this chapter has submitted.</p>
	{:else}
		<ul class="plain-list">
			{#each notYetSubmitted as s (s.studentId)}
				<li>{s.studentName} ({s.studentCode})</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.back-link {
		display: inline-block;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.header-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
		gap: 1rem;
	}
	.meta {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.hint {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 0 0 1.5rem;
		max-width: 60ch;
	}
	.card {
		margin-bottom: 1.5rem;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.875rem;
	}
	.plain-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.875rem;
	}
</style>
