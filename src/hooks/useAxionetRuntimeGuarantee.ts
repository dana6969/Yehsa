/**
 * Documented stub.
 *
 * App.tsx imports this hook, but src/ was not in the repository. The original
 * implementation is gone. This function does not keep the app alive, take wake
 * locks, start background work, or guarantee a runtime.
 */
export function useAxionetRuntimeGuarantee(): {
  active: false;
  grantsAccess: false;
  encryption: "none";
  access: "bound-phone";
  reason: string;
} {
  return {
    active: false,
    grantsAccess: false,
    encryption: "none",
    access: "bound-phone",
    reason: "stub: does not attest the phone and does not grant mesh or control access"
  };
}
