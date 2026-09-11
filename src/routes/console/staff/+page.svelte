<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showForm = $state(false);
	let expandedStaffId = $state<string | null>(null);
</script>

<svelte:head>
	<title>Staff — Console</title>
</svelte:head>

<div class="header-row">
	<div>
		<h1>Staff</h1>
		<p>Admin, Moderator, and Instructor accounts. Only an Admin can create or deactivate staff.</p>
	</div>
	<button class="btn btn-primary" onclick={() => (showForm = !showForm)}>
		{showForm ? 'Cancel' : '+ New staff account'}
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
				<label for="name">Name</label>
				<input id="name" name="name" type="text" required />
			</div>
			<div class="field">
				<label for="password">Temporary password</label>
				<input id="password" name="password" type="text" minlength="8" required />
			</div>
			<div class="field">
				<label for="role">Role</label>
				<select id="role" name="role" required>
					<option value="MODERATOR">Moderator</option>
					<option value="INSTRUCTOR">Instructor</option>
					<option value="ADMIN">Admin</option>
				</select>
			</div>
			{#if form?.error}
				<p class="error-text">{form.error}</p>
			{/if}
			<button type="submit" class="btn btn-primary">Create account</button>
		</form>
	</div>
{/if}

<div class="card">
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Role</th>
				<th>Assigned courses</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.staff as member (member.id)}
				<tr>
					<td><a href="/console/staff/{member.id}"><strong>{member.name}</strong></a></td>
					<td><span class="badge badge-neutral">{member.role}</span></td>
					<td class="muted">
						{#if member.role === 'INSTRUCTOR'}
							{member.instructorCourses.length === 0
								? 'None'
								: member.instructorCourses.map((ic) => ic.course.courseCode).join(', ')}
						{:else}
							— (not course-scoped)
						{/if}
					</td>
					<td class="actions">
						{#if member.role === 'INSTRUCTOR'}
							<button
								class="btn btn-secondary btn-sm"
								onclick={() => (expandedStaffId = expandedStaffId === member.id ? null : member.id)}
							>
								{expandedStaffId === member.id ? 'Close' : 'Manage courses'}
							</button>
						{/if}
						{#if member.id !== data.currentStaffId}
							<form method="POST" action="?/deactivate" use:enhance>
								<input type="hidden" name="staffId" value={member.id} />
								<button type="submit" class="btn btn-danger btn-sm">Deactivate</button>
							</form>
						{/if}
					</td>
				</tr>
				{#if expandedStaffId === member.id}
					<tr class="manage-row">
						<td colspan="4">
							<div class="manage-panel">
								<div>
									<h3>Assigned</h3>
									{#if member.instructorCourses.length === 0}
										<p class="muted">None yet.</p>
									{/if}
									{#each member.instructorCourses as ic (ic.course.id)}
										<form method="POST" action="?/unassignCourse" use:enhance class="inline-form">
											<input type="hidden" name="instructorId" value={member.id} />
											<input type="hidden" name="courseId" value={ic.course.id} />
											<span>{ic.course.name} ({ic.course.courseCode})</span>
											<button type="submit" class="link-btn">Remove</button>
										</form>
									{/each}
								</div>
								<div>
									<h3>Assign another course</h3>
									{#each data.courses.filter((c) => !member.instructorCourses.some((ic) => ic.course.id === c.id)) as course (course.id)}
										<form method="POST" action="?/assignCourse" use:enhance class="inline-form">
											<input type="hidden" name="instructorId" value={member.id} />
											<input type="hidden" name="courseId" value={course.id} />
											<span>{course.name} ({course.courseCode})</span>
											<button type="submit" class="link-btn">Assign</button>
										</form>
									{/each}
								</div>
							</div>
						</td>
					</tr>
				{/if}
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
	.form-card {
		margin-bottom: 1.25rem;
		max-width: 420px;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.btn-sm {
		padding: 0.3125rem 0.625rem;
		font-size: 0.8125rem;
	}
	.manage-row td {
		background: var(--surface-1);
	}
	.manage-panel {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		padding: 0.5rem;
	}
	.manage-panel h3 {
		margin-bottom: 0.5rem;
	}
	.inline-form {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.25rem 0;
		font-size: 0.875rem;
	}
	.link-btn {
		background: none;
		border: none;
		color: var(--accent);
		cursor: pointer;
		font-size: 0.8125rem;
		text-decoration: underline;
		padding: 0;
	}
</style>
