import React from 'react';

export function Card({ children, title, subtitle, action, className = '', footer }) {
  return (
    <div className={`bg-surface border border-warmgrey rounded-lg shadow-sm overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="px-5 py-4 border-b border-warmgrey/80 flex items-center justify-between">
          <div>
            {title && <h3 className="text-base font-semibold text-charcoal">{title}</h3>}
            {subtitle && <p className="text-xs text-charcoalMuted mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
      {footer && (
        <div className="px-5 py-3 bg-surfaceSoft border-t border-warmgrey/80">
          {footer}
        </div>
      )}
    </div>
  );
}

export default Card;
