/**
 * Storage port for the member's in-progress browser draft — the live editing
 * session that useSopPrototypeStore's zustand `persist` middleware autosaves.
 *
 * This is a distinct concern from SopRepository (sop-repository.ts): a draft
 * is just whatever is currently on this member's screen in this browser. It
 * is not versioned, not identity-tagged, and never visible to another role —
 * a SopRecord (created via SopRepository) is the thing another role could
 * someday list and open. The Store depends on this interface (and the
 * storage key below), not on `window.localStorage` or a hardcoded key string,
 * directly.
 */
export interface SopDraftStorage {
    getItem(name: string): string | null;
    setItem(name: string, value: string): void;
    removeItem(name: string): void;
}

/** The raw storage surface this adapter wraps — matches window.localStorage's
 *  relevant methods, so a test can inject a fake (including one that throws)
 *  instead of requiring a real browser `window`. */
export type RawKeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Single source of truth for the draft's persist key — the Store imports this
 *  rather than repeating the literal string in its `persist({ name: ... })` config. */
export const SOP_DRAFT_STORAGE_KEY = 'sop-prototype-storage';

const NOOP_DRAFT_STORAGE: SopDraftStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};

/**
 * Wraps a raw storage (window.localStorage by default) so a thrown
 * SecurityError (storage blocked — private browsing, a sandboxed iframe,
 * disabled cookies) or QuotaExceededError (storage full) never crashes the
 * Store or the screen. Each method degrades to a safe no-op/null for that one
 * call instead of throwing — the member's in-memory document state is
 * untouched either way; only the browser-persisted copy of it may lag behind.
 */
export function createSafeDraftStorage(raw: RawKeyValueStorage): SopDraftStorage {
    return {
        getItem: (name) => {
            try {
                return raw.getItem(name);
            } catch (error) {
                console.warn('[SopDraftStorage] getItem failed; reading as empty rather than crashing.', error);
                return null;
            }
        },
        setItem: (name, value) => {
            try {
                raw.setItem(name, value);
            } catch (error) {
                console.warn('[SopDraftStorage] setItem failed; this draft was not persisted to the browser, but in-memory state is unaffected.', error);
            }
        },
        removeItem: (name) => {
            try {
                raw.removeItem(name);
            } catch (error) {
                console.warn('[SopDraftStorage] removeItem failed.', error);
            }
        },
    };
}

/**
 * Resolves the raw browser storage createBrowserSopDraftStorage should wrap.
 * Reading `window.localStorage` is itself a property-getter access that can
 * throw a SecurityError in some browser configurations (e.g. certain private
 * browsing modes, storage fully disabled, some sandboxed iframes) - this is a
 * different failure point than a throw inside getItem/setItem/removeItem
 * (which createSafeDraftStorage already handles), and calling code must not
 * assume merely reading this property is safe. Exposed so tests can inject a
 * resolver that reproduces that exact failure without a real browser.
 */
function defaultResolveBrowserStorage(): RawKeyValueStorage | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
}

/**
 * Default draft storage: the browser's localStorage when available (wrapped
 * with createSafeDraftStorage so a thrown exception degrades to a no-op
 * instead of crashing), a no-op stub during SSR (or any non-browser test
 * environment) so the Store never has to branch on `typeof window` itself.
 * The resolver call itself is also guarded - see defaultResolveBrowserStorage's
 * docstring for why reading `window.localStorage` is not safe to assume.
 */
export function createBrowserSopDraftStorage(resolveStorage: () => RawKeyValueStorage | null = defaultResolveBrowserStorage): SopDraftStorage {
    let raw: RawKeyValueStorage | null;
    try {
        raw = resolveStorage();
    } catch (error) {
        console.warn('[SopDraftStorage] Reading the browser storage itself failed; falling back to an in-memory no-op.', error);
        return NOOP_DRAFT_STORAGE;
    }
    if (!raw) return NOOP_DRAFT_STORAGE;
    return createSafeDraftStorage(raw);
}
