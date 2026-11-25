import { defaultLocale } from "$lib/i18n/translations";
import type { CobaltSettings } from "$lib/types/settings";

const defaultSettings: CobaltSettings = {
    schemaVersion: 6,
    advanced: {
        debug: false,
        useWebCodecs: false,
    },
    appearance: {
        theme: "auto",
        language: defaultLocale,
        autoLanguage: true,
        // argon: the remux tab needs in-browser processing (see save.localProcessing)
        hideRemuxTab: true,
    },
    accessibility: {
        reduceMotion: false,
        reduceTransparency: false,
        disableHaptics: false,
        dontAutoOpenQueue: false,
    },
    save: {
        alwaysProxy: false,
        // argon: GitHub Pages can't send the cross-origin isolation headers
        // that in-browser processing relies on, so the server does it instead.
        localProcessing: "disabled",
        audioBitrate: "128",
        audioFormat: "mp3",
        disableMetadata: false,
        downloadMode: "auto",
        filenameStyle: "basic",
        savingMethod: "download",
        allowH265: false,
        tiktokFullAudio: false,
        convertGif: true,
        videoQuality: "1080",
        subtitleLang: "none",
        youtubeVideoCodec: "h264",
        youtubeVideoContainer: "auto",
        youtubeDubLang: "original",
        youtubeHLS: false,
        youtubeBetterAudio: false,
    },
    privacy: {
        disableAnalytics: false,
    },
    processing: {
        customInstanceURL: "",
        customApiKey: "",
        enableCustomInstances: false,
        enableCustomApiKey: false,
        seenCustomWarning: false,
    }
}

export default defaultSettings;
