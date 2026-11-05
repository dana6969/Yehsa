/**
 * Documented stub.
 *
 * App.tsx imports this hook, but src/ was not in the repository. The original
 * implementation is gone. This function does not keep the app alive, take wake
 * locks, start background work, or guarantee a runtime.
 */
export function useAxionetRuntimeGuarantee(): { active: false; reason: string } {
  return {
    active: false,
    reason: "stub: original runtime-guarantee hook is not in this repository"
  };
}
