"""Reservation lifecycle endpoints. Capacity checks are serialized with SELECT ... FOR UPDATE."""
import secrets, time
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, g
from .db import query, transaction
from .common import ok, fail, HTTPProblem
from .security import auth_required, roles, approved_provider, arrival_code, hash_code, encrypt_code, decrypt_code, rate_limit
from .utils import RATE_COLUMNS, parse_datetime, calculate_end_time, arrival_window, validate_operating_hours, base_amount, overtime, total_bill

bp=Blueprint('bookings',__name__)


def _location_owner_allowed(loc):
    u=g.user
    return (u['role']=='platform_admin' or (u['role']=='owner' and loc.get('owner_id')==u['id']) or (u['role']=='org_admin' and u.get('org') and loc.get('org_id')==u['org']['id']))


def _membership(customer_id, org_id):
    if not org_id: return None
    found=query("""SELECT om.parking_benefit FROM customer_memberships cm JOIN org_members om ON cm.org_member_id=om.id JOIN organisations o ON om.org_id=o.id
        WHERE cm.customer_id=$1 AND om.org_id=$2 AND cm.status='verified' AND om.is_active=TRUE AND o.is_active=TRUE AND o.approval_status='approved'""",[customer_id,org_id])['rows']
    return found[0]['parking_benefit'] if found else None


def _get_location_tariff(db, location_id, lock=False):
    suffix=' FOR UPDATE OF l' if lock else ''
    return db.query(f"SELECT l.*,t.hourly_rate,t.daily_rate,t.weekly_rate,t.monthly_rate,t.overtime_rate_per_minute,t.member_discount_percent FROM parking_locations l JOIN location_tariffs t ON l.id=t.location_id WHERE l.id=$1{suffix}",[location_id])['rows']


def _estimate(body, user):
    location_id=body.get('location_id'); rate_type=body.get('rate_type'); quantity=body.get('quantity')
    if not location_id or not rate_type or not quantity: return None, ('Location ID, rate type, and quantity are required',400)
    locs=query('SELECT l.*,t.hourly_rate,t.daily_rate,t.weekly_rate,t.monthly_rate,t.overtime_rate_per_minute,t.member_discount_percent FROM parking_locations l JOIN location_tariffs t ON l.id=t.location_id WHERE l.id=$1 AND l.is_active=TRUE',[int(location_id)])['rows']
    if not locs: return None,('Location not found or inactive',404)
    loc=locs[0]; col=RATE_COLUMNS.get(rate_type); price=loc.get(col) if col else None
    if price is None: return None,(f'This location does not offer {rate_type} pricing',400)
    try:
        qty=int(quantity)
    except (TypeError, ValueError):
        return None, ('Quantity must be a positive integer', 400)
    if qty < 1 or qty > 100:
        return None, ('Quantity must be a positive integer', 400)
    start=parse_datetime(body.get('start_time'))
    end=calculate_end_time(start,rate_type,qty)
    if not loc['is_24_7']:
        check=validate_operating_hours(start,end,loc)
        if not check['valid']: return None,(check['message'],400)
    benefit='none'; discount=0
    if body.get('pool')=='member':
        if not user or user['role']!='customer': return None,('Member pool requires customer sign-in',403)
        benefit=_membership(user['id'],loc.get('org_id'))
        if not benefit: return None,('You are not a verified active member of this organisation',403)
        discount=float(loc.get('member_discount_percent') or 0) if benefit=='discounted' else 0
    base=base_amount(price,qty,benefit,discount); addons=[]; addon_total=0
    codes=body.get('facility_codes') or []
    if codes:
        found=query("SELECT lf.facility_code,f.name,lf.price FROM location_facilities lf JOIN facilities f ON f.code=lf.facility_code WHERE lf.location_id=$1 AND lf.facility_code=ANY($2::text[]) AND lf.is_offered=TRUE",[int(location_id),codes])['rows']
        for row in found:
            price_add=float(row['price']); addon_total+=price_add; addons.append({'code':row['facility_code'],'name':row['name'],'price':price_add})
    return {'unit_price':float(price),'quantity':qty,'rate_type':rate_type,'benefit_applied':benefit,'discount_percent':discount,'base_amount':base,'addons_amount':round(addon_total,2),'addons':addons,'overtime_rate_per_minute':float(loc['overtime_rate_per_minute']),'total_amount':total_bill(base,0,addon_total)},None


@bp.post('/estimate')
@auth_required(optional=True)
def estimate_booking():
    if g.user and g.user['role']=='org_admin': return fail('Organization administrators are not authorized to access customer booking estimation.',403)
    body=request.get_json(silent=True) or {}; result,error=_estimate(body,g.user)
    if error: return fail(error[0],error[1])
    return ok(result)


@bp.post('')
@bp.post('/')
@auth_required()
@roles('customer')
def create_booking():
    b=request.get_json(silent=True) or {}
    location_id=b.get('location_id'); pool=b.get('pool','public'); vehicle_type=b.get('vehicle_type'); vehicle_number=b.get('vehicle_number'); rate_type=b.get('rate_type'); qty=b.get('quantity',1); start=parse_datetime(b.get('start_time'))
    if not all([location_id,vehicle_type,vehicle_number,rate_type]): return fail('Location ID, vehicle type, vehicle number, and rate type are required')
    if pool not in ('public','member'): return fail('Pool must be either public or member')
    try: qty=int(qty)
    except (ValueError,TypeError): return fail('Quantity must be a positive integer')
    if qty<1 or qty>100: return fail('Quantity must be a positive integer')
    now=datetime.now(timezone.utc)
    if start < now-timedelta(minutes=10): return fail('Start time cannot be in the past')
    if start > now+timedelta(days=7): return fail('Advance bookings are permitted up to 7 days ahead only')
    try: end=calculate_end_time(start,rate_type,qty)
    except ValueError as exc: return fail(str(exc))
    try:
        with transaction() as tx:
            tx.query('SELECT expire_overdue_bookings()')
            locs=_get_location_tariff(tx,int(location_id),True)
            if not locs: raise HTTPProblem(404,'Parking location not found')
            loc=locs[0]
            if not loc['is_active']: raise HTTPProblem(400,'This parking location is currently inactive')
            if loc['provider_type']=='owner':
                op=tx.query('SELECT approval_status FROM owner_profiles WHERE user_id=$1',[loc['owner_id']])['rows']
                if not op or op[0]['approval_status']!='approved': raise HTTPProblem(403,'Location provider is not currently approved')
            elif loc['provider_type']=='org':
                org=tx.query('SELECT approval_status,is_active FROM organisations WHERE id=$1',[loc['org_id']])['rows']
                if not org or org[0]['approval_status']!='approved' or not org[0]['is_active']: raise HTTPProblem(403,'Organisation provider is not approved or is inactive')
            if not tx.query('SELECT 1 FROM location_vehicle_types WHERE location_id=$1 AND vehicle_type=$2',[loc['id'],vehicle_type])['rows']:
                raise HTTPProblem(400,f"Vehicle type '{vehicle_type}' is not supported at this location")
            if not loc['is_24_7']:
                check=validate_operating_hours(start,end,loc)
                if not check['valid']: raise HTTPProblem(400,check['message'])
            col=RATE_COLUMNS.get(rate_type); rate=loc.get(col) if col else None
            if rate is None: raise HTTPProblem(400,f"Rate type '{rate_type}' is not offered at this location")
            benefit='none'; discount=0
            if pool=='member':
                if not loc.get('org_id'): raise HTTPProblem(400,'Private owner locations do not have a member pool')
                benefit=_membership(g.user['id'],loc['org_id'])
                if not benefit: raise HTTPProblem(403,'You must have an active verified membership with this organisation to book from the member pool')
                discount=float(loc.get('member_discount_percent') or 0) if benefit=='discounted' else 0
            capacity=int(loc['member_capacity'] if pool=='member' else loc['public_capacity'])
            if capacity<=0: raise HTTPProblem(409,f'No {pool} capacity exists at this location')
            occupied=int(tx.query('SELECT COUNT(*) AS occ_count FROM v_occupying_bookings WHERE location_id=$1 AND pool=$2 AND occ_start<$3 AND occ_end>$4',[loc['id'],pool,end,start])['rows'][0]['occ_count'])
            if occupied>=capacity: raise HTTPProblem(409,f'Location is fully booked for the requested time interval in the {pool} pool ({occupied}/{capacity} occupied)')
            addons=[]; addons_total=0
            for f in (b.get('facility_codes') or []):
                found=tx.query('SELECT facility_code,price FROM location_facilities WHERE location_id=$1 AND facility_code=$2 AND is_offered=TRUE',[loc['id'],f])['rows']
                if found:
                    p=float(found[0]['price']); addons_total+=p; addons.append({'code':found[0]['facility_code'],'price':p})
            base=base_amount(rate,qty,benefit,discount); over=float(loc.get('overtime_rate_per_minute') or 1)
            window_start,deadline=arrival_window(start,now)
            reference=f"PH-{int(time.time()*1000):x}-{secrets.token_hex(2).upper()}".upper()
            booking=tx.query("""INSERT INTO bookings(booking_reference,customer_id,location_id,pool,vehicle_type,vehicle_number,start_time,end_time,status,arrival_window_start,arrival_deadline,code_hash,code_encrypted,rate_type,quantity,unit_price_snapshot,benefit_applied,discount_percent_snapshot,base_amount_snapshot,overtime_rate_snapshot)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,NULL,NULL,$11,$12,$13,$14,$15,$16,$17) RETURNING *""",[reference,g.user['id'],loc['id'],pool,vehicle_type,vehicle_number.strip().upper(),start,end,window_start,deadline,rate_type,qty,float(rate),benefit,discount,base,over])['rows'][0]
            for addon in addons: tx.query('INSERT INTO booking_addons(booking_id,facility_code,price_snapshot) VALUES($1,$2,$3)',[booking['id'],addon['code'],addon['price']])
            result={**booking,'arrival_code':None,'addons':addons,'addons_amount':round(addons_total,2),'total_estimate':total_bill(base,0,addons_total),'server_time':now}
        return ok(result,'Booking created successfully. Please obtain your gate entry code from the gate operator upon arrival.',201)
    except HTTPProblem as exc: return fail(exc.message,exc.status)
    except Exception as exc:
        if getattr(exc,'pgcode',None)=='23505': return fail('Booking could not be created because a conflicting reservation exists. Please retry.',409)
        raise


def expire_and_complete_overdue_sessions():
    """
    Idempotent transition for overdue bookings:
    1. Pending bookings past arrival_deadline -> status = 'expired'
    2. Active sessions past scheduled end_time -> status = 'completed', with invoice and pending payment
    """
    completed_count = 0
    try:
        query("SELECT expire_overdue_bookings()")
        overdue_active = query("""
            SELECT b.id, b.end_time, b.start_time, b.customer_id, b.assigned_spot,
                   b.base_amount_snapshot, b.overtime_rate_snapshot,
                   s.id AS session_id, s.entry_time, s.exit_time
            FROM bookings b
            LEFT JOIN parking_sessions s ON s.booking_id = b.id
            WHERE b.status = 'active' AND b.end_time <= NOW()
        """)['rows']

        for row in overdue_active:
            bid = row['id']
            try:
                with transaction() as tx:
                    locked = tx.query("SELECT * FROM bookings WHERE id = $1 AND status = 'active' FOR UPDATE", [bid])['rows']
                    if not locked:
                        continue
                    b = locked[0]

                    sess = tx.query("SELECT * FROM parking_sessions WHERE booking_id = $1 FOR UPDATE", [bid])['rows']
                    if not sess:
                        sess_row = tx.query("""
                            INSERT INTO parking_sessions(booking_id, entry_time, exit_time, verified_by_user_id, spot_label, notes)
                            VALUES($1, $2, $3, $4, COALESCE($5, 'Bay-General'), 'Auto-completed on schedule end')
                            RETURNING *
                        """, [bid, b['start_time'], b['end_time'], b['customer_id'], b.get('assigned_spot')])['rows'][0]
                    else:
                        sess_row = sess[0]
                        if not sess_row.get('exit_time'):
                            sess_row = tx.query("""
                                UPDATE parking_sessions SET exit_time = $1 WHERE id = $2 RETURNING *
                            """, [b['end_time'], sess_row['id']])['rows'][0]

                    entry_dt = parse_datetime(sess_row['entry_time'])
                    exit_dt = parse_datetime(sess_row['exit_time'] or b['end_time'])
                    duration = max(1, __import__('math').ceil((exit_dt - entry_dt).total_seconds() / 60))
                    ot = overtime(b['end_time'], exit_dt, b['overtime_rate_snapshot'])

                    addon_total = float(tx.query("""
                        SELECT COALESCE(SUM(price_snapshot), 0.00) AS total_addons FROM booking_addons WHERE booking_id = $1
                    """, [bid])['rows'][0]['total_addons'])

                    base = float(b['base_amount_snapshot'])
                    total = total_bill(base, ot['overtime_amount'], addon_total)

                    inv = tx.query("SELECT * FROM invoices WHERE booking_id = $1", [bid])['rows']
                    if not inv:
                        inv_row = tx.query("""
                            INSERT INTO invoices(booking_id, session_id, base_amount, overtime_minutes, overtime_amount, addons_amount, total_amount, actual_duration_minutes, generated_at)
                            VALUES($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                            RETURNING *
                        """, [bid, sess_row['id'], base, ot['overtime_minutes'], ot['overtime_amount'], addon_total, total, duration])['rows'][0]
                    else:
                        inv_row = inv[0]

                    pmt = tx.query("SELECT * FROM payments WHERE invoice_id = $1", [inv_row['id']])['rows']
                    if not pmt:
                        tx.query("""
                            INSERT INTO payments(invoice_id, booking_id, amount, status, payment_method)
                            VALUES($1, $2, $3, 'pending', 'simulated')
                        """, [inv_row['id'], bid, total])

                    tx.query("UPDATE bookings SET status = 'completed', updated_at = NOW() WHERE id = $1", [bid])
                    completed_count += 1
            except Exception as e:
                import logging
                logging.warning("Auto-completion error for booking %s: %s", bid, e)
    except Exception as exc:
        import logging
        logging.warning("Overdue sweep error: %s", exc)
    return completed_count


@bp.get('/mine')
@auth_required()
@roles('customer')
def customer_bookings():
    expire_and_complete_overdue_sessions()
    found=query("""SELECT 
        b.id, b.booking_reference, b.location_id, b.pool, b.vehicle_type, b.vehicle_number,
        b.start_time, b.end_time, b.status, b.arrival_window_start, b.arrival_deadline,
        b.rate_type, b.quantity, b.unit_price_snapshot, b.benefit_applied,
        b.discount_percent_snapshot, b.base_amount_snapshot, b.overtime_rate_snapshot,
        b.assigned_spot, b.created_at,
        l.name AS location_name, l.locality, l.address, l.provider_type,
        COALESCE(o.name, u_owner.full_name) AS owner_name,
        ps.id AS session_id, ps.entry_time, ps.exit_time, ps.spot_label,
        inv.id AS invoice_id, inv.base_amount AS invoice_base_amount,
        inv.overtime_minutes, inv.overtime_amount, inv.addons_amount,
        inv.total_amount, inv.actual_duration_minutes, inv.generated_at AS invoice_generated_at,
        pay.id AS payment_id, pay.status AS payment_status, pay.payment_method,
        pay.transaction_ref, pay.paid_at
    FROM bookings b
    JOIN parking_locations l ON b.location_id=l.id
    LEFT JOIN organisations o ON l.org_id=o.id
    LEFT JOIN users u_owner ON l.owner_id=u_owner.id
    LEFT JOIN parking_sessions ps ON ps.booking_id=b.id
    LEFT JOIN invoices inv ON b.id=inv.booking_id
    LEFT JOIN payments pay ON inv.id=pay.invoice_id
    WHERE b.customer_id=$1
    ORDER BY b.created_at DESC""",[g.user['id']])['rows']
    return ok(found,server_time=datetime.now(timezone.utc))


@bp.get('/<int:booking_id>')
@auth_required()
def booking_detail(booking_id):
    expire_and_complete_overdue_sessions()
    found=query("""SELECT b.*,l.name AS location_name,l.locality,l.address,l.owner_id,l.org_id,u.full_name AS customer_name,u.email AS customer_email,u.phone AS customer_phone FROM bookings b JOIN parking_locations l ON l.id=b.location_id JOIN users u ON u.id=b.customer_id WHERE b.id=$1""",[booking_id])['rows']
    if not found: return fail('Booking not found',404)
    b=found[0]; customer_owner=b['customer_id']==g.user['id']; operator=_location_owner_allowed({'owner_id':b['owner_id'],'org_id':b['org_id']})
    if not customer_owner and not operator: return fail('Forbidden: you cannot view this booking',403)
    display=None
    if customer_owner and b['status']=='pending' and b.get('code_encrypted') and parse_datetime(b['arrival_deadline'])>=datetime.now(timezone.utc): display=decrypt_code(b['code_encrypted'])
    addons=query('SELECT ba.facility_code,ba.price_snapshot,f.name FROM booking_addons ba JOIN facilities f ON f.code=ba.facility_code WHERE ba.booking_id=$1',[booking_id])['rows']
    sessions=query('SELECT * FROM parking_sessions WHERE booking_id=$1',[booking_id])['rows']
    invoices=query('SELECT inv.*,pay.id AS payment_id,pay.status AS payment_status,pay.payment_method,pay.transaction_ref,pay.paid_at FROM invoices inv LEFT JOIN payments pay ON inv.id=pay.invoice_id WHERE inv.booking_id=$1',[booking_id])['rows']
    events=query('SELECT * FROM booking_events WHERE booking_id=$1 ORDER BY created_at ASC',[booking_id])['rows']
    b.pop('code_hash',None); b.pop('code_encrypted',None)
    b.update({'arrival_code':display,'has_code_generated':bool(display),'assigned_spot':b.get('assigned_spot'),'addons':addons,'session':sessions[0] if sessions else None,'invoice':invoices[0] if invoices else None,'timeline':events,'server_time':datetime.now(timezone.utc)})
    return ok(b)


@bp.post('/<int:booking_id>/cancel')
@auth_required()
@roles('customer')
def cancel_booking(booking_id):
    row=query("UPDATE bookings SET status='cancelled',code_hash=NULL,code_encrypted=NULL,updated_at=NOW() WHERE id=$1 AND customer_id=$2 AND status='pending' AND arrival_deadline>=NOW() RETURNING id,booking_reference,status",[booking_id,g.user['id']])['rows']
    if not row: return fail('Booking could not be cancelled. Only unexpired pending bookings can be cancelled by the customer.',400)
    return ok(row[0],'Booking cancelled successfully and capacity released')


@bp.post('/<int:booking_id>/generate-code')
@auth_required()
@roles('org_admin','owner','platform_admin')
@approved_provider
def generate_code(booking_id):
    b=request.get_json(silent=True) or {}
    found=query('SELECT b.*,l.owner_id,l.org_id,l.name AS location_name FROM bookings b JOIN parking_locations l ON l.id=b.location_id WHERE b.id=$1',[booking_id])['rows']
    if not found: return fail('Booking not found',404)
    booking=found[0]
    if not _location_owner_allowed(booking): return fail('Forbidden: you can only generate gate codes for bookings at your facilities',403)
    if booking['status']!='pending': return fail(f"Cannot generate gate code for booking with status '{booking['status']}'")
    code=arrival_code(); digest=hash_code(code); encrypted=encrypt_code(code)
    for _ in range(5):
        collision=query("SELECT id FROM bookings WHERE location_id=$1 AND code_hash=$2 AND status='pending' AND id!=$3",[booking['location_id'],digest,booking_id])['rows']
        if not collision: break
        code=arrival_code(); digest=hash_code(code); encrypted=encrypt_code(code)
    now=datetime.now(timezone.utc); deadline=now+timedelta(minutes=15); spot=(b.get('spot_label') or booking.get('assigned_spot') or 'Bay-General').strip()
    updated=query("""UPDATE bookings SET code_hash=$1,code_encrypted=$2,arrival_window_start=NOW(),arrival_deadline=$3,failed_attempts=0,assigned_spot=$4,updated_at=NOW() WHERE id=$5 AND status='pending' RETURNING id,booking_reference,status,arrival_window_start,arrival_deadline,assigned_spot""",[digest,encrypted,deadline,spot,booking_id])['rows']
    if not updated: return fail('Failed to update booking with gate code')
    return ok({'booking_id':booking_id,'booking_reference':updated[0]['booking_reference'],'gate_code':code,'arrival_deadline':deadline,'assigned_spot':spot,'server_time':now},'Gate entry code generated successfully')


@bp.post('/<int:booking_id>/verify')
@rate_limit(30, 900, 'Too many verification attempts. Please try again after 15 minutes.')
@auth_required()
@roles('customer','platform_admin')
def verify_code(booking_id):
    b=request.get_json(silent=True) or {}; code=str(b.get('code') or '').strip()
    if len(code)!=6 or not code.isdigit(): return fail('A valid 6-digit gate entry code is required')
    digest=hash_code(code)
    try:
        with transaction() as tx:
            found=tx.query('SELECT b.*,l.name AS location_name FROM bookings b JOIN parking_locations l ON l.id=b.location_id WHERE b.id=$1 FOR UPDATE OF b',[booking_id])['rows']
            if not found: raise HTTPProblem(404,'Booking not found')
            booking=found[0]
            if booking['customer_id']!=g.user['id'] and g.user['role']!='platform_admin': raise HTTPProblem(403,'Forbidden: you can only enter gate codes for your own booking')
            if booking['status']!='pending': raise HTTPProblem(400,f"Booking cannot be verified because it is already '{booking['status']}'")
            if not booking.get('code_hash'): raise HTTPProblem(400,'Gate entry code has not been generated by the organization admin yet. Please wait for the operator to issue your code.')
            if booking['failed_attempts']>=5: raise HTTPProblem(400,'Verification locked: maximum 5 failed attempts exceeded. Please ask the operator for a replacement code.')
            if datetime.now(timezone.utc)>parse_datetime(booking['arrival_deadline']):
                tx.query("UPDATE bookings SET status='expired',code_hash=NULL,code_encrypted=NULL,updated_at=NOW() WHERE id=$1",[booking_id])
                result={'expired':True}
            else:
                updated=tx.query("""UPDATE bookings SET status='active',code_hash=NULL,code_encrypted=NULL,updated_at=NOW() WHERE id=$1 AND status='pending' AND code_hash=$2 AND NOW()<=arrival_deadline AND failed_attempts<5 RETURNING id,booking_reference,status,assigned_spot""",[booking_id,digest])['rows']
                if not updated:
                    tx.query('UPDATE bookings SET failed_attempts=failed_attempts+1,updated_at=NOW() WHERE id=$1',[booking_id])
                    result={'failed':True,'message':f"Invalid gate entry code. Please check the code provided by the operator. ({max(0,4-booking['failed_attempts'])} attempt(s) remaining)"}
                else:
                    spot=updated[0].get('assigned_spot') or 'Bay-General'
                    session=tx.query("INSERT INTO parking_sessions(booking_id,entry_time,verified_by_user_id,spot_label,notes) VALUES($1,NOW(),$2,$3,'Gate code verified by driver at terminal') RETURNING *",[booking_id,booking['customer_id'],spot])['rows'][0]
                    result={'booking':updated[0],'session':session}
        if result.get('expired'): return fail('Gate entry code has expired. Please ask the gate operator to issue a replacement code.')
        if result.get('failed'): return fail(result['message'])
        return ok(result,'Gate entry code verified successfully. Entry barrier opened! Your parking session is now active.')
    except HTTPProblem as exc: return fail(exc.message,exc.status)


@bp.post('/<int:booking_id>/exit')
@auth_required()
@roles('org_admin','owner')
@approved_provider
def record_exit(booking_id):
    try:
        with transaction() as tx:
            found=tx.query("SELECT b.*,l.owner_id,l.org_id,s.id AS session_id,s.entry_time,s.exit_time FROM bookings b JOIN parking_locations l ON l.id=b.location_id LEFT JOIN parking_sessions s ON s.booking_id=b.id WHERE b.id=$1 FOR UPDATE OF b",[booking_id])['rows']
            if not found: raise HTTPProblem(404,'Booking not found')
            b=found[0]
            if not _location_owner_allowed(b): raise HTTPProblem(403,'Forbidden: you do not operate this facility')
            if b['status']!='active': raise HTTPProblem(400,f"Cannot record exit: booking is '{b['status']}', expected 'active'")
            if not b.get('session_id') or b.get('exit_time'): raise HTTPProblem(400,'Parking session has already been completed')
            now=datetime.now(timezone.utc); duration=max(1,__import__('math').ceil((now-parse_datetime(b['entry_time'])).total_seconds()/60))
            ot=overtime(b['end_time'],now,b['overtime_rate_snapshot'])
            addon_total=float(tx.query('SELECT COALESCE(SUM(price_snapshot),0.00) total_addons FROM booking_addons WHERE booking_id=$1',[booking_id])['rows'][0]['total_addons'])
            base=float(b['base_amount_snapshot']); total=total_bill(base,ot['overtime_amount'],addon_total)
            tx.query('UPDATE parking_sessions SET exit_time=$1 WHERE id=$2',[now,b['session_id']])
            invoice=tx.query("INSERT INTO invoices(booking_id,session_id,base_amount,overtime_minutes,overtime_amount,addons_amount,total_amount,actual_duration_minutes,generated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *",[booking_id,b['session_id'],base,ot['overtime_minutes'],ot['overtime_amount'],addon_total,total,duration])['rows'][0]
            payment=tx.query("INSERT INTO payments(invoice_id,booking_id,amount,status,payment_method) VALUES($1,$2,$3,'pending','simulated') RETURNING *",[invoice['id'],booking_id,total])['rows'][0]
            tx.query("UPDATE bookings SET status='completed',updated_at=NOW() WHERE id=$1",[booking_id])
            result={'booking_id':booking_id,'invoice':invoice,'payment':payment,'actual_exit_time':now}
        return ok(result,'Vehicle exit recorded and invoice generated successfully')
    except HTTPProblem as exc: return fail(exc.message,exc.status)


def _operator_filter():
    if g.user['role']=='owner': return 'l.owner_id=$1',[g.user['id']]
    if g.user['role']=='org_admin' and g.user.get('org'): return 'l.org_id=$1',[g.user['org']['id']]
    return None,None

@bp.get('/operator/pending')
@auth_required()
@roles('org_admin','owner')
@approved_provider
def operator_pending():
    expire_and_complete_overdue_sessions(); cond,params=_operator_filter()
    if not cond: return fail('Unauthorized',403)
    found=query(f"""SELECT b.id,b.booking_reference,b.location_id,b.pool,b.vehicle_type,b.vehicle_number,b.start_time,b.end_time,b.arrival_window_start,b.arrival_deadline,b.failed_attempts,b.code_encrypted,b.assigned_spot,u.full_name AS customer_name,u.phone AS customer_phone,l.name AS location_name FROM bookings b JOIN parking_locations l ON l.id=b.location_id JOIN users u ON u.id=b.customer_id WHERE {cond} AND b.status='pending' AND b.arrival_deadline>=NOW() ORDER BY b.arrival_deadline ASC""",params)['rows']
    output=[]
    now=datetime.now(timezone.utc)
    for row in found:
        plain=decrypt_code(row.pop('code_encrypted',None)); row['current_code']=plain; row['has_code']=bool(plain); row['server_time']=now; output.append(row)
    return ok(output,server_time=now)

@bp.get('/operator/active')
@auth_required()
@roles('org_admin','owner')
@approved_provider
def operator_active():
    expire_and_complete_overdue_sessions(); cond,params=_operator_filter()
    if not cond: return fail('Unauthorized',403)
    found=query(f"""SELECT b.id AS booking_id,b.booking_reference,b.location_id,b.pool,b.vehicle_type,b.vehicle_number,b.start_time,b.end_time,b.base_amount_snapshot,b.overtime_rate_snapshot,s.id AS session_id,s.entry_time,s.spot_label,u.full_name AS customer_name,u.phone AS customer_phone,l.name AS location_name FROM bookings b JOIN parking_sessions s ON b.id=s.booking_id JOIN parking_locations l ON l.id=b.location_id JOIN users u ON u.id=b.customer_id WHERE {cond} AND b.status='active' AND s.exit_time IS NULL ORDER BY s.entry_time ASC""",params)['rows']
    return ok(found,server_time=datetime.now(timezone.utc))

@bp.get('/operator/completed')
@auth_required()
@roles('org_admin','owner')
@approved_provider
def operator_completed():
    expire_and_complete_overdue_sessions(); cond,params=_operator_filter()
    if not cond: return fail('Unauthorized',403)
    found=query(f"""SELECT b.id AS booking_id,b.booking_reference,b.vehicle_number,b.vehicle_type,s.entry_time,s.exit_time,inv.id AS invoice_id,inv.base_amount,inv.overtime_minutes,inv.overtime_amount,inv.addons_amount,inv.total_amount,inv.actual_duration_minutes,pay.id AS payment_id,pay.status AS payment_status,u.full_name AS customer_name,l.name AS location_name FROM bookings b JOIN parking_locations l ON l.id=b.location_id JOIN parking_sessions s ON s.booking_id=b.id JOIN invoices inv ON b.id=inv.booking_id LEFT JOIN payments pay ON inv.id=pay.invoice_id JOIN users u ON b.customer_id=u.id WHERE {cond} AND b.status='completed' ORDER BY inv.generated_at DESC""",params)['rows']
    return ok(found)
