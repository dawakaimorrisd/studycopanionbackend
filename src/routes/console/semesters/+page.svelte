<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showForm = $state(false);

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Semesters — Console</title>
</svelte:head>

<div class="header-row">
	<div>
		<h1>Semesters</h1>
		<p>
			The top-level academic container. Exactly one semester is active at a time — student
			enrollment, paid access, and all course content are scoped to whichever one that is.
		</p>
	</div>
	<button class="btn btn-primary" onclick={() => (showForm = !showForm)}>
		{showForm ? 'Cancel' : '+ New semester'}
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
				<label for="name">Semester name</label>
				<input id="name" name="name" type="text" placeholder="e.g. 2026/2027 First Semester" required />
			</div>
			<div class="field-row">
				<div class="field">
					<label for="startDate">Start date</label>
					<input id="startDate" name="startDate" type="date" required />
				</div>
				<div class="field">
					<label for="endDate">End date</label>
					<input id="endDate" name="endDate" type="date" required />
				</div>
			</div>
			{#if form?.error}
				<p class="error-text">{form.error}</p>
			{/if}
			<button type="submit" class="btn btn-primary">Create semester</button>
		</form>
	</div>
{/if}

<div class="card">
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Dates</th>
				<th>Students enrolled</th>
				<th>Course enrollments</th>
				<th>Instructor assignments</th>
				<th>Status</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.semesters as semester (semester.id)}
				<tr>
					<td><strong>{semester.name}</strong></td>
					<td>{formatDate(semester.startDate)} – {formatDate(semester.endDate)}</td>
					<td>{semester._count.studentSemesters}</td>
					<td>{semester._count.studentCourses}</td>
					<td>{semester._count.instructorCourses}</td>
					<td>
						{#if semester.isActive}
							<span class="badge badge-active">Active</span>
						{:else}
							<span class="badge">Inactive</span>
						{/if}
					</td>
					<td>
						{#if !semester.isActive}
							<form
								method="POST"
								action="?/activate"
								use:enhance
								onsubmit={(e) => {
									const preview = data.rolloverPreview;
									const message = preview
										? `Activate "${semester.name}"? This deactivates the current semester immediately and rolls forward ${preview.studentCount} student${preview.studentCount === 1 ? '' : 's'} across ${preview.courseEnrollmentCount} course enrollment${preview.courseEnrollmentCount === 1 ? '' : 's'} as a starting point. Paid access will reset to unpaid for all of them — this cannot be undone.`
										: `Activate "${semester.name}"? This is the first semester, so there's nothing to roll forward.`;
									if (!confirm(message)) {
										e.preventDefault();
									}
								}}
							>
								<input type="hidden" name="semesterId" value={semester.id} />
								<button type="submit" class="btn btn-sm">Activate</button>
							</form>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="7" class="empty">No semesters yet — create the first one above.</td>
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
		max-width: 60ch;
	}
	.form-card {
		margin-bottom: 1.25rem;
		max-width: 480px;
	}
	.field-row {
		display: flex;
		gap: 0.75rem;
	}
	.field-row .field {
		flex: 1;
	}
	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem;
	}
	.badge {
		display: inline-block;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		font-size: 0.75rem;
		background: var(--surface-muted, #eee);
		color: var(--text-muted);
	}
	.badge-active {
		background: #dcfce7;
		color: #166534;
	}
	.btn-sm {
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
	}
</style>
