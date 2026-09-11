<script lang="ts">
	import '../../app.css';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';

	let { data, children }: { data: LayoutData; children: () => any } = $props();

	const isLogin = $derived(page.url.pathname === '/console/login');

	const navLinks = [
		{ href: '/console', label: 'Dashboard' },
		{ href: '/console/semesters', label: 'Semesters' },
		{ href: '/console/colleges', label: 'Colleges' },
		{ href: '/console/courses', label: 'Courses' },
		{ href: '/console/staff', label: 'Staff' },
		{ href: '/console/students', label: 'Students' },
		{ href: '/console/notes', label: 'Notes' },
		{ href: '/console/assignments', label: 'Assignments' },
		{ href: '/console/progress', label: 'Progress' }
	];

	// v9 amendment: "Progress" used to only be course-scoped
	// (/console/progress/[courseId], reached via a per-course link, not a
	// standalone list) — now that there's a real top-level overview
	// (/console/progress) with the cross-college dashboard, it belongs in
	// the nav like everything else.
</script>

{#if isLogin}
	{@render children()}
{:else}
	<div class="console-shell">
		<aside class="sidebar">
			<div class="brand">
				<span class="brand-mark">SC</span>
				<span class="brand-name">Console</span>
			</div>

			<nav>
				{#each navLinks as link (link.href)}
					<a href={link.href} class:active={page.url.pathname === link.href}>{link.label}</a>
				{/each}
			</nav>

			<div class="who">
				<div class="who-name">{data.staff?.name}</div>
				<div class="who-role">{data.staff?.role}</div>
				<form method="POST" action="/console/logout">
					<button type="submit" class="logout">Sign out</button>
				</form>
			</div>
		</aside>

		<main class="content">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	.console-shell {
		display: grid;
		grid-template-columns: 220px 1fr;
		min-height: 100vh;
	}

	.sidebar {
		background: var(--surface-2);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		padding: 1.25rem 1rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.brand-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: var(--accent);
		color: white;
		font-weight: 700;
		font-size: 0.75rem;
	}

	.brand-name {
		font-weight: 600;
		color: var(--text);
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
	}

	nav a {
		padding: 0.5rem 0.625rem;
		border-radius: 6px;
		color: var(--text-muted);
		font-size: 0.875rem;
		text-decoration: none;
	}

	nav a:hover {
		background: var(--surface-3);
		color: var(--text);
	}

	nav a.active {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.who {
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
		margin-top: 0.75rem;
	}

	.who-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text);
	}

	.who-role {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
	}

	.logout {
		font-size: 0.8125rem;
		color: var(--text-muted);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}

	.logout:hover {
		color: var(--text);
	}

	.content {
		padding: 2rem;
		background: var(--surface-1);
	}
</style>
