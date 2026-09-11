<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showForm = $state(false);
</script>

<svelte:head>
	<title>Colleges — Console</title>
</svelte:head>

<div class="header-row">
	<div>
		<h1>Colleges</h1>
		<p>The top-level entity courses can be linked to. Only Admin/Moderator create these.</p>
	</div>
	<button class="btn btn-primary" onclick={() => (showForm = !showForm)}>
		{showForm ? 'Cancel' : '+ New college'}
	</button>
</div>

{#if showForm}
	<div class="card form-card">
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showForm = false;
				};
			}}
		>
			<div class="field">
				<label for="name">College name</label>
				<input id="name" name="name" type="text" placeholder="e.g. College of Business" required />
			</div>
			{#if form?.error}
				<p class="error-text">{form.error}</p>
			{/if}
			<button type="submit" class="btn btn-primary">Create college</button>
		</form>
	</div>
{/if}

<div class="card">
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Courses</th>
				<th>Students</th>
				<th>Created by</th>
			</tr>
		</thead>
		<tbody>
			{#each data.colleges as college (college.id)}
				<tr>
					<td><strong>{college.name}</strong></td>
					<td>{college._count.courses}</td>
					<td>{college._count.students}</td>
					<td>{college.createdBy?.name ?? '—'}</td>
				</tr>
			{:else}
				<tr>
					<td colspan="4" class="empty">No colleges yet — create the first one above.</td>
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
	}
	.form-card {
		margin-bottom: 1.25rem;
		max-width: 420px;
	}
	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem;
	}
</style>
