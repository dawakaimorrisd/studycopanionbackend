<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const { overview, colleges } = data;
</script>

<svelte:head>
	<title>Progress — Console</title>
</svelte:head>

<h1>Progress overview</h1>
<p class="meta">
	Across every College and Course. Drill into a College below for its courses, or a course for
	full per-student detail.
</p>

<div class="stat-grid">
	<div class="stat-card">
		<span class="stat-value">{overview.totalStudentCoursePairs}</span>
		<span class="stat-label">Student × course pairs</span>
	</div>
	<div class="stat-card">
		<span class="stat-value">{overview.engaged}</span>
		<span class="stat-label">Engaged</span>
	</div>
	<div class="stat-card">
		<span class="stat-value">{overview.moderate}</span>
		<span class="stat-label">Moderate</span>
	</div>
	<div class="stat-card stat-card-warn">
		<span class="stat-value">{overview.atRisk}</span>
		<span class="stat-label">At-risk</span>
	</div>
	<div class="stat-card">
		<span class="stat-value">{overview.totalTestAttempts}</span>
		<span class="stat-label">Chapter test attempts</span>
	</div>
	<div class="stat-card">
		<span class="stat-value">
			{overview.averageTestScorePercent !== null ? `${overview.averageTestScorePercent}%` : '—'}
		</span>
		<span class="stat-label">Average test score</span>
	</div>
</div>

<h2>By college</h2>
{#if colleges.length === 0}
	<p class="empty">No colleges yet.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>College</th>
				<th>Students</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each colleges as college (college.id)}
				<tr>
					<td><strong>{college.name}</strong></td>
					<td class="muted">{college._count.students}</td>
					<td><a href="/console/progress/college/{college.id}" class="btn btn-secondary btn-sm">View courses</a></td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.meta {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0 0 1.5rem;
		max-width: 60ch;
	}
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 2rem;
	}
	.stat-card {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.stat-card-warn {
		border-color: var(--danger, #dc2626);
	}
	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
	}
	.stat-label {
		font-size: 0.8125rem;
		color: var(--text-muted);
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
	.btn-sm {
		padding: 0.3125rem 0.625rem;
		font-size: 0.8125rem;
	}
</style>
