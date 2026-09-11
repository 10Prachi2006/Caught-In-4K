import { CheckCircle, Menu, Moon, Sun, User } from 'lucide-react';
import { useTheme } from '../../lib/ThemeContext';
import { ACCENT_BLUE, ACCENT_GREEN, ON_ACCENT } from '../../lib/theme-colors';

interface TopBarProps {
  onHamburgerClick: () => void;
}

export function TopBar({ onHamburgerClick }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="topbar">
      {/* Hamburger — visible only on tablet/phone via CSS */}
      <button
        className="hamburger-btn"
        onClick={onHamburgerClick}
        aria-label="Toggle navigation"
      >
        <Menu size={18} strokeWidth={2} />
      </button>

      {/* Left spacer */}
      <div style={{ flex: 1 }} />

      {/* System health badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 99,
          background: 'var(--accent-green-dim)',
          border: '1px solid rgba(34,211,165,0.2)',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--accent-green)',
          letterSpacing: '0.02em',
          flexShrink: 0,
        }}
      >
        <CheckCircle size={12} strokeWidth={2.5} />
        <span className="system-health-label">All Systems Operational</span>
      </div>

      {/* Theme toggle */}
      <button
        className="theme-toggle-btn"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {theme === 'dark' ? (
          <Sun size={15} strokeWidth={2} />
        ) : (
          <Moon size={15} strokeWidth={2} />
        )}
      </button>

      {/* User badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${ACCENT_BLUE}, ${ACCENT_GREEN})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <User size={13} color={ON_ACCENT} strokeWidth={2.5} />
        </div>
        <div className="user-info">
          <div style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>
            Operator
          </div>
          <div
            style={{
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
              lineHeight: 1.2,
              letterSpacing: '0.04em',
            }}
          >
            LEVEL-2 ACCESS
          </div>
        </div>
      </div>
    </header>
  );
}
