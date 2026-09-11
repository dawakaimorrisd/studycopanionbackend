<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const { college, courseSummaries } = data;
</script>

<svelte:head>
	<title>{college.name} — Progress — Console</title>
</svelte:head>

<a href="/console/progress" class="back-link">← Back to Progress overview</a>

<h1>{college.name}</h1>
<p class="meta">
	Courses linked to this College. A course linked to more than one College appears in each —
	that's intentional, not a bug.
</p>

{#if courseSummaries.length === 0}
	<p class="empty">No courses linked to this College yet.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Course</th>
				<th>Engaged</th>
				<th>Moderate</th>
				<th>At-risk</th>
				<th>Test attempts</th>
				<th>Avg score</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each courseSummaries as s (s.course.id)}
				<tr>
					<td><strong>{s.course.name}</strong> <span class="muted">({s.course.courseCode})</span></td>
					<td>{s.engagement.engaged}</td>
					<td>{s.engagement.moderate}</td>
					<td class:warn={s.engagement.atRisk > 0}>{s.engagement.atRisk}</td>
					<td>{s.testSummary.attemptsCount}</td>
					<td>
						{s.testSummary.averageScorePercent !== null ? `${s.testSummary.averageScorePercent}%` : '—'}
					</td>
					<td><a href="/console/progress/{s.course.id}" class="btn btn-secondary btn-sm">Full detail</a></td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.back-link {
		display: inline-block;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.meta {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0 0 1.5rem;
		max-width: 65ch;
	}
	.empty {
		color: var(--text-muted);
		font-style: italic;
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
	.muted {
		color: var(--text-muted);
	}
	.warn {
		color: var(--danger, #dc2626);
		font-weight: 600;
	}
	.btn-sm {
		padding: 0.3125rem 0.625rem;
		font-size: 0.8125rem;
	}
</style>
