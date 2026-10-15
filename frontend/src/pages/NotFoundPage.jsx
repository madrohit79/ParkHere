import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export function NotFoundPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center py-10 px-6">
        <div className="w-16 h-16 rounded-full bg-amber-100 border border-amber-300 mx-auto flex items-center justify-center font-black text-2xl text-amber-900 mb-4">
          404
        </div>
        <h1 className="text-xl font-bold text-charcoal">Page Not Found</h1>
        <p className="text-xs text-charcoalMuted mt-2 leading-relaxed">
          The requested page does not exist or you may not have permission to access it.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/">
            <Button variant="primary" size="sm">
              Back to Home
            </Button>
          </Link>
          <Link to="/search">
            <Button variant="secondary" size="sm">
              Find Parking
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default NotFoundPage;
