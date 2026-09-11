<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let role = $state<'ADMIN' | 'MODERATOR'>('ADMIN');
</script>

<svelte:head>
	<title>Sign in — Console</title>
</svelte:head>

<div class="login-page">
	<div class="login-card card">
		<div class="brand">
			<span class="brand-mark">SC</span>
			<span>Study Companion Console</span>
		</div>

		<h1>Sign in</h1>
		<p class="subtitle">Staff access only — admin and moderator accounts.</p>

		<div class="role-select" role="radiogroup" aria-label="Account type">
			<button
				type="button"
				class:active={role === 'ADMIN'}
				onclick={() => (role = 'ADMIN')}
				aria-pressed={role === 'ADMIN'}
			>
				Admin
			</button>
			<button
				type="button"
				class:active={role === 'MODERATOR'}
				onclick={() => (role = 'MODERATOR')}
				aria-pressed={role === 'MODERATOR'}
			>
				Moderator
			</button>
		</div>

		<form method="POST" use:enhance>
			<input type="hidden" name="role" value={role} />
			<input type="hidden" name="next" value={page.url.searchParams.get('next') ?? '/console'} />

			<div class="field">
				<label for="name">Name</label>
				<input id="name" name="name" type="text" autocomplete="username" required />
			</div>

			<div class="field">
				<label for="password">Password</label>
				<input id="password" name="password" type="password" autocomplete="current-password" required />
			</div>

			{#if form?.error}
				<p class="error-text">{form.error}</p>
			{/if}

			<button type="submit" class="btn btn-primary submit">Sign in</button>
		</form>
	</div>
</div>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-2);
		padding: 1rem;
	}

	.login-card {
		width: 100%;
		max-width: 360px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 1.25rem;
	}

	.brand-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
		background: var(--accent);
		color: white;
		font-size: 0.6875rem;
		font-weight: 700;
	}

	.subtitle {
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.role-select {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}

	.role-select button {
		padding: 0.5rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface-card);
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
	}

	.role-select button.active {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.submit {
		width: 100%;
		justify-content: center;
		margin-top: 0.25rem;
	}
</style>
