import secrets, time
from datetime import datetime, timezone
from flask import Blueprint, request, g
from .db import query
from .common import ok, fail
from .security import auth_required, roles

bp=Blueprint('payments',__name__)

@bp.post('/<int:payment_id>/simulate')
@auth_required()
@roles('customer')
def simulate(payment_id):
    b=request.get_json(silent=True) or {}; outcome=b.get('outcome','success'); method=b.get('method','simulated_upi')
    found=query('SELECT p.*,b.customer_id FROM payments p JOIN bookings b ON p.booking_id=b.id WHERE p.id=$1',[payment_id])['rows']
    if not found: return fail('Payment record not found',404)
    p=found[0]
    if p['customer_id']!=g.user['id'] and g.user['role']!='platform_admin': return fail('Forbidden: this payment does not belong to your account',403)
    if p['status']=='paid': return fail('Payment has already been marked as paid and cannot be changed')
    status='paid' if outcome=='success' else 'failed'; ref=f"TXN-SIM-{int(time.time()*1000):x}-{secrets.randbelow(9000)+1000}".upper()
    paid=datetime.now(timezone.utc) if status=='paid' else None
    row=query('UPDATE payments SET status=$1,payment_method=$2,transaction_ref=$3,paid_at=$4,updated_at=NOW() WHERE id=$5 RETURNING *',[status,method,ref,paid,payment_id])['rows'][0]
    return ok(row,'Payment simulated successfully' if status=='paid' else 'Payment simulation marked as failed (retryable)')

@bp.get('/<int:payment_id>')
@auth_required()
def payment_detail(payment_id):
    found=query('''SELECT p.*,inv.total_amount,inv.base_amount,inv.overtime_amount,inv.addons_amount,b.booking_reference,b.customer_id FROM payments p JOIN invoices inv ON p.invoice_id=inv.id JOIN bookings b ON p.booking_id=b.id WHERE p.id=$1''',[payment_id])['rows']
    if not found: return fail('Payment not found',404)
    if found[0]['customer_id']!=g.user['id'] and g.user['role']!='platform_admin': return fail('Forbidden: this payment does not belong to your account',403)
    found[0].pop('customer_id',None)
    return ok(found[0])
