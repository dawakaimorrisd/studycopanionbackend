
<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const getEngagementPercent = (engaged: number, total: number) =>
		total > 0 ? Math.round((engaged / total) * 100) : 0;
</script>

<svelte:head>
	<title>Dashboard — Study Companion Console</title>
</svelte:head>

<div class="dashboard">
	<!-- Header -->
	<header class="dashboard-header">
		<div>
			<div class="eyebrow">
				<span class="eyebrow-dot"></span>
				ADMIN CONSOLE
			</div>

			<h1>Good morning, Admin.</h1>

			<p class="subtitle">
				Here’s what’s happening across your colleges, courses, students, and learning content.
			</p>
		</div>

		<div class="header-meta">
			<div class="live-indicator">
				<span></span>
				Live overview
			</div>
		</div>
	</header>

	<!-- Primary metrics -->
	<section class="metrics">
		<div class="metric-card featured">
			<div class="metric-top">
				<span class="metric-label">Students</span>
				<div class="metric-icon">S</div>
			</div>

			<div class="metric-value">{data.stats.studentCount}</div>

			<div class="metric-footer">
				<span class="metric-caption">Active across the platform</span>
			</div>
		</div>

		<div class="metric-card">
			<div class="metric-top">
				<span class="metric-label">Colleges</span>
				<div class="metric-icon">C</div>
			</div>

			<div class="metric-value">{data.stats.collegeCount}</div>

			<div class="metric-footer">
				<span class="metric-caption">Institutions connected</span>
			</div>
		</div>

		<div class="metric-card">
			<div class="metric-top">
				<span class="metric-label">Courses</span>
				<div class="metric-icon">◈</div>
			</div>

			<div class="metric-value">{data.stats.courseCount}</div>

			<div class="metric-footer">
				<span class="metric-caption">Courses available</span>
			</div>
		</div>

		<div class="metric-card">
			<div class="metric-top">
				<span class="metric-label">Content</span>
				<div class="metric-icon">✦</div>
			</div>

			<div class="metric-value">{data.stats.totalContent}</div>

			<div class="metric-footer">
				<span class="metric-caption">Notes & assignments</span>
			</div>
		</div>
	</section>

	<!-- Generation status -->
	<section class="status-grid">
		<div class="status-card">
			<div class="status-icon success">✓</div>

			<div class="status-content">
				<span class="status-label">Generated</span>
				<strong>{data.stats.generatedCount}</strong>
				<span class="status-description">Successfully generated</span>
			</div>
		</div>

		<div class:has-warning={data.stats.failedCount > 0} class="status-card">
			<div class="status-icon danger">!</div>

			<div class="status-content">
				<span class="status-label">Generation failures</span>
				<strong>{data.stats.failedCount}</strong>
				<span class="status-description">
					{data.stats.failedCount > 0
						? 'Requires attention'
						: 'Everything is running smoothly'}
				</span>
			</div>

			{#if data.stats.failedCount > 0}
				<div class="attention-pill">Attention</div>
			{/if}
		</div>
	</section>

	<!-- Engagement section -->
	<section class="engagement-section">
		<div class="section-header">
			<div>
				<div class="section-eyebrow">STUDENT ACTIVITY</div>
				<h2>Engagement by course</h2>
				<p>
					Monitor how recently students have interacted with their learning materials.
				</p>
			</div>

			<div class="legend">
				<div>
					<span class="legend-dot engaged"></span>
					Engaged
				</div>
				<div>
					<span class="legend-dot moderate"></span>
					Moderate
				</div>
				<div>
					<span class="legend-dot risk"></span>
					At-risk
				</div>
			</div>
		</div>

		<div class="engagement-card">
			<div class="table-head">
				<span>COURSE</span>
				<span>CONTENT</span>
				<span>STUDENTS</span>
				<span>ENGAGEMENT</span>
				<span>STATUS</span>
				<span></span>
			</div>

			{#each data.courseEngagement as { course, engagement } (course.id)}
				{@const engagementPercent = getEngagementPercent(
					engagement.engaged,
					engagement.totalStudents
				)}

				<div class="course-row">
					<!-- Course -->
					<div class="course-info">
						<div class="course-avatar">
							{course.name.charAt(0).toUpperCase()}
						</div>

						<div>
							<strong>{course.name}</strong>
							<span>{course.courseCode}</span>
						</div>
					</div>

					<!-- Content -->
					<div class="content-info">
						<strong>
							{course._count.notes + course._count.assignments}
						</strong>

						<span>
							{course._count.notes} notes
							<span class="separator">·</span>
							{course._count.assignments} assignments
						</span>
					</div>

					<!-- Students -->
					<div class="student-count">
						<strong>{engagement.totalStudents}</strong>
						<span>enrolled</span>
					</div>

					<!-- Engagement -->
					<div class="engagement-meter">
						<div class="meter-top">
							<strong>{engagementPercent}%</strong>
							<span>{engagement.engaged} engaged</span>
						</div>

						<div class="meter-track">
							<div
								class="meter-fill"
								style={`width: ${engagementPercent}%`}
							></div>
						</div>
					</div>

					<!-- Status -->
					<div class="status-breakdown">
						<div class="status-number success">
							{engagement.engaged}
						</div>

						<div class="status-number warning">
							{engagement.moderate}
						</div>

						<div class="status-number danger">
							{engagement.atRisk}
						</div>
					</div>

					<!-- Action -->
					<div class="course-action">
						{#if engagement.totalStudents > 0}
							<a href={`/console/progress/${course.id}`}>
								View
								<span>→</span>
							</a>
						{:else}
							<span class="no-action">—</span>
						{/if}
					</div>
				</div>
			{:else}
				<div class="empty-state">
					<div class="empty-icon">◈</div>
					<strong>No courses yet</strong>
					<span>
						Courses will appear here once they are added to the system.
					</span>
				</div>
			{/each}

			<div class="table-footer">
				<div>
					<span class="footer-dot"></span>
					Student engagement
				</div>

				<span>
					Engaged = last 7 days · Moderate = 8–21 days ·
					At-risk = 21+ days or never opened
				</span>
			</div>
		</div>
	</section>
</div>

<style>
	.dashboard {
		max-width: 1480px;
		margin: 0 auto;
		padding: 0.5rem 0 3rem;
	}

	/* Header */

	.dashboard-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 2rem;
	}

	.eyebrow,
	.section-eyebrow {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--text-muted);
	}

	.eyebrow {
		margin-bottom: 0.75rem;
	}

	.eyebrow-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 3vw, 2.75rem);
		line-height: 1.05;
		letter-spacing: -0.04em;
		color: var(--text);
	}

	.subtitle {
		margin: 0.75rem 0 0;
		max-width: 680px;
		font-size: 0.9375rem;
		line-height: 1.6;
		color: var(--text-muted);
	}

	.header-meta {
		display: flex;
		align-items: center;
		padding-bottom: 0.25rem;
	}

	.live-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.03);
	}

	.live-indicator span {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #22c55e;
		box-shadow: 0 0 0 3px rgb(34 197 94 / 0.12);
	}

	/* Metrics */

	.metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.metric-card {
		position: relative;
		min-height: 158px;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--surface);
		box-shadow: 0 8px 30px rgb(0 0 0 / 0.035);
		overflow: hidden;
		transition:
			transform 160ms ease,
			box-shadow 160ms ease;
	}

	.metric-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 14px 35px rgb(0 0 0 / 0.07);
	}

	.metric-card.featured {
		background: var(--text);
		border-color: var(--text);
		color: var(--surface);
	}

	.metric-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.metric-label {
		font-size: 0.75rem;
		font-weight: 650;
		color: var(--text-muted);
	}

	.featured .metric-label {
		color: rgb(255 255 255 / 0.65);
	}

	.metric-icon {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface-soft, var(--surface));
		color: var(--text);
		font-size: 0.75rem;
		font-weight: 700;
	}

	.featured .metric-icon {
		border-color: rgb(255 255 255 / 0.15);
		background: rgb(255 255 255 / 0.08);
		color: white;
	}

	.metric-value {
		margin-top: 1.35rem;
		font-family: var(--font-display);
		font-size: 2.35rem;
		font-weight: 650;
		line-height: 1;
		letter-spacing: -0.045em;
		color: var(--text);
	}

	.featured .metric-value {
		color: white;
	}

	.metric-footer {
		margin-top: 0.7rem;
	}

	.metric-caption {
		font-size: 0.6875rem;
		color: var(--text-muted);
	}

	.featured .metric-caption {
		color: rgb(255 255 255 / 0.58);
	}

	/* Status */

	.status-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin-bottom: 2.75rem;
	}

	.status-card {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.125rem;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--surface);
	}

	.status-card.has-warning {
		border-color: var(--danger);
	}

	.status-icon {
		display: grid;
		width: 42px;
		height: 42px;
		flex: 0 0 42px;
		place-items: center;
		border-radius: 12px;
		font-weight: 800;
	}

	.status-icon.success {
		background: rgb(34 197 94 / 0.1);
		color: #16a34a;
	}

	.status-icon.danger {
		background: rgb(239 68 68 / 0.1);
		color: #dc2626;
	}

	.status-content {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.status-label {
		font-size: 0.75rem;
		font-weight: 650;
		color: var(--text);
	}

	.status-content strong {
		margin-top: 0.1rem;
		font-family: var(--font-display);
		font-size: 1.35rem;
		line-height: 1.1;
		color: var(--text);
	}

	.status-description {
		margin-top: 0.15rem;
		font-size: 0.6875rem;
		color: var(--text-muted);
	}

	.attention-pill {
		margin-left: auto;
		padding: 0.35rem 0.55rem;
		border-radius: 999px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	/* Engagement */

	.engagement-section {
		margin-top: 0.5rem;
	}

	.section-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 1rem;
	}

	.section-eyebrow {
		margin-bottom: 0.55rem;
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		letter-spacing: -0.025em;
		color: var(--text);
	}

	.section-header p {
		margin: 0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding-bottom: 0.15rem;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.legend div {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.legend-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}

	.legend-dot.engaged {
		background: #22c55e;
	}

	.legend-dot.moderate {
		background: #f59e0b;
	}

	.legend-dot.risk {
		background: #ef4444;
	}

	/* Table */

	.engagement-card {
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--surface);
		box-shadow: 0 8px 30px rgb(0 0 0 / 0.035);
		overflow: hidden;
	}

	.table-head,
	.course-row {
		display: grid;
		grid-template-columns:
			minmax(220px, 1.7fr)
			minmax(150px, 1.1fr)
			minmax(80px, 0.65fr)
			minmax(170px, 1.2fr)
			minmax(120px, 0.9fr)
			70px;
		gap: 1.25rem;
		align-items: center;
	}

	.table-head {
		padding: 0.85rem 1.25rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface-soft, var(--background));
		color: var(--text-muted);
		font-size: 0.6rem;
		font-weight: 750;
		letter-spacing: 0.09em;
	}

	.course-row {
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
		transition: background 140ms ease;
	}

	.course-row:hover {
		background: var(--surface-soft, var(--background));
	}

	.course-row:last-of-type {
		border-bottom: 0;
	}

	.course-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.course-avatar {
		display: grid;
		width: 38px;
		height: 38px;
		flex: 0 0 38px;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 11px;
		background: var(--background);
		color: var(--text);
		font-size: 0.75rem;
		font-weight: 750;
	}

	.course-info > div:last-child {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.course-info strong {
		overflow: hidden;
		font-size: 0.8125rem;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
	}

	.course-info span {
		margin-top: 0.18rem;
		font-size: 0.65rem;
		color: var(--text-muted);
	}

	.content-info,
	.student-count {
		display: flex;
		flex-direction: column;
	}

	.content-info strong,
	.student-count strong {
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--text);
	}

	.content-info span,
	.student-count span {
		margin-top: 0.2rem;
		font-size: 0.625rem;
		color: var(--text-muted);
	}

	.separator {
		margin: 0 0.2rem;
	}

	.engagement-meter {
		min-width: 0;
	}

	.meter-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}

	.meter-top strong {
		font-size: 0.75rem;
		font-weight: 750;
		color: var(--text);
	}

	.meter-top span {
		font-size: 0.6rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.meter-track {
		width: 100%;
		height: 5px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--border);
	}

	.meter-fill {
		height: 100%;
		min-width: 2px;
		border-radius: inherit;
		background: #22c55e;
		transition: width 400ms ease;
	}

	.status-breakdown {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.status-number {
		display: grid;
		min-width: 30px;
		height: 28px;
		padding: 0 0.4rem;
		place-items: center;
		border-radius: 8px;
		font-size: 0.6875rem;
		font-weight: 750;
	}

	.status-number.success {
		background: rgb(34 197 94 / 0.1);
		color: #16a34a;
	}

	.status-number.warning {
		background: rgb(245 158 11 / 0.1);
		color: #d97706;
	}

	.status-number.danger {
		background: rgb(239 68 68 / 0.1);
		color: #dc2626;
	}

	.course-action {
		display: flex;
		justify-content: flex-end;
	}

	.course-action a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.45rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.6875rem;
		font-weight: 700;
		text-decoration: none;
		transition:
			background 140ms ease,
			border-color 140ms ease,
			transform 140ms ease;
	}

	.course-action a:hover {
		border-color: var(--text-muted);
		background: var(--background);
		transform: translateX(1px);
	}

	.course-action a span {
		font-size: 0.8rem;
	}

	.no-action {
		color: var(--text-muted);
	}

	/* Empty */

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 240px;
		padding: 2rem;
		text-align: center;
	}

	.empty-icon {
		display: grid;
		width: 46px;
		height: 46px;
		margin-bottom: 0.75rem;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--background);
		color: var(--text-muted);
	}

	.empty-state strong {
		font-size: 0.875rem;
		color: var(--text);
	}

	.empty-state span {
		max-width: 320px;
		margin-top: 0.35rem;
		font-size: 0.6875rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	/* Footer */

	.table-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.8rem 1.25rem;
		border-top: 1px solid var(--border);
		background: var(--surface-soft, var(--background));
		color: var(--text-muted);
		font-size: 0.6rem;
	}

	.table-footer > div {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 650;
	}

	.footer-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #22c55e;
	}

	/* Responsive */

	@media (max-width: 1100px) {
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.table-head {
			display: none;
		}

		.course-row {
			grid-template-columns: 1.5fr 1fr 1fr;
			gap: 1rem;
		}

		.engagement-meter {
			grid-column: span 2;
		}

		.status-breakdown {
			grid-column: 1;
		}

		.course-action {
			grid-column: 3;
			grid-row: 3;
		}
	}

	@media (max-width: 760px) {
		.dashboard-header,
		.section-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.header-meta {
			padding-bottom: 0;
		}

		.metrics {
			grid-template-columns: 1fr;
		}

		.status-grid {
			grid-template-columns: 1fr;
		}

		.legend {
			flex-wrap: wrap;
		}

		.course-row {
			grid-template-columns: 1fr 1fr;
		}

		.course-info {
			grid-column: span 2;
		}

		.engagement-meter {
			grid-column: span 2;
		}

		.status-breakdown {
			grid-column: 1;
		}

		.course-action {
			grid-column: 2;
			grid-row: auto;
		}

		.table-footer {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
