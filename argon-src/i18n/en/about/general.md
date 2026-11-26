<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { withBase } from "$lib/path";

    const instanceSettings = withBase("/settings/instances");

    import SectionHeading from "$components/misc/SectionHeading.svelte";
</script>

<section id="summary">
<SectionHeading
    title={$t("about.heading.summary")}
    sectionId="summary"
/>

Argon saves video, audio, photos and gifs from your favorite websites. paste a link and you're done.

it's a personal, self-hosted tool on [itschu.gg](https://itschu.gg/), built on the open source [cobalt](https://github.com/imputnet/cobalt) project by imput.
</section>

<section id="access">
<SectionHeading
    title={$t("about.heading.access")}
    sectionId="access"
/>

Argon's processing server only accepts requests with an access key.
if you have one, add it in [instance settings]({instanceSettings}).
</section>

<section id="privacy-efficiency">
<SectionHeading
    title={$t("about.heading.privacy_efficiency")}
    sectionId="privacy-efficiency"
/>

the processing server doesn't store downloaded files. if a file needs extra processing,
it's either done on your device or streamed straight to you without being saved on the server's disk.
</section>
