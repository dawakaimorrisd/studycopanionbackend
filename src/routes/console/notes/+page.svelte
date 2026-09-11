<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Notes — Console</title>
</svelte:head>

<div class="header-row">
	<div>
		<h1>Notes</h1>
		<p>Pasted or uploaded content, generated into Q&A + dictionary, then sent to students.</p>
	</div>
	<a href="/console/notes/new" class="btn btn-primary">+ New note</a>
</div>

<div class="card">
	<table>
		<thead>
			<tr>
				<th>Title</th>
				<th>Course</th>
				<th>Uploaded by</th>
				<th>Status</th>
				<th>Published</th>
			</tr>
		</thead>
		<tbody>
			{#each data.notes as note (note.id)}
				<tr>
					<td>
						<a href="/console/notes/{note.id}"><strong>{note.title ?? 'Untitled note'}</strong></a>
					</td>
					<td class="muted">{note.course.courseCode}</td>
					<td class="muted">{note.uploadedBy?.name ?? '—'} ({note.uploadedBy?.role ?? '—'})</td>
					<td>
						{#if note.generationError}
							<span class="badge badge-danger">Generation failed</span>
						{:else if note.generatedAt}
							<span class="badge badge-success">Generated · {note._count.questionUnits} units</span>
						{:else}
							<span class="badge badge-neutral">Not generated</span>
						{/if}
					</td>
					<td class="muted">
						{#if note.publishedAt}
							<span class="badge badge-success badge-xs">Published</span>
						{:else}
							<span class="badge badge-neutral badge-xs">Draft</span>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="5" class="empty">No notes yet — upload the first one.</td>
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
