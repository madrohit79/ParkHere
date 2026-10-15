import React from 'react';

export function Table({ headers = [], children, emptyText = 'No records found' }) {
  return (
    <div className="w-full overflow-x-auto border border-warmgrey rounded-lg bg-surface">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-surfaceSoft border-b border-warmgrey text-xs uppercase tracking-wider text-charcoal font-semibold">
            {headers.map((h, idx) => (
              <th key={idx} className="px-4 py-3 font-semibold text-charcoal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-warmgrey/60 text-charcoal">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
