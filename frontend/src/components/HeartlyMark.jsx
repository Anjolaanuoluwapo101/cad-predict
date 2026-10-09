import { useId } from 'react';

// The Heartly icon as an inline SVG (same drawing as public/favicon.svg). Ids are unique per instance.
export default function HeartlyMark({ size = 28, title }) {
  const u = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1F6C9E" /><stop offset="1" stopColor="#0A2740" /></linearGradient>
        <radialGradient id={`${u}g`} cx=".3" cy=".18" r=".8"><stop offset="0" stopColor="#5FB6D6" stopOpacity=".55" /><stop offset="1" stopColor="#5FB6D6" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${u}h`} x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stopColor="#FF8F98" /><stop offset=".55" stopColor="#E9525F" /><stop offset="1" stopColor="#C13446" /></linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${u}b)`} />
      <rect width="64" height="64" rx="15" fill={`url(#${u}g)`} />
      <path d="M32 53C14 41 8 31 8 22.2 8 15 13.4 10.4 19.6 10.4c4.9 0 9.7 2.7 12.4 7.4 2.7-4.7 7.5-7.4 12.4-7.4C50.6 10.4 56 15 56 22.2 56 31 50 41 32 53z" fill={`url(#${u}h)`} />
      <path d="M16 15.5c2.2-2 5-3 7.6-2.7" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4.5 34H19l4.6 0 4.4-12.5 6.2 24L39 29l2.6 5H59.5" fill="none" stroke="#0A2740" strokeOpacity=".35" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 34H19l4.6 0 4.4-12.5 6.2 24L39 29l2.6 5H59.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
