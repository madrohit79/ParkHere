from flask import Blueprint, request, g
from .db import query
from .common import ok, fail
from .security import auth_required, roles

bp=Blueprint('admin',__name__)

@bp.before_request
@auth_required()
@roles('platform_admin')
def guard_admin():
    if request.method == 'OPTIONS':
        return None
    return None

@bp.get('/stats')
def stats():
    users=query("SELECT COUNT(*) total_users,COUNT(*) FILTER(WHERE role='customer') customers_count,COUNT(*) FILTER(WHERE role='owner') owners_count,COUNT(*) FILTER(WHERE role='org_admin') org_admins_count,COUNT(*) FILTER(WHERE is_active=FALSE) deactivated_users_count FROM users")['rows'][0]
    providers=query("SELECT (SELECT COUNT(*) FROM organisations WHERE approval_status='pending') pending_orgs,(SELECT COUNT(*) FROM owner_profiles WHERE approval_status='pending') pending_owners,(SELECT COUNT(*) FROM organisations WHERE approval_status='approved') approved_orgs,(SELECT COUNT(*) FROM owner_profiles WHERE approval_status='approved') approved_owners")['rows'][0]
    locations=query("SELECT COUNT(*) total_locations,COUNT(*) FILTER(WHERE is_active=TRUE) active_locations,COUNT(*) FILTER(WHERE is_demo=TRUE) demo_locations FROM parking_locations")['rows'][0]
    bookings=query("SELECT COUNT(*) total_bookings,COUNT(*) FILTER(WHERE status='pending') pending_bookings,COUNT(*) FILTER(WHERE status='active') active_sessions,COUNT(*) FILTER(WHERE status='completed') completed_bookings,COUNT(*) FILTER(WHERE status='expired') expired_bookings,COUNT(*) FILTER(WHERE status='cancelled') cancelled_bookings FROM bookings")['rows'][0]
    revenue=query('SELECT COALESCE(SUM(total_amount),0.00) gross_revenue FROM invoices')['rows'][0]
    return ok({'users':users,'providers':providers,'locations':locations,'bookings':bookings,'revenue':revenue})

@bp.get('/providers/pending')
def pending_providers():
    orgs=query('SELECT o.*,u.full_name AS admin_name,u.email AS admin_email,u.phone AS admin_phone FROM organisations o JOIN users u ON o.admin_user_id=u.id ORDER BY o.created_at ASC')['rows']
    owners=query('SELECT op.*,u.full_name,u.email,u.phone FROM owner_profiles op JOIN users u ON op.user_id=u.id ORDER BY op.created_at ASC')['rows']
    return ok({'organisations':orgs,'owners':owners})

@bp.post('/organisations/<int:item_id>/approve')
def approve_org(item_id):
    row=query("UPDATE organisations SET approval_status='approved',rejection_reason=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[item_id])['rows']
    return ok(row[0],'Organisation approved successfully') if row else fail('Organisation not found',404)

@bp.post('/organisations/<int:item_id>/reject')
def reject_org(item_id):
    b=request.get_json(silent=True) or {}; row=query("UPDATE organisations SET approval_status='rejected',rejection_reason=$1,updated_at=NOW() WHERE id=$2 RETURNING *",[(b.get('reason') or 'Application does not meet platform criteria').strip(),item_id])['rows']
    return ok(row[0],'Organisation rejected') if row else fail('Organisation not found',404)

@bp.post('/owners/<int:item_id>/approve')
def approve_owner(item_id):
    row=query("UPDATE owner_profiles SET approval_status='approved',rejection_reason=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[item_id])['rows']
    return ok(row[0],'Owner approved successfully') if row else fail('Owner profile not found',404)

@bp.post('/owners/<int:item_id>/reject')
def reject_owner(item_id):
    b=request.get_json(silent=True) or {}; row=query("UPDATE owner_profiles SET approval_status='rejected',rejection_reason=$1,updated_at=NOW() WHERE id=$2 RETURNING *",[(b.get('reason') or 'Owner application rejected').strip(),item_id])['rows']
    return ok(row[0],'Owner profile rejected') if row else fail('Owner profile not found',404)

@bp.get('/users')
def users():
    return ok(query('SELECT id,email,full_name,phone,role,is_active,created_at FROM users ORDER BY created_at DESC')['rows'])

@bp.patch('/users/<int:item_id>/toggle-active')
def toggle_user(item_id):
    if item_id==g.user['id']: return fail('Administrator cannot deactivate own account')
    row=query('SELECT is_active FROM users WHERE id=$1',[item_id])['rows']
    if not row: return fail('User not found',404)
    active=not row[0]['is_active']; updated=query('UPDATE users SET is_active=$1,updated_at=NOW() WHERE id=$2 RETURNING id,email,full_name,role,is_active',[active,item_id])['rows'][0]
    return ok(updated,'User '+('reactivated' if active else 'deactivated')+' successfully')

@bp.get('/locations')
def locations():
    return ok(query('''SELECT l.*,t.hourly_rate,t.daily_rate,t.overtime_rate_per_minute,u.full_name AS owner_name,o.name AS org_name FROM parking_locations l LEFT JOIN location_tariffs t ON l.id=t.location_id LEFT JOIN users u ON l.owner_id=u.id LEFT JOIN organisations o ON l.org_id=o.id ORDER BY l.created_at DESC''')['rows'])

@bp.patch('/locations/<int:item_id>/toggle-active')
def toggle_location(item_id):
    row=query('SELECT is_active FROM parking_locations WHERE id=$1',[item_id])['rows']
    if not row: return fail('Location not found',404)
    active=not row[0]['is_active']; updated=query('UPDATE parking_locations SET is_active=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[active,item_id])['rows'][0]
    return ok(updated,'Location '+('activated' if active else 'deactivated')+' successfully')

@bp.get('/bookings')
def bookings():
    return ok(query('''SELECT b.id,b.booking_reference,b.pool,b.vehicle_type,b.vehicle_number,b.start_time,b.end_time,b.status,b.created_at,u.full_name AS customer_name,u.email AS customer_email,l.name AS location_name,inv.total_amount,pay.status AS payment_status FROM bookings b JOIN users u ON b.customer_id=u.id JOIN parking_locations l ON b.location_id=l.id LEFT JOIN invoices inv ON b.id=inv.booking_id LEFT JOIN payments pay ON inv.id=pay.invoice_id ORDER BY b.created_at DESC LIMIT 100''')['rows'])
