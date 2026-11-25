<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { defaultNavPage } from "$lib/subnav";
    import { withBase, routePath } from "$lib/path";

    onMount(() => {
        if (page.error?.message === "Not Found") {
            if (routePath(page.url.pathname).startsWith("/settings")) {
                goto(withBase(defaultNavPage("settings")), { replaceState: true });
            } else if (routePath(page.url.pathname).startsWith("/about")) {
                goto(withBase(defaultNavPage("about")), { replaceState: true });
            } else {
                goto(withBase("/"), { replaceState: true });
            }
        }
    });
</script>
