<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { pwaInfo } from 'virtual:pwa-info';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(async () => {
		const { registerSW } = await import('virtual:pwa-register');

		registerSW({
			immediate: true
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{@html pwaInfo?.webManifest?.linkTag ?? ''}
</svelte:head>

{@render children()}