<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const assignment = $derived(data.assignment);

	const allDictionaryEntries = $derived.by(() => {
		const byTerm = new Map<string, { term: string; definition: string; example: string | null }>();
		for (const qu of assignment.questionUnits) {
			for (const d of qu.dictionaryEntries) {
				if (!byTerm.has(d.term)) byTerm.set(d.term, d);
			}
		}
		return Array.from(byTerm.values());
	});
</script>

<svelte:head>
	<title>{assignment.title ?? 'Assignment'} — Console</title>
</svelte:head>

<a href="/console/assignments" class="back-link">← Back to Assignments</a>

<div class="header-row">
	<div>
		<h1>{assignment.title ?? 'Untitled assignment'}</h1>
		<p class="meta">
			{assignment.course.name} ({assignment.course.courseCode}) · submitted by {assignment.submittedBy
				.name} ({assignment.submittedBy.studentCode})
			{#if assignment.type === 'GROUP'}
				· group "{assignment.groupName}"
			{/if}
		</p>
	</div>
	<span class="badge {assignment.type === 'GROUP' ? 'badge-info' : 'badge-neutral'}">
		{assignment.type === 'GROUP' ? 'Group' : 'Individual'}
	</span>
</div>

<div class="card">
	<h2>File</h2>
	{#if assignment.pdfUrl}
		<a href={assignment.pdfUrl} target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
			Open PDF
		</a>
	{:else if assignment.pdfConversionError}
		<p class="muted">PDF unavailable: {assignment.pdfConversionError}</p>
	{:else}
		<p class="muted">No PDF available.</p>
	{/if}
</div>

{#if assignment.type === 'GROUP'}
	<div class="card">
		<h2>Members ({assignment.members.length})</h2>
		{#if assignment.members.length > 0}
			<ul class="member-list">
				{#each assignment.members as m (m.id)}
					<li>{m.student.name} ({m.student.studentCode})</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">No members tagged.</p>
		{/if}
	</div>

	<div class="card">
		<h2>Generated study material</h2>
		<p class="muted">
			Generation and sharing are student-controlled — only the submitter can trigger it, from
			their own device. This view is read-only.
		</p>
		{#if assignment.generationError}
			<span class="badge badge-danger">Generation failed: {assignment.generationError}</span>
		{:else if assignment.generatedAt}
			<span class="badge badge-success">Generated · {assignment.questionUnits.length} question units</span>

			<div class="questions">
				{#each assignment.questionUnits as qu, i (qu.id)}
					<div class="question-card">
						<p class="question-text"><strong>Q{i + 1}.</strong> {qu.question}</p>
						<ul class="options">
							{#each [['A', qu.optionA], ['B', qu.optionB], ['C', qu.optionC], ['D', qu.optionD]] as [letter, text] (letter)}
								<li class={letter === qu.correctOption ? 'correct' : ''}>
									<strong>{letter}.</strong> {text}
									{#if letter === qu.correctOption}<span class="badge badge-success badge-xs">Correct</span>{/if}
								</li>
							{/each}
						</ul>
						{#if qu.explanation}
							<p class="explanation">{qu.explanation}</p>
						{/if}
					</div>
				{/each}
			</div>

			{#if allDictionaryEntries.length > 0}
				<h3>Dictionary</h3>
				<ul class="dictionary">
					{#each allDictionaryEntries as d (d.term)}
						<li><strong>{d.term}:</strong> {d.definition}{#if d.example} <em>e.g. {d.example}</em>{/if}</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<span class="badge badge-neutral">Not generated yet</span>
		{/if}
	</div>
{/if}

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
		margin-bottom: 1.25rem;
		gap: 1rem;
	}
	.meta {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0.25rem 0 0;
	}
	.card {
		margin-bottom: 1.5rem;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.member-list {
		margin: 0;
		padding-left: 1.25rem;
	}
	.questions {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.question-card {
		border: 1px solid var(--border-color, #e5e5e5);
		border-radius: 8px;
		padding: 0.875rem;
	}
	.question-text {
		margin: 0 0 0.5rem;
	}
	.options {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.9rem;
	}
	.options li.correct {
		color: #166534;
	}
	.explanation {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.dictionary {
		margin: 0.5rem 0 0;
		padding-left: 1.25rem;
		font-size: 0.9rem;
	}
	.btn-sm {
		font-size: 0.8125rem;
		padding: 0.3125rem 0.625rem;
	}
</style>
