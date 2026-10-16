import os, logging, threading, time
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from flask_cors import CORS
from psycopg2 import Error as PsycopgError
from .db import query, clean, close_pool
from .common import fail, HTTPProblem
from .auth_routes import bp as auth_bp
from .location_routes import bp as locations_bp
from .provider_routes import membership_bp, org_bp, owner_bp
from .booking_routes import bp as bookings_bp
from .payment_routes import bp as payments_bp
from .admin_routes import bp as admin_bp


def create_app():
    app=Flask(__name__)
    app.url_map.strict_slashes = False
    app.config['JSON_SORT_KEYS']=False
    cors_env = os.getenv('CORS_ORIGIN', '')
    if cors_env == '*':
        origins = '*'
    else:
        env_origins = [o.strip() for o in cors_env.split(',') if o.strip()]
        origins = list(set(env_origins + ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'null']))
    CORS(app, resources={r'/api/*': {'origins': origins}}, supports_credentials=True)
    app.register_blueprint(auth_bp,url_prefix='/api/auth')
    app.register_blueprint(locations_bp,url_prefix='/api/locations')
    app.register_blueprint(membership_bp,url_prefix='/api/membership')
    app.register_blueprint(bookings_bp,url_prefix='/api/bookings')
    app.register_blueprint(payments_bp,url_prefix='/api/payments')
    app.register_blueprint(org_bp,url_prefix='/api/org')
    app.register_blueprint(owner_bp,url_prefix='/api/owner')
    app.register_blueprint(admin_bp,url_prefix='/api/admin')

    @app.get('/api/health')
    def health():
        try:
            result=query('SELECT NOW() AS current_time')['rows'][0]
            return jsonify(clean({'status':'ok','app':'ParkHere Parking Management API','server_time':result['current_time']}))
        except Exception:
            return jsonify({'status':'error','app':'ParkHere Parking Management API','error':'Database connection unavailable'}),503

    @app.errorhandler(HTTPProblem)
    def handle_http_problem(exc):
        return jsonify({'success':False,'error':exc.message}),exc.status

    @app.errorhandler(404)
    def not_found(_exc):
        if request.path.startswith('/api/'):
            return jsonify({'success':False,'error':f"API endpoint '{request.path}' not found"}),404
        return jsonify({'success':False,'error':'Not found'}),404

    @app.errorhandler(Exception)
    def handle_error(exc):
        logging.exception('Unhandled API exception',exc_info=exc)
        if app.testing:
            raise exc
        # Never return SQL, connection strings, or secrets to clients.
        if getattr(exc,'pgcode',None)=='23505':
            return jsonify({'success':False,'error':'A record with these details already exists'}),409
        if getattr(exc,'pgcode',None)=='23503':
            return jsonify({'success':False,'error':'This operation conflicts with related records'}),409
        return jsonify({'success':False,'error':'Internal server error'}),500

    return app

app=create_app()


def _expiry_worker():
    while True:
        time.sleep(30)
        try:
            query('SELECT expire_overdue_bookings()')
        except Exception as exc:
            logging.warning('Booking expiry sweep failed: %s',exc)

if os.getenv('DISABLE_EXPIRY_WORKER','0')!='1':
    worker=threading.Thread(target=_expiry_worker,name='booking-expiry',daemon=True)
    worker.start()

if __name__=='__main__':
    port=int(os.getenv('PORT','5000'))
    app.run(host='0.0.0.0',port=port,debug=os.getenv('FLASK_DEBUG','0')=='1')
