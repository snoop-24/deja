/**
 * Rendered only while lib/mock.ts exports IS_MOCK = true. Deleting the banner
 * is one line there, not a change here.
 */
export function PlaceholderBanner() {
  return (
    <div
      role="status"
      className="border-b border-amber/25 bg-amber-soft px-16 py-3 text-center text-xs font-semibold tracking-[0.18em] text-amber uppercase"
    >
      Placeholder data &mdash; not a real run
    </div>
  );
}
