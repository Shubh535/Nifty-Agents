'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',           icon: '⬡', label: 'Dashboard' },
  { href: '/analysis',   icon: '◎', label: 'Analysis' },
  { href: '/history',    icon: '◷', label: 'History' },
  { href: '/portfolio',  icon: '◈', label: 'Portfolio' },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-text">NiftyAgents</div>
        <div className="logo-sub">AI Trading Framework</div>
      </div>
      <nav>
        {NAV.map(n => (
          <Link
            key={n.href}
            href={n.href}
            className={`nav-item${path === n.href ? ' active' : ''}`}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
