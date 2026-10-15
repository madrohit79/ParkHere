"""Pure utilities ported from the original ParkHere backend."""
import math
from datetime import datetime, timedelta, time, timezone

RATE_COLUMNS = {'hour': 'hourly_rate', 'day': 'daily_rate', 'week': 'weekly_rate', 'month': 'monthly_rate'}


def parse_datetime(value, fallback=None):
    if not value:
        return fallback or datetime.now(timezone.utc)
    if isinstance(value, datetime):
        result = value
    else:
        raw = str(value).strip().replace('Z', '+00:00')
        result = datetime.fromisoformat(raw)
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result


def calculate_end_time(start, rate_type, quantity):
    start = parse_datetime(start)
    units = {'hour': timedelta(hours=1), 'day': timedelta(days=1), 'week': timedelta(weeks=1), 'month': timedelta(days=30)}
    if rate_type not in units:
        raise ValueError('Rate type must be hour, day, week, or month')
    return start + units[rate_type] * int(quantity)


def arrival_window(start, now=None):
    now = parse_datetime(now or datetime.now(timezone.utc))
    start = parse_datetime(start)
    mins = int(__import__('os').getenv('ARRIVAL_WINDOW_MINUTES', '15'))
    window_start = max(now, start)
    return window_start, window_start + timedelta(minutes=mins)


def parse_time(value):
    if value is None:
        return None
    if isinstance(value, time):
        return value.hour * 60 + value.minute
    try:
        parts = str(value).split(':')
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, TypeError, IndexError):
        return None


def format_time12(value):
    mins = parse_time(value)
    if mins is None:
        return 'Unknown'
    h, m = divmod(mins, 60)
    suffix = 'AM' if h < 12 else 'PM'
    return f'{(h % 12) or 12}:{m:02d} {suffix}'


def is_location_open(location, at=None):
    if location.get('is_24_7', location.get('is_24_hours', True)):
        return True
    opening, closing = parse_time(location.get('opens_at') or location.get('opening_time')), parse_time(location.get('closes_at') or location.get('closing_time'))
    if opening is None or closing is None:
        return True
    at = parse_datetime(at or datetime.now(timezone.utc))
    current = at.hour * 60 + at.minute
    return opening <= current < closing if opening < closing else (current >= opening or current < closing)


def validate_operating_hours(start, end, location):
    is24 = location.get('is_24_7', location.get('is_24_hours', True))
    if is24 or not (location.get('opens_at') or location.get('opening_time')) or not (location.get('closes_at') or location.get('closing_time')):
        return {'valid': True, 'message': None}
    start, end = parse_datetime(start), parse_datetime(end)
    opening = parse_time(location.get('opens_at') or location.get('opening_time'))
    closing = parse_time(location.get('closes_at') or location.get('closing_time'))
    if opening is None or closing is None:
        return {'valid': True, 'message': None}
    open_str, close_str = format_time12(location.get('opens_at') or location.get('opening_time')), format_time12(location.get('closes_at') or location.get('closing_time'))
    if opening == closing:
        return {'valid': False, 'message': 'Invalid facility operating schedule: opening and closing times are identical.'}
    duration_minutes = (end - start).total_seconds() / 60
    if duration_minutes <= 0:
        return {'valid': False, 'message': 'Booking departure time must be after arrival time'}
    overnight = opening > closing
    max_open = (1440 - opening) + closing if overnight else closing - opening
    if duration_minutes > max_open:
        return {'valid': False, 'message': f"Booking duration ({duration_minutes / 60:.1f} hrs) exceeds the facility's maximum continuous operating window ({max_open / 60:.1f} hrs: {open_str} - {close_str})"}
    start_min = start.hour * 60 + start.minute
    end_min = end.hour * 60 + end.minute
    if not overnight:
        if start.date() != end.date():
            return {'valid': False, 'message': f'Booking cannot span across overnight closure hours. Facility operates daily from {open_str} to {close_str}.'}
        if start_min < opening or start_min >= closing:
            return {'valid': False, 'message': f'Facility is closed at chosen arrival time ({format_time12(start.time())}). Operating hours are {open_str} to {close_str}.'}
        if end_min > closing or end_min < opening:
            return {'valid': False, 'message': f'Facility is closed at chosen departure time ({format_time12(end.time())}). Operating hours are {open_str} to {close_str}.'}
        return {'valid': True, 'message': None}
    start_evening, start_morning = start_min >= opening, start_min < closing
    if not start_evening and not start_morning:
        return {'valid': False, 'message': f'Facility is closed at chosen arrival time ({format_time12(start.time())}). Operating hours are {open_str} to {close_str} (Overnight).'}
    day_diff = (end.date() - start.date()).days
    if start_evening:
        if day_diff == 0:
            if end_min < opening:
                return {'valid': False, 'message': f'Facility is closed at chosen departure time ({format_time12(end.time())}). Operating hours are {open_str} to {close_str} (Overnight).'}
        elif day_diff == 1:
            if end_min > closing:
                return {'valid': False, 'message': f'Facility is closed at chosen departure time ({format_time12(end.time())}). Operating hours are {open_str} to {close_str} (Overnight).'}
        else:
            return {'valid': False, 'message': f'Booking cannot span multiple days outside operating hours ({open_str} to {close_str}).'}
    else:
        if day_diff != 0 or end_min > closing:
            return {'valid': False, 'message': f'Facility closes at {close_str}. Bookings starting in the early morning must conclude by {close_str}.'}
    return {'valid': True, 'message': None}


def base_amount(unit_price, quantity, benefit='none', discount=0):
    raw = float(unit_price) * int(quantity)
    if benefit == 'free':
        return 0.0
    if benefit == 'discounted' and float(discount) > 0:
        raw *= 1 - float(discount) / 100
    return math.floor(raw * 100 + 0.5 + 1e-9) / 100


def overtime(scheduled_end, actual_exit, rate):
    diff = (parse_datetime(actual_exit) - parse_datetime(scheduled_end)).total_seconds()
    mins = max(0, math.ceil(diff / 60))
    return {'overtime_minutes': mins, 'overtime_amount': math.floor(mins * float(rate) * 100 + 0.5 + 1e-9) / 100}


def total_bill(base, overtime_amount, addons=0):
    value = float(base) + float(overtime_amount) + float(addons)
    return math.floor(value * 100 + 0.5 + 1e-9) / 100


def loc_aliases(loc):
    if not loc:
        return loc
    is24 = bool(loc.get('is_24_7', loc.get('is_24_hours', True)))
    loc.update({'is_24_hours': is24, 'is_24_7': is24, 'opening_time': loc.get('opens_at'), 'closing_time': loc.get('closes_at'), 'is_currently_open': is_location_open(loc)})
    loc['operating_hours'] = loc.get('operating_hours') or ('24/7' if is24 else f"{format_time12(loc.get('opens_at'))} - {format_time12(loc.get('closes_at'))}")
    return loc
