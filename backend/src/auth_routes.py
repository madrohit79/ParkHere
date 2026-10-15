from flask import Blueprint, request, g
from .db import query, transaction
from .common import ok, fail
from .security import auth_required, token_for, password_hash, password_matches, rate_limit

bp = Blueprint('auth', __name__)

@bp.post('/register')
def register():
    body = request.get_json(silent=True) or {}
    email, password, full_name, role = body.get('email'), body.get('password'), body.get('full_name'), body.get('role')
    phone = body.get('phone')
    if not email or not password or not full_name or not role:
        return fail('Email, password, full name, and role are required')
    if len(password) < 8:
        return fail('Password must be at least 8 characters long')
    if role not in ('customer', 'org_admin', 'owner'):
        return fail('Invalid role. Public registration allows only customer, org_admin, or owner', 403)
    if role == 'org_admin' and (not body.get('org_name') or not body.get('org_identifier')):
        return fail('Organisation name and unique identifier are required for organisation admin')
    if role == 'owner' and not body.get('business_name'):
        return fail('Business name is required for parking owner registration')
    if query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.strip()])['rows']:
        return fail('An account with this email address already exists', 409)
    try:
        with transaction() as tx:
            user = tx.query("""INSERT INTO users (email,password_hash,full_name,phone,role,is_active)
                VALUES ($1,$2,$3,$4,$5,TRUE)
                RETURNING id,email,full_name,phone,role,is_active,created_at""",
                [email.strip().lower(), password_hash(password), full_name.strip(), phone.strip() if phone else None, role])['rows'][0]
            org = owner = None
            if role == 'org_admin':
                org = tx.query("""INSERT INTO organisations (admin_user_id,name,org_identifier,approval_status,is_active)
                    VALUES ($1,$2,$3,'pending',TRUE) RETURNING id,name,org_identifier,approval_status,is_active""",
                    [user['id'], body['org_name'].strip(), body['org_identifier'].strip().upper()])['rows'][0]
            elif role == 'owner':
                owner = tx.query("INSERT INTO owner_profiles (user_id,business_name,approval_status) VALUES ($1,$2,'pending') RETURNING id,business_name,approval_status",
                    [user['id'], body['business_name'].strip()])['rows'][0]
        return ok({'token': token_for(user), 'user': user, 'org': org, 'ownerProfile': owner}, status=201)
    except Exception as exc:
        if getattr(exc, 'pgcode', None) == '23505':
            return fail('An account or organisation identifier already exists', 409)
        raise

@bp.post('/login')
@rate_limit(20, 900, 'Too many login attempts. Please try again after 15 minutes.')
def login():
    body = request.get_json(silent=True) or {}
    email, password = body.get('email'), body.get('password')
    if not email or not password:
        return fail('Email and password are required')
    user = query('SELECT id,email,password_hash,full_name,phone,role,is_active FROM users WHERE LOWER(email)=LOWER($1)', [email.strip()])['rows']
    if not user:
        return fail('Invalid email or password', 401)
    user = user[0]
    if not user['is_active']:
        return fail('This account has been deactivated. Please contact support.', 401)
    if not password_matches(password, user['password_hash']):
        return fail('Invalid email or password', 401)
    org = owner = None
    if user['role'] == 'org_admin':
        found = query('SELECT id,name,org_identifier,approval_status,rejection_reason,is_active FROM organisations WHERE admin_user_id=$1', [user['id']])['rows']
        org = found[0] if found else None
    elif user['role'] == 'owner':
        found = query('SELECT id,business_name,approval_status,rejection_reason FROM owner_profiles WHERE user_id=$1', [user['id']])['rows']
        owner = found[0] if found else None
    user.pop('password_hash', None)
    return ok({'token': token_for(user), 'user': user, 'org': org, 'ownerProfile': owner})

@bp.get('/me')
@auth_required()
def me():
    return ok({'user': g.user, 'org': g.user.get('org'), 'ownerProfile': g.user.get('ownerProfile')})

@bp.put('/change-password')
@auth_required()
def change_password():
    body = request.get_json(silent=True) or {}
    current, new = body.get('current_password'), body.get('new_password')
    if not current or not new:
        return fail('Current password and new password are required')
    if len(new) < 8:
        return fail('New password must be at least 8 characters long')
    found = query('SELECT password_hash FROM users WHERE id=$1', [g.user['id']])['rows']
    if not found or not password_matches(current, found[0]['password_hash']):
        return fail('Current password is incorrect')
    query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2', [password_hash(new), g.user['id']])
    return ok(message='Password updated successfully')

@bp.put('/profile')
@auth_required()
def update_profile():
    body = request.get_json(silent=True) or {}
    if not body.get('full_name'):
        return fail('Full name is required')
    user = query('''UPDATE users SET full_name=$1,phone=$2,updated_at=NOW() WHERE id=$3
        RETURNING id,email,full_name,phone,role,is_active''', [body['full_name'].strip(), body.get('phone').strip() if body.get('phone') else None, g.user['id']])['rows'][0]
    return ok(user)
