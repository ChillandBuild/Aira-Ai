export function AiraLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Base black circle */}
      <circle cx="18" cy="18" r="17" fill="#18181b" stroke="#18181b" strokeWidth="1" />
      {/* Shaded Quadrants for a premium lens/geometric effect */}
      {/* Top Left */}
      <path d="M18 18V2.5C9.44 2.5 2.5 9.44 2.5 18H18Z" fill="white" fillOpacity="0.12" />
      {/* Top Right */}
      <path d="M18 18H33.5C33.5 9.44 26.56 2.5 18 2.5V18Z" fill="white" fillOpacity="0.22" />
      {/* Bottom Right */}
      <path d="M18 18V33.5C26.56 33.5 33.5 26.56 33.5 18H18Z" fill="white" fillOpacity="0.05" />
      {/* Bottom Left is left plain dark background */}
      {/* Fine dividing lines */}
      <line x1="18" y1="2.5" x2="18" y2="33.5" stroke="#18181b" strokeWidth="1.5" />
      <line x1="2.5" y1="18" x2="33.5" y2="18" stroke="#18181b" strokeWidth="1.5" />
      <line x1="18" y1="2.5" x2="18" y2="33.5" stroke="white" strokeOpacity="0.15" strokeWidth="0.75" />
      <line x1="2.5" y1="18" x2="33.5" y2="18" stroke="white" strokeOpacity="0.15" strokeWidth="0.75" />
    </svg>
  );
}
