<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const { student, colleges, courses, semester, isEnrolledThisSemester, enrolledCourseIds, access, payments } =
		data;

	let confirmingDelete = $state(false);
	let selectedCourseIds = $state(new Set(enrolledCourseIds));

	function toggleCourse(id: string) {
		const next = new Set(selectedCourseIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedCourseIds = next;
	}
</script>

<svelte:head>
	<title>{student.name} — Console</title>
</svelte:head>

<a href="/console/students" class="back-link">← Back to Students</a>

<div class="header-row">
	<h1>{student.name}</h1>
	<span class="badge badge-neutral">{student.studentCode}</span>
</div>

{#if form?.error}
	<div class="card error-card"><p>{form.error}</p></div>
{/if}

<div class="card">
	<h2>Details</h2>
	<form method="POST" action="?/update" use:enhance class="edit-form">
		<div class="field">
			<label for="name">Name</label>
			<input id="name" name="name" type="text" value={student.name} required />
		</div>
		<div class="field">
			<label for="studentCode">Student code</label>
			<input id="studentCode" name="studentCode" type="text" value={student.studentCode} required />
		</div>
		<div class="field">
			<label for="collegeId">College</label>
			<select id="collegeId" name="collegeId" required>
				{#each colleges as college (college.id)}
					<option value={college.id} selected={college.id === student.college.id}>{college.name}</option>
				{/each}
			</select>
		</div>
		<button type="submit" class="btn btn-primary">Save changes</button>
	</form>
</div>

<div class="card">
	<h2>{semester.name} enrollment</h2>
	<p class="muted">
		{#if isEnrolledThisSemester}
			Enrolled in the active semester. Check which courses this student can access — content and
			study activity for a course are invisible to them unless it's checked here <em>and</em> they
			have paid access below.
		{:else}
			Not yet enrolled in the active semester. Saving below will enroll them and set their courses
			in one step.
		{/if}
	</p>
	<form method="POST" action="?/setEnrollment" use:enhance class="course-form">
		<div class="course-grid">
			{#each courses as course (course.id)}
				<label class="course-check">
					<input
						type="checkbox"
						name="courseId"
						value={course.id}
						checked={selectedCourseIds.has(course.id)}
						onchange={() => toggleCourse(course.id)}
					/>
					{course.name} <span class="muted">({course.courseCode})</span>
				</label>
			{:else}
				<p class="muted">No courses exist yet — create some from the Courses page first.</p>
			{/each}
		</div>
		<button type="submit" class="btn btn-primary">Save enrollment</button>
	</form>
</div>

<div class="card">
	<h2>Semester access</h2>
	{#if access?.isPaid}
		<p><span class="badge badge-success badge-xs">Paid</span> for {semester.name}.</p>
		{#if access.amountPaidCents !== null}
			<p class="muted">Amount: ${(access.amountPaidCents / 100).toFixed(2)} · Activated {new Date(access.activatedAt!).toLocaleDateString()}</p>
		{/if}
		<form method="POST" action="?/revokeAccess" use:enhance class="inline-form">
			<button type="submit" class="btn btn-danger btn-sm">Revoke access</button>
		</form>
	{:else}
		<p>
			<span class="badge badge-neutral badge-xs">Unpaid</span> for {semester.name} — this student sees
			no content regardless of course enrollment.
		</p>
		<form method="POST" action="?/activateAccess" use:enhance class="activate-form">
			<div class="field">
				<label for="amount">Amount received</label>
				<input id="amount" name="amount" type="number" min="0" step="0.01" placeholder="0.00" required />
			</div>
			<div class="field">
				<label for="note">Note (optional)</label>
				<input id="note" name="note" type="text" placeholder="e.g. paid in person, receipt #123" />
			</div>
			<button type="submit" class="btn btn-primary">Activate access</button>
		</form>
	{/if}

	{#if payments.length > 0}
		<details class="payment-history">
			<summary>Payment history for {semester.name} ({payments.length})</summary>
			<ul>
				{#each payments as payment (payment.id)}
					<li>
						${(payment.amountCents / 100).toFixed(2)} — {new Date(payment.recordedAt).toLocaleString()}
						{#if payment.recordedBy}by {payment.recordedBy.name}{/if}
						{#if payment.note}<span class="muted"> · {payment.note}</span>{/if}
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>

<div class="card danger-zone">
	<h2>Delete this student</h2>
	<p class="muted">
		Soft-deletes the account (their history is kept, but they can no longer log in) and ends any
		active sessions. This is Admin-only.
	</p>
	{#if confirmingDelete}
		<form method="POST" action="?/deleteStudent" use:enhance class="inline-form">
			<button type="submit" class="btn btn-danger">Yes, delete {student.name}</button>
			<button type="button" class="btn btn-secondary" onclick={() => (confirmingDelete = false)}>
				Cancel
			</button>
		</form>
	{:else}
		<button type="button" class="btn btn-danger" onclick={() => (confirmingDelete = true)}>
			Delete student
		</button>
	{/if}
</div>

<style>
	.back-link {
		display: inline-block;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.header-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.card {
		margin-bottom: 1.5rem;
	}
	.error-card {
		background: var(--danger-soft);
		border-color: var(--danger);
	}
	.error-card p {
		margin: 0.25rem 0 0;
		color: var(--danger);
	}
	.edit-form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		max-width: 28rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.field label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.course-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.course-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.course-check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}
	.inline-form {
		display: inline-flex;
		gap: 0.5rem;
	}
	.activate-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 24rem;
		margin-top: 0.75rem;
	}
	.btn-sm {
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
	}
	.payment-history {
		margin-top: 0.75rem;
		font-size: 0.85rem;
	}
	.payment-history summary {
		cursor: pointer;
		color: var(--text-muted);
	}
	.payment-history ul {
		margin: 0.5rem 0 0;
		padding-left: 1.25rem;
	}
	.danger-zone {
		border-color: var(--danger);
	}
	.btn-danger {
		background: var(--danger);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
	}
</style>

