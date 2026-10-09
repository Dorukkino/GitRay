/** Re-mounted on every navigation, so each page slides in (CSS only: visible before JavaScript loads). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter">{children}</div>;
}
