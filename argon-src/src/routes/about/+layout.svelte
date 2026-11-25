<script lang="ts">
    import { t } from "$lib/i18n/translations";

    import PageNav from "$components/subnav/PageNav.svelte";

    import PageNavTab from "$components/subnav/PageNavTab.svelte";
    import PageNavSection from "$components/subnav/PageNavSection.svelte";

    import IconComet from "@tabler/icons-svelte/IconComet.svelte";
    import IconHeartHandshake from "@tabler/icons-svelte/IconHeartHandshake.svelte";
</script>

<PageNav
    pageName="about"
    homeNavPath="/about"
    homeTitle={$t("tabs.about")}
    contentPadding
    wideContent
>
    <svelte:fragment slot="navigation">
        <PageNavSection>
            <PageNavTab
                path="/about/general"
                title={$t("about.page.general")}
                icon={IconComet}
                iconColor="blue"
            />
        </PageNavSection>

        <PageNavSection>
            <PageNavTab
                path="/about/credits"
                title={$t("about.page.credits")}
                icon={IconHeartHandshake}
                iconColor="magenta"
            />
        </PageNavSection>
    </svelte:fragment>

    <slot slot="content"></slot>
</PageNav>
