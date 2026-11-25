import { readable } from "svelte/store";
import type { Optional } from "./types/generic";
import { browser } from "$app/environment";
import { base } from "$app/paths";

type VersionResponse = {
    commit: string;
    branch: string;
    remote: string;
    version: string;
}

export const version = readable<Optional<VersionResponse>>(
    undefined,
    (set) => {
        if (!browser) return;

        fetch(`${base}/version.json`)
            .then(r => r.json())
            .then(set)
            .catch(() => {})
    }
)
