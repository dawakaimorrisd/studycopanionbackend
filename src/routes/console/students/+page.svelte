<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function onCollegeChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		goto(value ? `?collegeId=${value}` : '?', { keepFocus: true });
	}
</script>

<svelte:head>
	<title>Students — Console</title>
</svelte:head>

<div class="header-row">
	<div>
		<h1>Students</h1>
		<p>
			Students self-register from the Frontend app (name + student code) — there's no
			console-side creation here by design.
		</p>
	</div>
	<select value={data.selectedCollegeId} onchange={onCollegeChange} class="filter">
		<option value="">All colleges</option>
		{#each data.colleges as college (college.id)}
			<option value={college.id}>{college.name}</option>
		{/each}
	</select>
</div>

<div class="card">
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Student code</th>
				<th>College</th>
				<th>Content sent</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.students as student (student.id)}
				<tr>
					<td><a href="/console/students/{student.id}"><strong>{student.name}</strong></a></td>
					<td><code>{student.studentCode}</code></td>
					<td>{student.college.name}</td>
					<td class="muted">
						{student._count.courseEnrollments} course{student._count.courseEnrollments === 1 ? '' : 's'} this semester
					</td>
					<td>
						<form method="POST" action="?/deleteStudent" use:enhance>
							<input type="hidden" name="studentId" value={student.id} />
							<button type="submit" class="btn btn-danger btn-sm">Delete</button>
						</form>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="5" class="empty">No students match this filter.</td>
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
	.filter {
		width: auto;
		min-width: 180px;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}
	.btn-sm {
		padding: 0.3125rem 0.625rem;
		font-size: 0.8125rem;
	}
	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem;
	}
</style>
