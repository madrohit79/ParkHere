import React from 'react';

export function EmptyState({ title = 'No items found', description, action, icon }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-surface border border-dashed border-warmgrey rounded-lg my-4">
      {icon || (
        <div className="w-12 h-12 rounded-full bg-cream flex items-center justify-center mb-3 text-charcoalMuted border border-warmgrey">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
      )}
      <h4 className="text-sm font-bold text-charcoal">{title}</h4>
      {description && <p className="text-xs text-charcoalMuted max-w-sm mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
