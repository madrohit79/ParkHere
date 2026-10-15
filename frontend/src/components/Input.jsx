import React from 'react';

export function Input({
  label,
  id,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  helperText,
  required = false,
  disabled = false,
  className = '',
  ...props
}) {
  const inputId = id || name;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-charcoal mb-1">
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`w-full px-3 py-2 text-sm bg-surface text-charcoal border rounded transition-colors placeholder:text-charcoalMuted/60 disabled:bg-stone-100 disabled:cursor-not-allowed ${
          error
            ? 'border-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
            : 'border-warmgrey focus:border-amber-600 focus:ring-1 focus:ring-amber-500'
        }`}
        {...props}
      />
      {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-charcoalMuted mt-1">{helperText}</p>}
    </div>
  );
}

export function Select({
  label,
  id,
  name,
  value,
  onChange,
  options = [],
  error,
  helperText,
  required = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  const selectId = id || name;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-charcoal mb-1">
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
      )}
      <select
        id={selectId}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className={`w-full px-3 py-2 text-sm bg-surface text-charcoal border rounded transition-colors disabled:bg-stone-100 disabled:cursor-not-allowed ${
          error
            ? 'border-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
            : 'border-warmgrey focus:border-amber-600 focus:ring-1 focus:ring-amber-500'
        }`}
        {...props}
      >
        {children || options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-charcoalMuted mt-1">{helperText}</p>}
    </div>
  );
}

export default Input;
