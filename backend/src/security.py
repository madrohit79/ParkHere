"""JWT authentication, role authorization, and arrival-code cryptography."""
import os, hmac, hashlib, secrets, time
from functools import wraps
from datetime import datetime, timedelta, timezone
from flask import request, g, jsonify
import jwt
import bcrypt
from .db import query

JWT_SECRET = os.getenv('JWT_SECRET', 'super_secret_jwt_key_parkhere_college_dbms_2026_secure')
CODE_HMAC_SECRET = os.getenv('CODE_HMAC_SECRET', 'super_secret_arrival_code_hmac_secret_2026_secure_key')
CODE_ENC_KEY = bytes.fromhex(os.getenv('CODE_ENC_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'))


def token_for(user):
    return jwt.encode({'id': user['id'], 'email': user['email'], 'role': user['role'], 'exp': datetime.now(timezone.utc) + timedelta(hours=24)}, JWT_SECRET, algorithm='HS256')


def password_hash(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def password_matches(password, hashed):
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def arrival_code():
    return f'{secrets.randbelow(1_000_000):06d}'


def hash_code(code):
    return hmac.new(CODE_HMAC_SECRET.encode(), str(code).strip().encode(), hashlib.sha256).hexdigest()


def encrypt_code(code):
    # AES-GCM compatibility with the original Node backend.
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = secrets.token_bytes(12)
    payload = AESGCM(CODE_ENC_KEY).encrypt(iv, str(code).strip().encode(), None)
    ciphertext, tag = payload[:-16], payload[-16:]
    return f'{iv.hex()}:{tag.hex()}:{ciphertext.hex()}'


def decrypt_code(value):
    if not value:
        return None
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        iv_hex, tag_hex, cipher_hex = value.split(':')
        return AESGCM(CODE_ENC_KEY).decrypt(bytes.fromhex(iv_hex), bytes.fromhex(cipher_hex) + bytes.fromhex(tag_hex), None).decode()
    except Exception:
        return None


def _load_user(token):
    payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    res = query('SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = $1', [payload['id']])
    if not res['rows'] or not res['rows'][0]['is_active']:
        return None
    user = res['rows'][0]
    if user['role'] == 'org_admin':
        org = query('SELECT id, name, org_identifier, approval_status, rejection_reason, is_active FROM organisations WHERE admin_user_id = $1', [user['id']])['rows']
        user['org'] = org[0] if org else None
    elif user['role'] == 'owner':
        owner = query('SELECT id, business_name, approval_status, rejection_reason FROM owner_profiles WHERE user_id = $1', [user['id']])['rows']
        user['ownerProfile'] = owner[0] if owner else None
    return user


def auth_required(optional=False):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            header = request.headers.get('Authorization', '')
            token = header[7:].strip() if header.startswith('Bearer ') else None
            g.user = None
            if token:
                try:
                    g.user = _load_user(token)
                except (jwt.PyJWTError, KeyError, TypeError, ValueError):
                    g.user = None
                if g.user is None and not optional:
                    return jsonify(success=False, error='Invalid or expired token'), 401
            elif not optional:
                return jsonify(success=False, error='Authentication token required'), 401
            return fn(*args, **kwargs)
        return wrapped
    return decorator


def roles(*allowed):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            user = getattr(g, 'user', None)
            if not user:
                return jsonify(success=False, error='Authentication required'), 401
            if user['role'] not in allowed:
                return jsonify(success=False, error=f"Forbidden: role '{user['role']}' is not authorized to access this resource"), 403
            return fn(*args, **kwargs)
        return wrapped
    return decorator


def approved_provider(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if request.method == 'OPTIONS':
            return fn(*args, **kwargs)
        user = getattr(g, 'user', None)
        if not user:
            return jsonify(success=False, error='Authentication required'), 401
        if user['role'] == 'platform_admin':
            return fn(*args, **kwargs)
        profile = user.get('org') if user['role'] == 'org_admin' else user.get('ownerProfile') if user['role'] == 'owner' else None
        if not profile:
            return jsonify(success=False, error='No provider profile linked to this account'), 403
        if profile.get('approval_status') != 'approved':
            label = 'Organisation' if user['role'] == 'org_admin' else 'Owner'
            return jsonify(success=False, error=f"{label} account is {profile.get('approval_status')}. Pending administrator approval.", approval_status=profile.get('approval_status'), rejection_reason=profile.get('rejection_reason')), 403
        if user['role'] == 'org_admin' and not profile.get('is_active', True):
            return jsonify(success=False, error='Organisation is deactivated'), 403
        return fn(*args, **kwargs)
    return wrapped


_rate_hits = {}

def rate_limit(max_hits, window_seconds, message):
    """Small in-memory sliding-window limiter matching the original API limits."""
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            now = time.monotonic()
            key = (request.remote_addr or 'unknown', request.endpoint or request.path)
            recent = [stamp for stamp in _rate_hits.get(key, []) if now - stamp < window_seconds]
            if len(recent) >= max_hits:
                return jsonify(success=False, error=message), 429
            recent.append(now)
            _rate_hits[key] = recent
            return fn(*args, **kwargs)
        return wrapped
    return decorator
