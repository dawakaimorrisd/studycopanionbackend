<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const { staff, courses, currentStaffId, semester, access, payments } = data;

	let confirmingDeactivate = $state(false);
	const isSelf = staff.id === currentStaffId;

	const assignedCourseIds = $derived(new Set(staff.instructorCourses.map((ic) => ic.course.id)));
	const unassignedCourses = $derived(courses.filter((c) => !assignedCourseIds.has(c.id)));
</script>

<svelte:head>
	<title>{staff.name} — Console</title>
</svelte:head>

<a href="/console/staff" class="back-link">← Back to Staff</a>

<div class="header-row">
	<h1>{staff.name}</h1>
	<span class="badge badge-neutral">{staff.role}</span>
	{#if isSelf}<span class="badge badge-neutral">You</span>{/if}
</div>

{#if form?.error}
	<div class="card error-card"><p>{form.error}</p></div>
{/if}
{#if form?.passwordReset}
	<div class="card success-card"><p>Password reset. They'll need to log in again everywhere.</p></div>
{/if}

<div class="card">
	<h2>Details</h2>
	<form method="POST" action="?/update" use:enhance class="edit-form">
		<div class="field">
			<label for="name">Name</label>
			<input id="name" name="name" type="text" value={staff.name} required />
		</div>
		<div class="field">
			<label for="role">Role</label>
			<select id="role" name="role" disabled={isSelf} required>
				<option value="ADMIN" selected={staff.role === 'ADMIN'}>Admin</option>
				<option value="MODERATOR" selected={staff.role === 'MODERATOR'}>Moderator</option>
				<option value="INSTRUCTOR" selected={staff.role === 'INSTRUCTOR'}>Instructor</option>
			</select>
			{#if isSelf}<p class="hint">You can't change your own role.</p>{/if}
		</div>
		<button type="submit" class="btn btn-primary">Save changes</button>
	</form>
</div>

<div class="card">
	<h2>Reset password</h2>
	<p class="muted">Sets a new password and signs them out everywhere immediately.</p>
	<form method="POST" action="?/resetPassword" use:enhance class="edit-form">
		<div class="field">
			<label for="password">New password</label>
			<input id="password" name="password" type="password" minlength="8" required />
		</div>
		<button type="submit" class="btn btn-secondary">Reset password</button>
	</form>
</div>

{#if staff.role === 'INSTRUCTOR'}
	<div class="card">
		<h2>Assigned courses ({staff.instructorCourses.length})</h2>
		{#if staff.instructorCourses.length === 0}
			<p class="muted">Not assigned to any course yet — they'll see nothing until assigned.</p>
		{:else}
			<ul class="access-list">
				{#each staff.instructorCourses as ic (ic.course.id)}
					<li>
						<span>{ic.course.name} ({ic.course.courseCode})</span>
						<form method="POST" action="?/unassignCourse" use:enhance class="inline-form">
							<input type="hidden" name="courseId" value={ic.course.id} />
							<button type="submit" class="link-btn">Unassign</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if unassignedCourses.length > 0}
			<form method="POST" action="?/assignCourse" use:enhance class="assign-form">
				<select name="courseId" required>
					<option value="">Assign a course…</option>
					{#each unassignedCourses as course (course.id)}
						<option value={course.id}>{course.name} ({course.courseCode})</option>
					{/each}
				</select>
				<button type="submit" class="btn btn-secondary btn-sm">Assign</button>
			</form>
		{/if}
	</div>

	<div class="card">
		<h2>Semester access</h2>
		{#if access?.isPaid}
			<p><span class="badge badge-success badge-xs">Paid</span> for {semester.name}.</p>
			{#if access.amountPaidCents !== null}
				<p class="muted">
					Amount: ${(access.amountPaidCents / 100).toFixed(2)} · Activated {new Date(
						access.activatedAt!
					).toLocaleDateString()}
				</p>
			{/if}
			<form method="POST" action="?/revokeAccess" use:enhance class="inline-form">
				<button type="submit" class="btn btn-danger btn-sm">Revoke access</button>
			</form>
		{:else}
			<p>
				<span class="badge badge-neutral badge-xs">Unpaid</span> for {semester.name} — they can't upload,
				generate, or manage content for any assigned course until activated, even if assigned.
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
{/if}

<div class="card danger-zone">
	<h2>Deactivate this account</h2>
	<p class="muted">
		Soft-deletes the account and ends any active sessions immediately. Can't be undone from the
		console — recreate the account if needed.
	</p>
	{#if isSelf}
		<p class="muted"><em>You can't deactivate your own account.</em></p>
	{:else if confirmingDeactivate}
		<form method="POST" action="?/deactivate" use:enhance class="inline-form">
			<button type="submit" class="btn btn-danger">Yes, deactivate {staff.name}</button>
			<button type="button" class="btn btn-secondary" onclick={() => (confirmingDeactivate = false)}>
				Cancel
			</button>
		</form>
	{:else}
		<button type="button" class="btn btn-danger" onclick={() => (confirmingDeactivate = true)}>
			Deactivate account
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
	.success-card {
		background: var(--success-soft, #ecfdf5);
		border-color: var(--success, #10b981);
	}
	.success-card p {
		margin: 0.25rem 0 0;
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
	.hint {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.access-list {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.access-list li {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 0.9rem;
	}
	.inline-form {
		display: inline-flex;
		gap: 0.5rem;
	}
	.link-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		text-decoration: underline;
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0;
	}
	.assign-form {
		display: flex;
		gap: 0.5rem;
	}
	.activate-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 24rem;
		margin-top: 0.75rem;
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
	.btn-sm {
		padding: 0.3125rem 0.625rem;
		font-size: 0.8125rem;
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
