<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function formatDuration(totalSeconds: number): string {
		if (totalSeconds === 0) return '—';
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.round((totalSeconds % 3600) / 60);
		if (hours === 0) return `${minutes}m`;
		return `${hours}h ${minutes}m`;
	}

	function formatRelative(date: string | Date | null): string {
		if (!date) return 'Never';
		const d = new Date(date);
		const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		return `${days} days ago`;
	}

	function engagementLabel(level: string): string {
		if (level === 'engaged') return 'Engaged';
		if (level === 'moderate') return 'Moderate';
		return 'At-risk';
	}

	function engagementBadgeClass(level: string): string {
		if (level === 'engaged') return 'badge-success';
		if (level === 'moderate') return 'badge-warning';
		return 'badge-danger';
	}
</script>

<svelte:head>
	<title>{data.course.name} progress — Console</title>
</svelte:head>

<a href="/console" class="back-link">← Dashboard</a>
<h1>{data.course.name}</h1>
<p class="subtitle">
	{data.course.courseCode} · {data.progress.length} student{data.progress.length === 1 ? '' : 's'} sent content
</p>

<div class="card">
	<table>
		<thead>
			<tr>
				<th>Student</th>
				<th>Status</th>
				<th>Total time</th>
				<th>Last studied</th>
				<th>Most studied</th>
				<th>Weekly pattern</th>
				<th>Chapter tests</th>
			</tr>
		</thead>
		<tbody>
			{#each data.progress as p (p.studentId)}
				<tr>
					<td>
						<strong>{p.studentName}</strong>
						<div class="muted">{p.studentCode}</div>
					</td>
					<td>
						<span class="badge {engagementBadgeClass(p.engagement)}">{engagementLabel(p.engagement)}</span>
						{#if p.neverOpened}
							<div class="muted xs">Never opened</div>
						{/if}
					</td>
					<td>{formatDuration(p.totalStudySeconds)}</td>
					<td class="muted">
						{formatRelative(p.lastStudiedAt)}
						{#if p.lastStudiedChapterTitle}
							<div class="xs">{p.lastStudiedChapterTitle}</div>
						{/if}
					</td>
					<td class="muted">
						{#if p.mostStudiedContent}
							{p.mostStudiedContent.title ?? 'Untitled'} ({formatDuration(p.mostStudiedContent.seconds)})
							{#if p.mostStudiedContent.chapterTitle}
								<div class="xs">{p.mostStudiedContent.chapterTitle}</div>
							{/if}
						{:else}
							—
						{/if}
					</td>
					<td>
						<div class="week-chart" title="Total study time by day of week">
							{#each p.weeklyActivityByDay as seconds, i (i)}
								{@const max = Math.max(...p.weeklyActivityByDay, 1)}
								<div class="week-bar-wrap">
									<div class="week-bar" style="height: {(seconds / max) * 100}%"></div>
									<span class="week-label">{DAY_LABELS[i][0]}</span>
								</div>
							{/each}
						</div>
					</td>
					<td>
						{#if p.chapterTests.length === 0}
							<span class="muted xs">No attempts</span>
						{:else}
							<div class="chapter-tests">
								{#each p.chapterTests as ct (ct.noteId)}
									<span class="chip" class:chip-pending={!ct.revealed}>
										{ct.chapterLabel ?? ct.noteTitle ?? 'Chapter'}: {ct.score}/{ct.totalQuestions}
										{#if !ct.revealed}<em>(preview)</em>{/if}
									</span>
								{/each}
							</div>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="7" class="empty">No students have been sent content for this course yet.</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.back-link {
		display: inline-block;
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin-bottom: 0.75rem;
	}
	.subtitle {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}
	.xs {
		font-size: 0.6875rem;
	}
	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem;
	}
	.week-chart {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 32px;
		width: 100px;
	}
	.week-bar-wrap {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		height: 100%;
	}
	.week-bar {
		width: 100%;
		background: var(--accent);
		border-radius: 1px;
		min-height: 2px;
	}
	.week-label {
		font-size: 0.5625rem;
		color: var(--text-muted);
		margin-top: 1px;
	}
	.chapter-tests {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.chip {
		font-size: 0.6875rem;
		background: var(--success-soft, #ecfdf5);
		color: var(--success, #059669);
		border-radius: 4px;
		padding: 0.125rem 0.375rem;
		width: fit-content;
	}
	.chip-pending {
		background: var(--border);
		color: var(--text-muted);
	}
	.chip em {
		font-style: normal;
		opacity: 0.75;
	}
</style>
