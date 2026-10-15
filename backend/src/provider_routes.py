from flask import Blueprint, request, g
from .db import query
from .common import ok, fail
from .security import auth_required, roles, approved_provider

membership_bp = Blueprint('membership', __name__)
org_bp = Blueprint('org', __name__)
owner_bp = Blueprint('owner', __name__)

@membership_bp.post('/verify')
@auth_required()
@roles('customer')
def verify_membership():
    b=request.get_json(silent=True) or {}; org_identifier=b.get('org_identifier'); member_identifier=b.get('member_identifier'); full_name=b.get('full_name'); email=b.get('email')
    if not all([org_identifier,member_identifier,full_name,email]): return fail('Organisation identifier, member identifier, full name, and email are all required')
    orgs=query('SELECT id,name,is_active,approval_status FROM organisations WHERE UPPER(TRIM(org_identifier))=UPPER(TRIM($1))',[org_identifier.strip()])['rows']
    if not orgs or orgs[0]['approval_status']!='approved' or not orgs[0]['is_active']: return fail('Organisation not found, awaiting approval, or inactive')
    org=orgs[0]
    if query("SELECT cm.id FROM customer_memberships cm JOIN org_members om ON cm.org_member_id=om.id WHERE cm.customer_id=$1 AND om.org_id=$2 AND cm.status='verified'",[g.user['id'],org['id']])['rows']:
        return fail('You already have an active verified membership with this organisation',409)
    members=query("""SELECT id,parking_benefit,is_active FROM org_members WHERE org_id=$1 AND UPPER(TRIM(member_identifier))=UPPER(TRIM($2)) AND LOWER(TRIM(full_name))=LOWER(TRIM($3)) AND LOWER(TRIM(email))=LOWER(TRIM($4))""",[org['id'],member_identifier.strip(),full_name.strip(),email.strip()])['rows']
    if not members: return fail('Submitted details do not match any active member record in this organisation')
    member=members[0]
    if not member['is_active']: return fail('This membership record is currently inactive')
    if query("SELECT id FROM customer_memberships WHERE org_member_id=$1 AND status='verified'",[member['id']])['rows']:
        return fail('This membership record is already linked to another account',409)
    linked=query("INSERT INTO customer_memberships(customer_id,org_member_id,status) VALUES($1,$2,'verified') RETURNING id,customer_id,org_member_id,status,verified_at",[g.user['id'],member['id']])['rows'][0]
    return ok({'membership':linked,'org_name':org['name'],'parking_benefit':member['parking_benefit']},'Organisation membership verified successfully',201)

@membership_bp.get('/status')
@auth_required()
@roles('customer')
def membership_status():
    found=query("""SELECT cm.id AS membership_id,cm.status,cm.verified_at,om.member_identifier,om.parking_benefit,om.is_active AS member_is_active,o.id AS org_id,o.name AS org_name,o.org_identifier
        FROM customer_memberships cm JOIN org_members om ON cm.org_member_id=om.id JOIN organisations o ON om.org_id=o.id WHERE cm.customer_id=$1 ORDER BY cm.verified_at DESC""",[g.user['id']])['rows']
    return ok(found)

@org_bp.get('/profile')
@auth_required()
@roles('org_admin')
def org_profile():
    org=g.user.get('org')
    if not org: return fail('No organisation profile linked to this account',403)
    oid=org['id']
    profile=query('SELECT o.*,u.full_name AS admin_name,u.email AS admin_email FROM organisations o JOIN users u ON o.admin_user_id=u.id WHERE o.id=$1',[oid])['rows']
    locations=query('SELECT COUNT(*) location_count,COALESCE(SUM(public_capacity),0) total_public_capacity,COALESCE(SUM(member_capacity),0) total_member_capacity FROM parking_locations WHERE org_id=$1',[oid])['rows'][0]
    members=query("SELECT COUNT(*) total_members,COUNT(*) FILTER(WHERE is_active=TRUE) active_members,COUNT(*) FILTER(WHERE parking_benefit='free') free_members,COUNT(*) FILTER(WHERE parking_benefit='discounted') discounted_members FROM org_members WHERE org_id=$1",[oid])['rows'][0]
    bookings=query("SELECT COUNT(*) total_bookings,COUNT(*) FILTER(WHERE b.status='pending') pending_bookings,COUNT(*) FILTER(WHERE b.status='active') active_sessions,COUNT(*) FILTER(WHERE b.status='completed') completed_sessions FROM bookings b JOIN parking_locations l ON b.location_id=l.id WHERE l.org_id=$1",[oid])['rows'][0]
    return ok({'profile':profile[0] if profile else None,'locations':locations,'members':members,'bookings':bookings})

@org_bp.get('/members')
@auth_required()
@roles('org_admin')
@approved_provider
def get_members():
    oid=g.user['org']['id']
    return ok(query("""SELECT om.*,cm.customer_id,cm.verified_at,u.email AS linked_customer_email FROM org_members om LEFT JOIN customer_memberships cm ON om.id=cm.org_member_id AND cm.status='verified' LEFT JOIN users u ON cm.customer_id=u.id WHERE om.org_id=$1 ORDER BY om.created_at DESC""",[oid])['rows'])

@org_bp.post('/members')
@auth_required()
@roles('org_admin')
@approved_provider
def add_member():
    b=request.get_json(silent=True) or {}; ident=b.get('member_identifier'); name=b.get('full_name'); email=b.get('email'); benefit=b.get('parking_benefit','standard')
    if not all([ident,name,email]): return fail('Member identifier, full name, and email are required')
    if benefit not in ('free','discounted','standard'): return fail('Parking benefit must be free, discounted, or standard')
    oid=g.user['org']['id']
    if query('SELECT id FROM org_members WHERE org_id=$1 AND UPPER(member_identifier)=UPPER($2)',[oid,ident.strip()])['rows']: return fail('A member with this identifier already exists in your organisation',409)
    result=query("INSERT INTO org_members(org_id,member_identifier,full_name,email,phone,parking_benefit,is_active) VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING *",[oid,ident.strip().upper(),name.strip(),email.strip().lower(),b.get('phone').strip() if b.get('phone') else None,benefit])['rows'][0]
    return ok(result,'Member record added successfully',201)

@org_bp.put('/members/<int:member_id>')
@auth_required()
@roles('org_admin')
@approved_provider
def update_member(member_id):
    b=request.get_json(silent=True) or {}; oid=g.user['org']['id']
    if not query('SELECT id FROM org_members WHERE id=$1 AND org_id=$2',[member_id,oid])['rows']: return fail('Member record not found',404)
    row=query("""UPDATE org_members SET full_name=COALESCE($1,full_name),email=COALESCE($2,email),phone=COALESCE($3,phone),parking_benefit=COALESCE($4,parking_benefit),updated_at=NOW() WHERE id=$5 AND org_id=$6 RETURNING *""",[b.get('full_name').strip() if b.get('full_name') else None,b.get('email').strip().lower() if b.get('email') else None,b.get('phone').strip() if b.get('phone') else None,b.get('parking_benefit'),member_id,oid])['rows'][0]
    return ok(row,'Member record updated successfully')

@org_bp.patch('/members/<int:member_id>/toggle-active')
@auth_required()
@roles('org_admin')
@approved_provider
def toggle_member(member_id):
    oid=g.user['org']['id']; found=query('SELECT is_active FROM org_members WHERE id=$1 AND org_id=$2',[member_id,oid])['rows']
    if not found: return fail('Member record not found',404)
    active=not found[0]['is_active']; row=query('UPDATE org_members SET is_active=$1,updated_at=NOW() WHERE id=$2 AND org_id=$3 RETURNING *',[active,member_id,oid])['rows'][0]
    return ok(row,'Member record '+('reactivated' if active else 'deactivated')+' successfully')

@owner_bp.get('/profile')
@auth_required()
@roles('owner')
def owner_profile():
    uid=g.user['id']
    profile=query('SELECT op.*,u.full_name,u.email,u.phone FROM owner_profiles op JOIN users u ON op.user_id=u.id WHERE op.user_id=$1',[uid])['rows']
    metrics=query("""SELECT COUNT(DISTINCT l.id) location_count,COALESCE(SUM(l.public_capacity),0) total_capacity,COUNT(b.id) total_bookings,COUNT(b.id) FILTER(WHERE b.status='active') active_sessions,COUNT(b.id) FILTER(WHERE b.status='completed') completed_sessions,COALESCE(SUM(inv.total_amount),0.00) total_revenue FROM parking_locations l LEFT JOIN bookings b ON l.id=b.location_id LEFT JOIN invoices inv ON b.id=inv.booking_id WHERE l.owner_id=$1""",[uid])['rows'][0]
    return ok({'profile':profile[0] if profile else None,'metrics':metrics})
