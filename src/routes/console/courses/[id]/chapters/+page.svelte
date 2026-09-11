<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let renamingId = $state<string | null>(null);
</script>

<svelte:head>
	<title>{data.course.name} — Chapters — Console</title>
</svelte:head>

<a href="/console/courses" class="back-link">← Back to Courses</a>

<div class="header-row">
	<div>
		<h1>{data.course.name} <span class="muted">({data.course.courseCode})</span></h1>
		<p>Chapters for {data.semester.name}. Notes can be filed under one of these for chapter-level analytics.</p>
	</div>
</div>

{#if form?.error}
	<div class="card error-card"><p>{form.error}</p></div>
{/if}

<div class="card">
	<table>
		<thead>
			<tr>
				<th>#</th>
				<th>Title</th>
				<th>Notes</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.chapters as chapter, i (chapter.id)}
				<tr>
					<td class="muted">{i + 1}</td>
					<td>
						{#if renamingId === chapter.id}
							<form
								method="POST"
								action="?/rename"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										renamingId = null;
									};
								}}
								class="inline-form"
							>
								<input type="hidden" name="chapterId" value={chapter.id} />
								<input name="title" type="text" value={chapter.title} required />
								<button type="submit" class="btn btn-sm">Save</button>
								<button type="button" class="btn btn-secondary btn-sm" onclick={() => (renamingId = null)}>
									Cancel
								</button>
							</form>
						{:else}
							<strong>{chapter.title}</strong>
							<button class="link-btn" onclick={() => (renamingId = chapter.id)}>Rename</button>
						{/if}
					</td>
					<td class="muted">{chapter._count.notes}</td>
					<td>
						<div class="row-actions">
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="chapterId" value={chapter.id} />
								<input type="hidden" name="direction" value="up" />
								<button type="submit" class="btn btn-secondary btn-sm" disabled={i === 0}>↑</button>
							</form>
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="chapterId" value={chapter.id} />
								<input type="hidden" name="direction" value="down" />
								<button type="submit" class="btn btn-secondary btn-sm" disabled={i === data.chapters.length - 1}>
									↓
								</button>
							</form>
							<form
								method="POST"
								action="?/deleteChapter"
								use:enhance
								onsubmit={(e) => {
									if (chapter._count.notes > 0) {
										if (
											!confirm(
												`Delete "${chapter.title}"? Its ${chapter._count.notes} note(s) will become chapter-less, not deleted.`
											)
										) {
											e.preventDefault();
										}
									}
								}}
							>
								<input type="hidden" name="chapterId" value={chapter.id} />
								<button type="submit" class="link-btn danger">Delete</button>
							</form>
						</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="4" class="empty">No chapters yet for {data.semester.name} — add one below.</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<form method="POST" action="?/create" use:enhance class="add-form">
		<input name="title" type="text" placeholder="e.g. Chapter 4 — Cell Division" required />
		<button type="submit" class="btn btn-primary btn-sm">Add chapter</button>
	</form>
</div>

<style>
	.back-link {
		display: inline-block;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.header-row {
		margin-bottom: 1.25rem;
	}
	.header-row p {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0.25rem 0 0;
	}
	.error-card {
		background: var(--danger-soft);
		border-color: var(--danger);
		margin-bottom: 1rem;
	}
	.error-card p {
		margin: 0.25rem 0 0;
		color: var(--danger);
	}
	.inline-form {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
	}
	.row-actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.row-actions form {
		display: inline;
	}
	.link-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		text-decoration: underline;
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0;
		margin-left: 0.5rem;
	}
	.link-btn.danger {
		color: var(--danger);
		margin-left: 0;
	}
	.btn-sm {
		font-size: 0.8rem;
		padding: 0.3rem 0.65rem;
	}
	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem;
	}
	.add-form {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border-color, #e5e5e5);
	}
	.add-form input {
		flex: 1;
		max-width: 24rem;
	}
</style>
