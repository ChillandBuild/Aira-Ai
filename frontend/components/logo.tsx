export function AiraLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="10" fill="#059669" />
      {/* Chat bubble shape */}
      <path
        d="M8.5 12C8.5 10.067 10.067 8.5 12 8.5H24C25.933 8.5 27.5 10.067 27.5 12V19.5C27.5 21.433 25.933 23 24 23H21L18 27.5L15 23H12C10.067 23 8.5 21.433 8.5 19.5V12Z"
        fill="white"
        fillOpacity="0.95"
      />
      {/* Spark dots */}
      <circle cx="14" cy="15.75" r="1.4" fill="#059669" />
      <circle cx="18" cy="15.75" r="1.4" fill="#059669" />
      <circle cx="22" cy="15.75" r="1.4" fill="#059669" />
    </svg>
  );
}
