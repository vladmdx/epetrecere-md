export function GoldDivider() {
  return (
    <div className="flex justify-center py-6">
      <svg width="200" height="20" viewBox="0 0 200 20">
        <line x1="0" y1="10" x2="85" y2="10" stroke="#C9A84C" strokeWidth="1" opacity="0.3" />
        <circle cx="100" cy="10" r="4" fill="#C9A84C" opacity="0.6" />
        <line x1="115" y1="10" x2="200" y2="10" stroke="#C9A84C" strokeWidth="1" opacity="0.3" />
      </svg>
    </div>
  );
}
