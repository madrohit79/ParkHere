const { query } = require('../db/pool');
const { withTransaction } = require('../db/transaction');
const { parseTimeToMinutes, formatTime12h, isLocationCurrentlyOpen, validateBookingOperatingHours } = require('../utils/time');

/**
 * Enriches a location record with both legacy and new operating hours aliases.
 */
function enrichLocationWithAliases(loc) {
  if (!loc) return loc;
  const is24 = loc.is_24_7 !== undefined ? Boolean(loc.is_24_7) : (loc.is_24_hours !== undefined ? Boolean(loc.is_24_hours) : true);
  return {
    ...loc,
    is_24_hours: is24,
    is_24_7: is24,
    opening_time: loc.opens_at || null,
    opens_at: loc.opens_at || null,
    closing_time: loc.closes_at || null,
    closes_at: loc.closes_at || null,
    is_currently_open: isLocationCurrentlyOpen(loc),
    operating_hours: loc.operating_hours || (is24 ? '24/7' : `${formatTime12h(loc.opens_at)} - ${formatTime12h(loc.closes_at)}`)
  };
}

/**
 * Searches and lists parking locations with real-time capacity and filter evaluation.
 * Strictly uses parameterised raw SQL and whitelist-based filtering.
 */
async function searchLocations(req, res, next) {
  try {
    // Role-based access control: Organization Admins must not access public Find Parking search
    if (req.user && req.user.role === 'org_admin') {
      return res.status(403).json({
        success: false,
        error: 'Organization administrators are not authorized to access public Find Parking search. Please use your administrative locations dashboard.'
      });
    }

    // 1. Run automatic expiration sweep
    await query('SELECT expire_overdue_bookings()');

    const {
      locality,
      start_time,
      end_time,
      duration_hours,
      vehicle_type,
      max_price,
      has_cctv,
      has_guard,
      is_covered,
      facility
    } = req.query;

    const now = new Date();
    const startTime = start_time ? new Date(start_time) : now;
    let endTime;
    if (end_time) {
      endTime = new Date(end_time);
    } else if (duration_hours) {
      endTime = new Date(startTime.getTime() + Number(duration_hours) * 3600 * 1000);
    } else {
      endTime = new Date(startTime.getTime() + 3600 * 1000); // default 1 hour
    }

    // Determine current user verified org IDs for member allocation visibility
    let userVerifiedOrgIds = [];
    if (req.user && req.user.role === 'customer') {
      const userOrgsRes = await query(
        `SELECT om.org_id
         FROM customer_memberships cm
         JOIN org_members om ON cm.org_member_id = om.id
         JOIN organisations o ON om.org_id = o.id
         WHERE cm.customer_id = $1 
           AND cm.status = 'verified' 
           AND om.is_active = TRUE 
           AND o.is_active = TRUE 
           AND o.approval_status = 'approved'`,
        [req.user.id]
      );
      userVerifiedOrgIds = userOrgsRes.rows.map(r => r.org_id);
    }

    const conditions = ['l.is_active = TRUE'];
    const params = [startTime, endTime];

    // Provider approval conditions
    conditions.push(`(
      (l.provider_type = 'owner' AND EXISTS (
        SELECT 1 FROM owner_profiles op WHERE op.user_id = l.owner_id AND op.approval_status = 'approved'
      ))
      OR
      (l.provider_type = 'org' AND EXISTS (
        SELECT 1 FROM organisations org WHERE org.id = l.org_id AND org.approval_status = 'approved' AND org.is_active = TRUE
      ))
    )`);

    if (locality && locality.trim()) {
      params.push(`%${locality.trim()}%`);
      conditions.push(`(l.locality ILIKE $${params.length} OR l.name ILIKE $${params.length} OR l.address ILIKE $${params.length})`);
    }

    if (vehicle_type && vehicle_type.trim()) {
      params.push(vehicle_type.trim());
      conditions.push(`EXISTS (
        SELECT 1 FROM location_vehicle_types vt 
        WHERE vt.location_id = l.id AND vt.vehicle_type = $${params.length}
      )`);
    }

    if (max_price && !isNaN(Number(max_price))) {
      params.push(Number(max_price));
      conditions.push(`t.hourly_rate <= $${params.length}`);
    }

    if (has_cctv === 'true') {
      conditions.push('l.has_cctv = TRUE');
    }
    if (has_guard === 'true') {
      conditions.push('l.has_guard = TRUE');
    }
    if (is_covered === 'true') {
      conditions.push('l.is_covered = TRUE');
    }

    if (facility && facility.trim()) {
      params.push(facility.trim());
      conditions.push(`EXISTS (
        SELECT 1 FROM location_facilities lf 
        WHERE lf.location_id = l.id AND lf.facility_code = $${params.length} AND lf.is_offered = TRUE
      )`);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT 
        l.id,
        l.name,
        l.locality,
        l.address,
        l.provider_type,
        l.org_id,
        l.owner_id,
        l.public_capacity,
        l.member_capacity,
        l.operating_hours,
        l.is_24_7,
        l.opens_at,
        l.closes_at,
        l.has_cctv,
        l.has_guard,
        l.is_covered,
        l.is_demo,
        t.hourly_rate,
        t.daily_rate,
        t.weekly_rate,
        t.monthly_rate,
        t.overtime_rate_per_minute,
        t.member_discount_percent,
        GREATEST(0, l.public_capacity - COALESCE(occ.public_occupied, 0)) AS available_public,
        GREATEST(0, l.member_capacity - COALESCE(occ.member_occupied, 0)) AS available_member,
        COALESCE(fac.facilities_list, '[]'::json) AS facilities,
        COALESCE(vt.vehicles_list, '[]'::json) AS vehicle_types
      FROM parking_locations l
      JOIN location_tariffs t ON l.id = t.location_id
      LEFT JOIN (
        SELECT 
          v.location_id,
          COUNT(*) FILTER (WHERE v.pool = 'public') AS public_occupied,
          COUNT(*) FILTER (WHERE v.pool = 'member') AS member_occupied
        FROM v_occupying_bookings v
        WHERE v.occ_start < $2 AND v.occ_end > $1
        GROUP BY v.location_id
      ) occ ON l.id = occ.location_id
      LEFT JOIN (
        SELECT 
          lf.location_id,
          json_agg(json_build_object(
            'code', f.code,
            'name', f.name,
            'price', lf.price
          )) AS facilities_list
        FROM location_facilities lf
        JOIN facilities f ON lf.facility_code = f.code
        WHERE lf.is_offered = TRUE
        GROUP BY lf.location_id
      ) fac ON l.id = fac.location_id
      LEFT JOIN (
        SELECT 
          location_id,
          json_agg(vehicle_type) AS vehicles_list
        FROM location_vehicle_types
        GROUP BY location_id
      ) vt ON l.id = vt.location_id
      WHERE ${whereClause}
      ORDER BY t.hourly_rate ASC
    `;

    const result = await query(sql, params);

    // Filter results according to member allocation visibility rules (Section 6.1):
    // Only verified members of the location's organisation can see member-only spaces.
    const enriched = result.rows.map(loc => {
      const isMember = loc.org_id && userVerifiedOrgIds.includes(loc.org_id);
      const aliased = enrichLocationWithAliases(loc);
      let availPublic = Number(loc.available_public);
      let availMember = isMember ? Number(loc.available_member) : 0;
      let isClosedForWindow = false;
      let closureReason = null;

      if (!aliased.is_24_7) {
        const opCheck = validateBookingOperatingHours(startTime, endTime, aliased);
        if (!opCheck.valid) {
          isClosedForWindow = true;
          closureReason = opCheck.message;
          availPublic = 0;
          availMember = 0;
        }
      }

      return {
        ...aliased,
        available_public: availPublic,
        available_member: availMember,
        is_user_verified_member: Boolean(isMember),
        is_closed_for_requested_time: isClosedForWindow,
        closure_reason: closureReason
      };
    }).filter(loc => {
      // Must have available public space OR user is verified member with available member space
      return loc.available_public > 0 || (loc.is_user_verified_member && loc.available_member > 0);
    });

    res.json({
      success: true,
      data: enriched,
      server_time: new Date()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves full details for a single parking location.
 */
async function getLocationDetail(req, res, next) {
  try {
    const locationId = Number(req.params.id);
    const { start_time, end_time } = req.query;

    const startTime = start_time ? new Date(start_time) : new Date();
    const endTime = end_time ? new Date(end_time) : new Date(startTime.getTime() + 3600 * 1000);

    const locRes = await query(
      `SELECT 
         l.*,
         t.hourly_rate,
         t.daily_rate,
         t.weekly_rate,
         t.monthly_rate,
         t.overtime_rate_per_minute,
         t.member_discount_percent,
         GREATEST(0, l.public_capacity - COALESCE(occ.public_occupied, 0)) AS available_public,
         GREATEST(0, l.member_capacity - COALESCE(occ.member_occupied, 0)) AS available_member,
         o.name AS org_name,
         o.org_identifier
       FROM parking_locations l
       JOIN location_tariffs t ON l.id = t.location_id
       LEFT JOIN organisations o ON l.org_id = o.id
       LEFT JOIN (
         SELECT 
           v.location_id,
           COUNT(*) FILTER (WHERE v.pool = 'public') AS public_occupied,
           COUNT(*) FILTER (WHERE v.pool = 'member') AS member_occupied
         FROM v_occupying_bookings v
         WHERE v.occ_start < $2 AND v.occ_end > $1
         GROUP BY v.location_id
       ) occ ON l.id = occ.location_id
       WHERE l.id = $3 AND l.is_active = TRUE`,
      [startTime, endTime, locationId]
    );

    if (locRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Parking location not found or inactive' });
    }

    const location = locRes.rows[0];

    // Facilities
    const facRes = await query(
      `SELECT lf.facility_code AS code, f.name, f.description, lf.price, lf.is_offered
       FROM location_facilities lf
       JOIN facilities f ON lf.facility_code = f.code
       WHERE lf.location_id = $1 AND lf.is_offered = TRUE`,
      [locationId]
    );
    location.facilities = facRes.rows;

    // Vehicle types
    const vtRes = await query(
      'SELECT vehicle_type FROM location_vehicle_types WHERE location_id = $1',
      [locationId]
    );
    location.vehicle_types = vtRes.rows.map(r => r.vehicle_type);

    // Photos
    const photosRes = await query(
      'SELECT photo_url FROM location_photos WHERE location_id = $1 ORDER BY display_order ASC',
      [locationId]
    );
    location.photos = photosRes.rows.map(r => r.photo_url);

    // Check user membership status for this location
    let isMember = false;
    let memberBenefit = 'none';
    if (req.user && req.user.role === 'customer' && location.org_id) {
      const memberCheck = await query(
        `SELECT om.parking_benefit
         FROM customer_memberships cm
         JOIN org_members om ON cm.org_member_id = om.id
         JOIN organisations o ON om.org_id = o.id
         WHERE cm.customer_id = $1 
           AND om.org_id = $2 
           AND cm.status = 'verified' 
           AND om.is_active = TRUE 
           AND o.is_active = TRUE 
           AND o.approval_status = 'approved'`,
        [req.user.id, location.org_id]
      );
      if (memberCheck.rowCount > 0) {
        isMember = true;
        memberBenefit = memberCheck.rows[0].parking_benefit;
      }
    }

    location.is_user_verified_member = isMember;
    location.member_benefit = memberBenefit;
    location.available_public = Number(location.available_public);
    location.available_member = isMember ? Number(location.available_member) : 0;

    res.json({
      success: true,
      data: enrichLocationWithAliases(location),
      server_time: new Date()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns provider's managed locations (Org Admin or Owner).
 */
async function getProviderLocations(req, res, next) {
  try {
    let whereClause = '';
    let param = null;

    if (req.user.role === 'org_admin') {
      whereClause = 'l.org_id = $1';
      param = req.user.org.id;
    } else if (req.user.role === 'owner') {
      whereClause = 'l.owner_id = $1';
      param = req.user.id;
    } else if (req.user.role === 'platform_admin') {
      whereClause = '1=1';
    } else {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const sql = `
      SELECT 
        l.*,
        t.hourly_rate,
        t.daily_rate,
        t.weekly_rate,
        t.monthly_rate,
        t.overtime_rate_per_minute,
        t.member_discount_percent,
        (SELECT COUNT(*) FROM bookings b WHERE b.location_id = l.id) AS total_bookings_count,
        (SELECT COUNT(*) FROM bookings b WHERE b.location_id = l.id AND b.status = 'active') AS active_sessions_count
      FROM parking_locations l
      LEFT JOIN location_tariffs t ON l.id = t.location_id
      WHERE ${whereClause}
      ORDER BY l.created_at DESC
    `;

    const result = param ? await query(sql, [param]) : await query(sql);

    res.json({
      success: true,
      data: result.rows.map(enrichLocationWithAliases)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new location for an approved provider.
 */
async function createLocation(req, res, next) {
  try {
    const {
      name, address, locality, latitude, longitude,
      public_capacity, member_capacity,
      is_24_7, opens_at, closes_at, operating_hours,
      has_cctv, has_guard, is_covered,
      hourly_rate, daily_rate, weekly_rate, monthly_rate,
      overtime_rate_per_minute, member_discount_percent,
      vehicle_types, facilities
    } = req.body;

    if (!name || !address || !locality) {
      return res.status(400).json({ success: false, error: 'Name, address, and locality are required' });
    }

    const pubCap = Number(public_capacity) || 0;
    const memCap = req.user.role === 'org_admin' ? (Number(member_capacity) || 0) : 0;

    if (pubCap + memCap <= 0) {
      return res.status(400).json({ success: false, error: 'Total capacity must be greater than zero' });
    }

    if (!hourly_rate && !daily_rate && !weekly_rate && !monthly_rate) {
      return res.status(400).json({ success: false, error: 'At least one tariff rate (hourly, daily, weekly, or monthly) is required' });
    }

    const providerType = req.user.role === 'org_admin' ? 'org' : 'owner';
    const orgId = providerType === 'org' ? req.user.org.id : null;
    const ownerId = providerType === 'owner' ? req.user.id : null;

    const is24Hours = req.body.is_24_hours !== undefined
      ? Boolean(req.body.is_24_hours)
      : (req.body.is_24_7 !== undefined ? Boolean(req.body.is_24_7) : true);

    let opensAt = req.body.opening_time !== undefined ? req.body.opening_time : req.body.opens_at;
    let closesAt = req.body.closing_time !== undefined ? req.body.closing_time : req.body.closes_at;
    let opHours = req.body.operating_hours;

    if (is24Hours) {
      opensAt = null;
      closesAt = null;
      opHours = '24/7';
    } else {
      if (!opensAt || !closesAt) {
        return res.status(400).json({
          success: false,
          error: 'Opening time and closing time are required when location is not 24/7'
        });
      }

      const openMins = parseTimeToMinutes(opensAt);
      const closeMins = parseTimeToMinutes(closesAt);

      if (openMins === null || closeMins === null) {
        return res.status(400).json({
          success: false,
          error: 'Invalid time format. Please provide valid opening and closing times (HH:MM)'
        });
      }

      if (openMins === closeMins) {
        return res.status(400).json({
          success: false,
          error: 'Opening time and closing time cannot be identical. Please select distinct times or enable 24/7 availability.'
        });
      }

      const openFmt = formatTime12h(opensAt);
      const closeFmt = formatTime12h(closesAt);
      const isOvernight = openMins > closeMins;
      opHours = `${openFmt} - ${closeFmt}${isOvernight ? ' (Overnight)' : ''}`;
    }

    const location = await withTransaction(async (client) => {
      // 1. Insert parking location
      const locRes = await client.query(
        `INSERT INTO parking_locations (
          provider_type, org_id, owner_id, name, address, locality,
          latitude, longitude, public_capacity, member_capacity,
          operating_hours, is_24_7, opens_at, closes_at,
          has_cctv, has_guard, is_covered, is_active, is_demo
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, TRUE, FALSE
        ) RETURNING *`,
        [
          providerType, orgId, ownerId, name.trim(), address.trim(), locality.trim(),
          latitude ? Number(latitude) : null, longitude ? Number(longitude) : null,
          pubCap, memCap,
          opHours,
          Boolean(is24Hours), opensAt, closesAt,
          Boolean(has_cctv), Boolean(has_guard), Boolean(is_covered)
        ]
      );
      const newLoc = locRes.rows[0];

      // 2. Insert tariffs
      await client.query(
        `INSERT INTO location_tariffs (
          location_id, hourly_rate, daily_rate, weekly_rate, monthly_rate,
          overtime_rate_per_minute, member_discount_percent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newLoc.id,
          hourly_rate ? Number(hourly_rate) : null,
          daily_rate ? Number(daily_rate) : null,
          weekly_rate ? Number(weekly_rate) : null,
          monthly_rate ? Number(monthly_rate) : null,
          Number(overtime_rate_per_minute) || 1.00,
          providerType === 'org' ? (Number(member_discount_percent) || 0.00) : 0.00
        ]
      );

      // 3. Insert vehicle types
      const vTypes = Array.isArray(vehicle_types) && vehicle_types.length > 0
        ? vehicle_types
        : ['two_wheeler', 'four_wheeler'];

      for (const vt of vTypes) {
        await client.query(
          'INSERT INTO location_vehicle_types (location_id, vehicle_type) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [newLoc.id, vt]
        );
      }

      // 4. Insert offered facilities
      if (Array.isArray(facilities)) {
        for (const f of facilities) {
          if (f.code && f.is_offered) {
            await client.query(
              `INSERT INTO location_facilities (location_id, facility_code, price, is_offered)
               VALUES ($1, $2, $3, TRUE)
               ON CONFLICT (location_id, facility_code) DO UPDATE SET price = EXCLUDED.price, is_offered = TRUE`,
              [newLoc.id, f.code, Number(f.price) || 0.00]
            );
          }
        }
      }

      return newLoc;
    });

    res.status(201).json({
      success: true,
      message: 'Parking location created successfully',
      data: enrichLocationWithAliases(location)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing location's metadata.
 */
async function updateLocation(req, res, next) {
  try {
    const locationId = Number(req.params.id);
    const {
      name, address, locality, public_capacity, member_capacity,
      has_cctv, has_guard, is_covered, is_active
    } = req.body;

    // Verify ownership
    const locCheck = await query('SELECT * FROM parking_locations WHERE id = $1', [locationId]);
    if (locCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    const loc = locCheck.rows[0];
    if (req.user.role === 'owner' && loc.owner_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: you do not own this location' });
    }
    if (req.user.role === 'org_admin' && loc.org_id !== req.user.org.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: this location belongs to another organisation' });
    }

    const pubCap = public_capacity !== undefined ? Number(public_capacity) : loc.public_capacity;
    const memCap = req.user.role === 'org_admin'
      ? (member_capacity !== undefined ? Number(member_capacity) : loc.member_capacity)
      : 0;

    let is24Hours = loc.is_24_7;
    if (req.body.is_24_hours !== undefined) is24Hours = Boolean(req.body.is_24_hours);
    else if (req.body.is_24_7 !== undefined) is24Hours = Boolean(req.body.is_24_7);

    let opensAt = req.body.opening_time !== undefined ? req.body.opening_time : (req.body.opens_at !== undefined ? req.body.opens_at : loc.opens_at);
    let closesAt = req.body.closing_time !== undefined ? req.body.closing_time : (req.body.closes_at !== undefined ? req.body.closes_at : loc.closes_at);
    let opHours = req.body.operating_hours;

    if (is24Hours) {
      opensAt = null;
      closesAt = null;
      opHours = '24/7';
    } else {
      if (!opensAt || !closesAt) {
        return res.status(400).json({
          success: false,
          error: 'Opening time and closing time are required when location is not 24/7'
        });
      }

      const openMins = parseTimeToMinutes(opensAt);
      const closeMins = parseTimeToMinutes(closesAt);

      if (openMins === null || closeMins === null) {
        return res.status(400).json({
          success: false,
          error: 'Invalid time format. Please provide valid opening and closing times (HH:MM)'
        });
      }

      if (openMins === closeMins) {
        return res.status(400).json({
          success: false,
          error: 'Opening time and closing time cannot be identical. Please select distinct times or enable 24/7 availability.'
        });
      }

      const openFmt = formatTime12h(opensAt);
      const closeFmt = formatTime12h(closesAt);
      const isOvernight = openMins > closeMins;
      opHours = `${openFmt} - ${closeFmt}${isOvernight ? ' (Overnight)' : ''}`;
    }

    const updateRes = await query(
      `UPDATE parking_locations
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           locality = COALESCE($3, locality),
           public_capacity = $4,
           member_capacity = $5,
           is_24_7 = $6,
           opens_at = $7,
           closes_at = $8,
           operating_hours = $9,
           has_cctv = COALESCE($10, has_cctv),
           has_guard = COALESCE($11, has_guard),
           is_covered = COALESCE($12, is_covered),
           is_active = COALESCE($13, is_active),
           updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        name, address, locality, pubCap, memCap,
        Boolean(is24Hours), opensAt, closesAt, opHours,
        has_cctv, has_guard, is_covered, is_active,
        locationId
      ]
    );

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: enrichLocationWithAliases(updateRes.rows[0])
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates tariffs for a location.
 */
async function updateTariff(req, res, next) {
  try {
    const locationId = Number(req.params.id);
    const {
      hourly_rate, daily_rate, weekly_rate, monthly_rate,
      overtime_rate_per_minute, member_discount_percent
    } = req.body;

    const locCheck = await query('SELECT * FROM parking_locations WHERE id = $1', [locationId]);
    if (locCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    const loc = locCheck.rows[0];
    if (req.user.role === 'owner' && loc.owner_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (req.user.role === 'org_admin' && loc.org_id !== req.user.org.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updateRes = await query(
      `UPDATE location_tariffs
       SET hourly_rate = $1,
           daily_rate = $2,
           weekly_rate = $3,
           monthly_rate = $4,
           overtime_rate_per_minute = COALESCE($5, overtime_rate_per_minute),
           member_discount_percent = COALESCE($6, member_discount_percent)
       WHERE location_id = $7
       RETURNING *`,
      [
        hourly_rate !== undefined ? (hourly_rate ? Number(hourly_rate) : null) : undefined,
        daily_rate !== undefined ? (daily_rate ? Number(daily_rate) : null) : undefined,
        weekly_rate !== undefined ? (weekly_rate ? Number(weekly_rate) : null) : undefined,
        monthly_rate !== undefined ? (monthly_rate ? Number(monthly_rate) : null) : undefined,
        overtime_rate_per_minute !== undefined ? Number(overtime_rate_per_minute) : undefined,
        member_discount_percent !== undefined ? Number(member_discount_percent) : undefined,
        locationId
      ]
    );

    res.json({
      success: true,
      message: 'Tariff updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates facilities offered by a location.
 */
async function updateFacilities(req, res, next) {
  try {
    const locationId = Number(req.params.id);
    const { facilities } = req.body; // array of { code, price, is_offered }

    if (!Array.isArray(facilities)) {
      return res.status(400).json({ success: false, error: 'Facilities array required' });
    }

    await withTransaction(async (client) => {
      for (const f of facilities) {
        await client.query(
          `INSERT INTO location_facilities (location_id, facility_code, price, is_offered)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (location_id, facility_code) DO UPDATE
           SET price = EXCLUDED.price, is_offered = EXCLUDED.is_offered`,
          [locationId, f.code, Number(f.price) || 0.00, Boolean(f.is_offered)]
        );
      }
    });

    res.json({
      success: true,
      message: 'Facilities updated successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists lookup facilities.
 */
async function getFacilitiesMaster(req, res, next) {
  try {
    const result = await query('SELECT code, name, description FROM facilities ORDER BY name ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchLocations,
  getLocationDetail,
  getProviderLocations,
  createLocation,
  updateLocation,
  updateTariff,
  updateFacilities,
  getFacilitiesMaster
};
