<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Assignments — Console</title>
</svelte:head>

<div class="header-row">
	<div>
		<h1>Assignments</h1>
		<p>
			Read-only. An assignment is homework a student submits — there is no console upload here
			anymore; the prompt is given in class, and a student's own upload creates this record.
		</p>
	</div>
</div>

<div class="card">
	<table>
		<thead>
			<tr>
				<th>Title</th>
				<th>Course</th>
				<th>Submitted by</th>
				<th>Type</th>
				<th>Status</th>
			</tr>
		</thead>
		<tbody>
			{#each data.assignments as a (a.id)}
				<tr>
					<td>
						<a href="/console/assignments/{a.id}"><strong>{a.title ?? 'Untitled assignment'}</strong></a>
					</td>
					<td class="muted">{a.course.courseCode}</td>
					<td class="muted">
						{a.submittedBy.name} ({a.submittedBy.studentCode})
						{#if a.type === 'GROUP'}
							<span class="muted"> · {a.groupName} · {a._count.members} member{a._count.members === 1 ? '' : 's'}</span>
						{/if}
					</td>
					<td class="muted">{a.type === 'GROUP' ? 'Group' : 'Individual'}</td>
					<td>
						{#if a.generationError}
							<span class="badge badge-danger">Generation failed</span>
						{:else if a.generatedAt}
							<span class="badge badge-success">Generated · {a._count.questionUnits} units</span>
						{:else if a.type === 'GROUP'}
							<span class="badge badge-neutral">Not generated</span>
						{:else}
							<span class="badge badge-neutral">N/A — individual</span>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="5" class="empty">No assignments submitted yet.</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.header-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.25rem;
		gap: 1rem;
	}
	.header-row p {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0;
		max-width: 480px;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}
	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem;
	}
</style>
