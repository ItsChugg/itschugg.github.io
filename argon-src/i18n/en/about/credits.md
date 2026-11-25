<script lang="ts">
    import { t } from "$lib/i18n/translations";

    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="cobalt">
<SectionHeading
    title="cobalt"
    sectionId="cobalt"
/>

argon is a modified version of the [cobalt](https://github.com/imputnet/cobalt) web app, made by [imput](https://imput.net/).
argon is not affiliated with or endorsed by imput or cobalt.

if you find it useful, consider supporting the original project at [cobalt.tools](https://cobalt.tools/).
</section>

<section id="changes">
<SectionHeading
    title={$t("about.heading.changes")}
    sectionId="changes"
/>

changes from the original cobalt frontend:
- renamed to argon, with cobalt's logos, mascot art and update banners removed.
- served from the /argon path on itschu.gg and pointed at a private processing server.
- in-browser processing is off by default and the remux tab is hidden, so the processing server does the work.
- removed the donate, updates, community, privacy policy and terms pages, and the russian translation.

the modified source code is in the [itschu.gg repository](https://github.com/ItsChugg/itschugg.github.io/tree/main/argon-src).
</section>

<section id="licenses">
<SectionHeading
    title={$t("about.heading.licenses")}
    sectionId="licenses"
/>

argon's frontend code, like cobalt's, is licensed under [CC-BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
see the [original license](https://github.com/imputnet/cobalt/blob/main/web/LICENSE).

the processing server runs the unmodified cobalt api, licensed under [AGPL-3.0](https://github.com/imputnet/cobalt/blob/main/api/LICENSE).

argon also relies on open source fonts, icons and libraries, including
[svelte](https://svelte.dev), [libav.js](https://github.com/imputnet/libav.js),
[tabler icons](https://tabler.io/icons), ibm plex mono, noto sans mono and redaction.
</section>
