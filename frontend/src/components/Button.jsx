import React from 'react';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  loading = false,
  onClick,
  className = '',
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed rounded';

  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base'
  };

  const variantStyles = {
    primary: 'bg-accent text-charcoal hover:bg-yellow-400 border border-yellow-500 shadow-sm focus:ring-amber-500',
    secondary: 'bg-surface text-charcoal hover:bg-surfaceSoft border border-warmgrey shadow-sm focus:ring-stone-400',
    dark: 'bg-charcoal text-white hover:bg-black shadow-sm focus:ring-charcoal',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm focus:ring-rose-500',
    outline: 'border border-charcoal text-charcoal hover:bg-stone-100 focus:ring-charcoal',
    ghost: 'text-charcoal hover:bg-stone-200/50 focus:ring-stone-400'
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
}

export default Button;
