<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showForm = $state(false);
	let expandedCourseId = $state<string | null>(null);
</script>

<svelte:head>
	<title>Courses — Console</title>
</svelte:head>

<div class="header-row">
	<div>
		<h1>Courses</h1>
		<p>
			A course can belong to multiple colleges (Math, English, etc. are shared). College linkage
			is optional at creation and can be adjusted anytime below.
		</p>
	</div>
	<button class="btn btn-primary" onclick={() => (showForm = !showForm)}>
		{showForm ? 'Cancel' : '+ New course'}
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
				<label for="name">Course name</label>
				<input id="name" name="name" type="text" placeholder="e.g. Anatomy I" required />
			</div>
			<div class="field">
				<label for="courseCode">Course code</label>
				<input id="courseCode" name="courseCode" type="text" placeholder="e.g. ANAT101" required />
			</div>
			<div class="field">
				<span>Colleges (optional — link now or later)</span>
				<div class="checkbox-list">
					{#each data.colleges as college (college.id)}
						<label class="checkbox-row">
							<input type="checkbox" name="collegeIds" value={college.id} />
							{college.name}
						</label>
					{/each}
					{#if data.colleges.length === 0}
						<p class="muted">No colleges yet — create one first, or link later.</p>
					{/if}
				</div>
			</div>
			{#if form?.error}
				<p class="error-text">{form.error}</p>
			{/if}
			<button type="submit" class="btn btn-primary">Create course</button>
		</form>
	</div>
{/if}

<div class="card">
	<table>
		<thead>
			<tr>
				<th>Course</th>
				<th>Code</th>
				<th>Colleges</th>
				<th>Content</th>
				<th>Instructors</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.courses as course (course.id)}
				<tr>
					<td><strong>{course.name}</strong></td>
					<td><code>{course.courseCode}</code></td>
					<td>
						{#if course.colleges.length === 0}
							<span class="badge badge-neutral">Unlinked</span>
						{:else}
							{#each course.colleges as cc (cc.college.id)}
								<span class="badge badge-neutral">{cc.college.name}</span>
							{/each}
						{/if}
					</td>
					<td class="muted">{course._count.notes} notes · {course._count.assignments} assignments</td>
					<td class="muted">{course._count.instructorAssignments}</td>
					<td>
						<a href="/console/courses/{course.id}/chapters" class="btn btn-secondary btn-sm">
							Chapters
						</a>
						<button
							class="btn btn-secondary btn-sm"
							onclick={() => (expandedCourseId = expandedCourseId === course.id ? null : course.id)}
						>
							{expandedCourseId === course.id ? 'Close' : 'Manage colleges'}
						</button>
					</td>
				</tr>
				{#if expandedCourseId === course.id}
					<tr class="manage-row">
						<td colspan="6">
							<div class="manage-panel">
								<div>
									<h3>Linked</h3>
									{#if course.colleges.length === 0}
										<p class="muted">None yet.</p>
									{/if}
									{#each course.colleges as cc (cc.college.id)}
										<form method="POST" action="?/unlinkCollege" use:enhance class="inline-form">
											<input type="hidden" name="courseId" value={course.id} />
											<input type="hidden" name="collegeId" value={cc.college.id} />
											<span>{cc.college.name}</span>
											<button type="submit" class="link-btn">Remove</button>
										</form>
									{/each}
								</div>
								<div>
									<h3>Link another college</h3>
									{#each data.colleges.filter((c) => !course.colleges.some((cc) => cc.college.id === c.id)) as college (college.id)}
										<form method="POST" action="?/linkCollege" use:enhance class="inline-form">
											<input type="hidden" name="courseId" value={course.id} />
											<input type="hidden" name="collegeId" value={college.id} />
											<span>{college.name}</span>
											<button type="submit" class="link-btn">Link</button>
										</form>
									{/each}
								</div>
							</div>
						</td>
					</tr>
				{/if}
			{:else}
				<tr>
					<td colspan="6" class="empty">No courses yet — create the first one above.</td>
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
		max-width: 520px;
	}
	.form-card {
		margin-bottom: 1.25rem;
		max-width: 480px;
	}
	.checkbox-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-top: 0.375rem;
	}
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 400;
		font-size: 0.875rem;
	}
	.checkbox-row input {
		width: auto;
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
