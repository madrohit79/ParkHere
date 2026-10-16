from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, g
from .db import query, transaction
from .common import ok, fail
from .security import auth_required, roles, approved_provider
from .utils import parse_datetime, parse_time, format_time12, validate_operating_hours, loc_aliases

bp = Blueprint('locations', __name__)


def _member_org_benefits(user_id):
    rows = query("""SELECT om.org_id, om.parking_benefit FROM customer_memberships cm JOIN org_members om ON cm.org_member_id=om.id JOIN organisations o ON om.org_id=o.id
        WHERE cm.customer_id=$1 AND cm.status='verified' AND om.is_active=TRUE AND o.is_active=TRUE AND o.approval_status='approved'""", [user_id])['rows']
    return {r['org_id']: (r['parking_benefit'] or 'free') for r in rows}


def _location_owner_check(loc):
    user = g.user
    if user['role'] == 'owner' and loc['owner_id'] != user['id']:
        return fail('Forbidden: you do not own this location', 403)
    if user['role'] == 'org_admin' and (not user.get('org') or loc['org_id'] != user['org']['id']):
        return fail('Forbidden: this location belongs to another organisation', 403)
    if user['role'] not in ('owner', 'org_admin', 'platform_admin'):
        return fail('Unauthorized', 403)
    return None


@bp.get('/facilities')
def facilities_master():
    return ok(query('SELECT code,name,description FROM facilities ORDER BY name ASC')['rows'])


@bp.get('')
@bp.get('/')
@auth_required(optional=True)
def search_locations():
    if g.user and g.user['role'] == 'org_admin':
        return fail('Organization administrators are not authorized to access public Find Parking search. Please use your administrative locations dashboard.', 403)
    query('SELECT expire_overdue_bookings()')
    args = request.args
    start = parse_datetime(args.get('start_time'))
    end = parse_datetime(args.get('end_time')) if args.get('end_time') else start + timedelta(hours=float(args.get('duration_hours') or 1))
    member_benefits = _member_org_benefits(g.user['id']) if g.user and g.user['role'] == 'customer' else {}
    conditions = ['l.is_active=TRUE', "((l.provider_type='owner' AND EXISTS (SELECT 1 FROM owner_profiles op WHERE op.user_id=l.owner_id AND op.approval_status='approved')) OR (l.provider_type='org' AND EXISTS (SELECT 1 FROM organisations org WHERE org.id=l.org_id AND org.approval_status='approved' AND org.is_active=TRUE)))"]
    params = [start, end]
    for key, expr in [('locality', "(l.locality ILIKE ${n} OR l.name ILIKE ${n} OR l.address ILIKE ${n})"), ('vehicle_type', "EXISTS (SELECT 1 FROM location_vehicle_types vt WHERE vt.location_id=l.id AND vt.vehicle_type=${n})"), ('max_price', 't.hourly_rate <= ${n}'), ('facility', "EXISTS (SELECT 1 FROM location_facilities lf WHERE lf.location_id=l.id AND lf.facility_code=${n} AND lf.is_offered=TRUE)")]:
        value = args.get(key)
        if value and (key != 'max_price' or value.replace('.', '', 1).isdigit()):
            params.append(f'%{value.strip()}%' if key == 'locality' else float(value) if key == 'max_price' else value.strip())
            n = len(params)
            conditions.append(expr.replace('${n}', f'${n}'))
    for key, col in [('has_cctv', 'l.has_cctv'), ('has_guard', 'l.has_guard'), ('is_covered', 'l.is_covered')]:
        if args.get(key) == 'true': conditions.append(f'{col}=TRUE')
    sql = f"""SELECT l.id,l.name,l.locality,l.address,l.provider_type,l.org_id,l.owner_id,l.public_capacity,l.member_capacity,l.operating_hours,l.is_24_7,l.opens_at,l.closes_at,l.has_cctv,l.has_guard,l.is_covered,l.is_demo,
        t.hourly_rate,t.daily_rate,t.weekly_rate,t.monthly_rate,t.overtime_rate_per_minute,t.member_discount_percent,
        GREATEST(0,l.public_capacity-COALESCE(occ.public_occupied,0)) AS available_public,
        GREATEST(0,l.member_capacity-COALESCE(occ.member_occupied,0)) AS available_member,
        COALESCE(fac.facilities_list,'[]'::json) AS facilities,COALESCE(vt.vehicles_list,'[]'::json) AS vehicle_types
        FROM parking_locations l JOIN location_tariffs t ON l.id=t.location_id
        LEFT JOIN (SELECT location_id,COUNT(*) FILTER (WHERE pool='public') public_occupied,COUNT(*) FILTER (WHERE pool='member') member_occupied FROM v_occupying_bookings WHERE occ_start<$2 AND occ_end>$1 GROUP BY location_id) occ ON occ.location_id=l.id
        LEFT JOIN (SELECT lf.location_id,json_agg(json_build_object('code',f.code,'name',f.name,'price',lf.price)) facilities_list FROM location_facilities lf JOIN facilities f ON f.code=lf.facility_code WHERE lf.is_offered=TRUE GROUP BY lf.location_id) fac ON fac.location_id=l.id
        LEFT JOIN (SELECT location_id,json_agg(vehicle_type) vehicles_list FROM location_vehicle_types GROUP BY location_id) vt ON vt.location_id=l.id
        WHERE {' AND '.join(conditions)} ORDER BY t.hourly_rate ASC"""
    found = query(sql, params)['rows']
    output = []
    for loc in found:
        org_id = loc.get('org_id')
        is_member = bool(org_id and org_id in member_benefits)
        benefit = member_benefits.get(org_id, 'none') if is_member else 'none'
        loc = loc_aliases(loc)
        loc['available_public'] = int(loc.get('available_public') or 0)
        loc['available_member'] = int(loc.get('available_member') or 0) if is_member else 0
        loc['is_user_verified_member'] = is_member
        loc['member_benefit'] = benefit
        if is_member:
            if benefit == 'free':
                loc['member_hourly_rate'] = 0.0
            elif benefit == 'discounted':
                disc = float(loc.get('member_discount_percent') or 0)
                loc['member_hourly_rate'] = round(float(loc.get('hourly_rate') or 0) * (1 - disc / 100), 2)
            else:
                loc['member_hourly_rate'] = float(loc.get('hourly_rate') or 0)
        else:
            loc['member_hourly_rate'] = None
        check = validate_operating_hours(start, end, loc) if not loc['is_24_7'] else {'valid': True}
        loc['is_closed_for_requested_time'] = not check['valid']
        loc['closure_reason'] = check.get('message')
        if not check['valid']:
            loc['available_public'] = loc['available_member'] = 0
        if loc['available_public'] > 0 or (is_member and loc['available_member'] > 0): output.append(loc)
    return ok(output, server_time=datetime.now(timezone.utc))


@bp.get('/mine')
@auth_required()
@roles('org_admin', 'owner', 'platform_admin')
def provider_locations():
    if g.user['role'] == 'org_admin':
        if not g.user.get('org'): return fail('No organisation profile linked to this account', 403)
        where, params = 'l.org_id=$1', [g.user['org']['id']]
    elif g.user['role'] == 'owner': where, params = 'l.owner_id=$1', [g.user['id']]
    else: where, params = 'TRUE', []
    found = query(f"""SELECT l.*,t.hourly_rate,t.daily_rate,t.weekly_rate,t.monthly_rate,t.overtime_rate_per_minute,t.member_discount_percent,
        (SELECT COUNT(*) FROM bookings b WHERE b.location_id=l.id) total_bookings_count,
        (SELECT COUNT(*) FROM bookings b WHERE b.location_id=l.id AND b.status='active') active_sessions_count
        FROM parking_locations l LEFT JOIN location_tariffs t ON l.id=t.location_id WHERE {where} ORDER BY l.created_at DESC""", params)['rows']
    return ok([loc_aliases(x) for x in found])


@bp.get('/<int:location_id>')
@auth_required(optional=True)
def location_detail(location_id):
    start = parse_datetime(request.args.get('start_time'))
    end = parse_datetime(request.args.get('end_time')) if request.args.get('end_time') else start + timedelta(hours=1)
    loc = query("""SELECT l.*,t.hourly_rate,t.daily_rate,t.weekly_rate,t.monthly_rate,t.overtime_rate_per_minute,t.member_discount_percent,
        GREATEST(0,l.public_capacity-COALESCE(occ.public_occupied,0)) available_public,GREATEST(0,l.member_capacity-COALESCE(occ.member_occupied,0)) available_member,
        o.name org_name,o.org_identifier FROM parking_locations l JOIN location_tariffs t ON l.id=t.location_id LEFT JOIN organisations o ON o.id=l.org_id
        LEFT JOIN (SELECT location_id,COUNT(*) FILTER(WHERE pool='public') public_occupied,COUNT(*) FILTER(WHERE pool='member') member_occupied FROM v_occupying_bookings WHERE occ_start<$2 AND occ_end>$1 GROUP BY location_id) occ ON occ.location_id=l.id
        WHERE l.id=$3 AND l.is_active=TRUE""", [start, end, location_id])['rows']
    if not loc: return fail('Parking location not found or inactive', 404)
    loc = loc[0]
    loc['facilities'] = query('SELECT lf.facility_code AS code,f.name,f.description,lf.price,lf.is_offered FROM location_facilities lf JOIN facilities f ON f.code=lf.facility_code WHERE lf.location_id=$1 AND lf.is_offered=TRUE', [location_id])['rows']
    loc['vehicle_types'] = [r['vehicle_type'] for r in query('SELECT vehicle_type FROM location_vehicle_types WHERE location_id=$1', [location_id])['rows']]
    loc['photos'] = [r['photo_url'] for r in query('SELECT photo_url FROM location_photos WHERE location_id=$1 ORDER BY display_order', [location_id])['rows']]
    is_member, benefit = False, 'none'
    if g.user and g.user['role'] == 'customer' and loc.get('org_id'):
        m = query("""SELECT om.parking_benefit FROM customer_memberships cm JOIN org_members om ON cm.org_member_id=om.id JOIN organisations o ON o.id=om.org_id
            WHERE cm.customer_id=$1 AND om.org_id=$2 AND cm.status='verified' AND om.is_active=TRUE AND o.is_active=TRUE AND o.approval_status='approved'""", [g.user['id'], loc['org_id']])['rows']
        if m: is_member, benefit = True, m[0]['parking_benefit'] or 'free'
    loc['is_user_verified_member'], loc['member_benefit'] = is_member, benefit
    if is_member:
        if benefit == 'free':
            loc['member_hourly_rate'] = 0.0
        elif benefit == 'discounted':
            disc = float(loc.get('member_discount_percent') or 0)
            loc['member_hourly_rate'] = round(float(loc.get('hourly_rate') or 0) * (1 - disc / 100), 2)
        else:
            loc['member_hourly_rate'] = float(loc.get('hourly_rate') or 0)
    else:
        loc['member_hourly_rate'] = None
    loc['available_public'] = int(loc.get('available_public') or 0)
    loc['available_member'] = int(loc.get('available_member') or 0) if is_member else 0
    return ok(loc_aliases(loc), server_time=datetime.now(timezone.utc))


@bp.post('')
@bp.post('/')
@auth_required()
@roles('org_admin', 'owner')
@approved_provider
def create_location():
    b = request.get_json(silent=True) or {}
    if not all(b.get(k) for k in ('name', 'address', 'locality')): return fail('Name, address, and locality are required')
    pub, mem = int(b.get('public_capacity') or 0), int(b.get('member_capacity') or 0) if g.user['role']=='org_admin' else 0
    if pub + mem <= 0: return fail('Total capacity must be greater than zero')
    if not any(b.get(k) is not None and str(b.get(k)) != '' for k in ('hourly_rate','daily_rate','weekly_rate','monthly_rate')): return fail('At least one tariff rate (hourly, daily, weekly, or monthly) is required')
    is24 = bool(b.get('is_24_hours', b.get('is_24_7', True)))
    op, cl = (None, None) if is24 else (b.get('opening_time', b.get('opens_at')), b.get('closing_time', b.get('closes_at')))
    if not is24:
        if not op or not cl: return fail('Opening time and closing time are required when location is not 24/7')
        if parse_time(op) is None or parse_time(cl) is None: return fail('Invalid time format. Please provide valid opening and closing times (HH:MM)')
        if parse_time(op)==parse_time(cl): return fail('Opening time and closing time cannot be identical. Please select distinct times or enable 24/7 availability.')
    hours = '24/7' if is24 else f'{format_time12(op)} - {format_time12(cl)}' + (' (Overnight)' if parse_time(op)>parse_time(cl) else '')
    provider = 'org' if g.user['role']=='org_admin' else 'owner'
    org_id = g.user['org']['id'] if provider=='org' and g.user.get('org') else None
    owner_id = g.user['id'] if provider=='owner' else None
    with transaction() as tx:
        loc = tx.query("""INSERT INTO parking_locations(provider_type,org_id,owner_id,name,address,locality,latitude,longitude,public_capacity,member_capacity,operating_hours,is_24_7,opens_at,closes_at,has_cctv,has_guard,is_covered,is_active,is_demo)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,TRUE,FALSE) RETURNING *""",
            [provider,org_id,owner_id,b['name'].strip(),b['address'].strip(),b['locality'].strip(),b.get('latitude'),b.get('longitude'),pub,mem,hours,is24,op,cl,bool(b.get('has_cctv')),bool(b.get('has_guard')),bool(b.get('is_covered'))])['rows'][0]
        tx.query("""INSERT INTO location_tariffs(location_id,hourly_rate,daily_rate,weekly_rate,monthly_rate,overtime_rate_per_minute,member_discount_percent)
            VALUES($1,$2,$3,$4,$5,$6,$7)""", [loc['id'], b.get('hourly_rate') or None,b.get('daily_rate') or None,b.get('weekly_rate') or None,b.get('monthly_rate') or None,float(b.get('overtime_rate_per_minute') or 1),float(b.get('member_discount_percent') or 0) if provider=='org' else 0])
        for vt in (b.get('vehicle_types') or ['two_wheeler','four_wheeler']):
            tx.query('INSERT INTO location_vehicle_types(location_id,vehicle_type) VALUES($1,$2) ON CONFLICT DO NOTHING', [loc['id'],vt])
        for f in b.get('facilities') or []:
            if f.get('code') and f.get('is_offered'):
                tx.query('INSERT INTO location_facilities(location_id,facility_code,price,is_offered) VALUES($1,$2,$3,TRUE) ON CONFLICT(location_id,facility_code) DO UPDATE SET price=EXCLUDED.price,is_offered=TRUE', [loc['id'],f['code'],float(f.get('price') or 0)])
    return ok(loc_aliases(loc), 'Parking location created successfully', 201)


@bp.put('/<int:location_id>')
@auth_required()
@roles('org_admin','owner')
@approved_provider
def update_location(location_id):
    b = request.get_json(silent=True) or {}
    found = query('SELECT * FROM parking_locations WHERE id=$1', [location_id])['rows']
    if not found: return fail('Location not found', 404)
    loc = found[0]; denied = _location_owner_check(loc)
    if denied: return denied
    pub = int(b.get('public_capacity', loc['public_capacity']))
    mem = int(b.get('member_capacity', loc['member_capacity'])) if g.user['role']=='org_admin' else 0
    is24 = bool(b.get('is_24_hours', b.get('is_24_7', loc['is_24_7'])))
    op = b.get('opening_time', b.get('opens_at', loc['opens_at']))
    cl = b.get('closing_time', b.get('closes_at', loc['closes_at']))
    if is24: op=cl=None; hours='24/7'
    else:
        if not op or not cl: return fail('Opening time and closing time are required when location is not 24/7')
        if parse_time(op) is None or parse_time(cl) is None: return fail('Invalid time format. Please provide valid opening and closing times (HH:MM)')
        if parse_time(op)==parse_time(cl): return fail('Opening time and closing time cannot be identical. Please select distinct times or enable 24/7 availability.')
        hours=f'{format_time12(op)} - {format_time12(cl)}'+(' (Overnight)' if parse_time(op)>parse_time(cl) else '')
    if pub+mem <= 0: return fail('Total capacity must be greater than zero')
    updated = query("""UPDATE parking_locations SET name=COALESCE($1,name),address=COALESCE($2,address),locality=COALESCE($3,locality),public_capacity=$4,member_capacity=$5,is_24_7=$6,opens_at=$7,closes_at=$8,operating_hours=$9,has_cctv=COALESCE($10,has_cctv),has_guard=COALESCE($11,has_guard),is_covered=COALESCE($12,is_covered),is_active=COALESCE($13,is_active),updated_at=NOW() WHERE id=$14 RETURNING *""",
        [b.get('name'),b.get('address'),b.get('locality'),pub,mem,is24,op,cl,hours,b.get('has_cctv'),b.get('has_guard'),b.get('is_covered'),b.get('is_active'),location_id])['rows'][0]
    return ok(loc_aliases(updated), 'Location updated successfully')


@bp.put('/<int:location_id>/tariff')
@auth_required()
@roles('org_admin','owner')
@approved_provider
def update_tariff(location_id):
    locs = query('SELECT * FROM parking_locations WHERE id=$1', [location_id])['rows']
    if not locs: return fail('Location not found', 404)
    denied = _location_owner_check(locs[0])
    if denied: return denied
    b = request.get_json(silent=True) or {}
    cur = query('SELECT * FROM location_tariffs WHERE location_id=$1', [location_id])['rows']
    if not cur: return fail('Tariff not found', 404)
    c=cur[0]
    values=[]
    for k in ('hourly_rate','daily_rate','weekly_rate','monthly_rate'):
        values.append((b[k] if b[k] not in ('',None,0,'0') else None) if k in b else c[k])
    over=b.get('overtime_rate_per_minute',c['overtime_rate_per_minute'])
    disc=b.get('member_discount_percent',c['member_discount_percent'])
    if not any(v is not None for v in values): return fail('At least one tariff rate is required')
    result=query('''UPDATE location_tariffs SET hourly_rate=$1,daily_rate=$2,weekly_rate=$3,monthly_rate=$4,overtime_rate_per_minute=$5,member_discount_percent=$6 WHERE location_id=$7 RETURNING *''', [*values,over,disc,location_id])['rows'][0]
    return ok(result,'Tariff updated successfully')


@bp.put('/<int:location_id>/facilities')
@auth_required()
@roles('org_admin','owner')
@approved_provider
def update_facilities(location_id):
    b=request.get_json(silent=True) or {}; facilities=b.get('facilities')
    if not isinstance(facilities,list): return fail('Facilities array required')
    locs=query('SELECT * FROM parking_locations WHERE id=$1',[location_id])['rows']
    if not locs: return fail('Location not found',404)
    denied=_location_owner_check(locs[0])
    if denied: return denied
    with transaction() as tx:
        for f in facilities:
            if not f.get('code'): continue
            tx.query('''INSERT INTO location_facilities(location_id,facility_code,price,is_offered) VALUES($1,$2,$3,$4)
                ON CONFLICT(location_id,facility_code) DO UPDATE SET price=EXCLUDED.price,is_offered=EXCLUDED.is_offered''',[location_id,f['code'],float(f.get('price') or 0),bool(f.get('is_offered'))])
    return ok(message='Facilities updated successfully')
