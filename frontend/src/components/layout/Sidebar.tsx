import {
  Activity,
  AlertTriangle,
  Car,
  LayoutDashboard,
  Map,
  Monitor,
  Shield,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ON_ACCENT } from '../../lib/theme-colors';

const navItems = [
  { to: '/',        label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/live',    label: 'Live Monitoring',   icon: Monitor },
  { to: '/search',  label: 'Vehicle Search',    icon: Car },
  { to: '/map',     label: 'GIS Map',           icon: Map },
  { to: '/alerts',  label: 'Alert Centre',      icon: AlertTriangle },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <aside className={`sidebar${isOpen ? ' open' : ''}`}>
      {/* Logo area */}
      <div
        style={{
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent-green), #0ea5e9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Shield size={16} color={ON_ACCENT} strokeWidth={2.5} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            IVMAP
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            COMMAND CENTRE
          </div>
        </div>
        {/* Close button — only visible on mobile via CSS */}
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="Close sidebar"
          className="sidebar-close-btn"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
        <div
          style={{
            fontSize: '0.62rem',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
            padding: '0 24px 8px',
            textTransform: 'uppercase',
          }}
        >
          Navigation
        </div>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onClose}
          >
            <Icon size={16} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Activity size={12} />
        Gujarat Police CCTV Grid
      </div>
    </aside>
  );
}
