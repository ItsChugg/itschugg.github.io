// argon: the app is served from a sub-path (kit.paths.base, e.g. "/argon").
// Internal code keeps working with root-relative route paths like
// "/settings/video"; these helpers translate at the edges.
import { base } from "$app/paths";

// "/settings/video" -> "/argon/settings/video"
export const withBase = (path: string) => `${base}${path === "/" ? "/" : path}`;

// "/argon/settings/video" -> "/settings/video"
export const routePath = (pathname: string) => {
    if (base && pathname.startsWith(base)) {
        return pathname.slice(base.length) || "/";
    }
    return pathname;
};
