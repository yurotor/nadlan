/** The brand mark: an irregular cadastral parcel outline with its survey point. */
export function ParcelMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 7.2 11 2.8l9.2 3.6-1.4 10.1-7.9 4.7-6.7-4.3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M11 2.8 10.9 21.2M3.5 7.2l15.3 9.3" stroke="currentColor" strokeWidth="1" opacity=".45" />
      <circle cx="12.4" cy="11.6" r="2.1" fill="currentColor" />
    </svg>
  );
}
