<script>
    import { t } from "$lib/i18n/translations";
</script>

<!-- argon: replaces cobalt's logo, which is copyrighted branding -->
<div id="app-logo" aria-hidden="true">{$t("general.cobalt")}</div>

<style>
    #app-logo {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: calc(var(--sidebar-tab-padding) * 2);

        /* accommodate space for scaling animation */
        padding-bottom: calc(var(--sidebar-tab-padding) * 2 - var(--sidebar-inner-padding));

        color: var(--sidebar-highlight);
        font-family: "Noto Sans Mono", "IBM Plex Mono", monospace;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.5px;
    }

    @media screen and (max-width: 535px) {
        #app-logo {
            display: none;
        }
    }
</style>
