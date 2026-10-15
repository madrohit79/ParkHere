const config = require('../config');

const DURATION_MS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000
};

/**
 * Calculates scheduled end time based on rate type and quantity.
 * @param {Date|string} startTime
 * @param {'hour'|'day'|'week'|'month'} rateType
 * @param {number} quantity
 * @returns {Date}
 */
function calculateEndTime(startTime, rateType, quantity) {
  const startMs = new Date(startTime).getTime();
  const unitMs = DURATION_MS[rateType];
  if (!unitMs) {
    throw new Error(`Invalid rate type: ${rateType}`);
  }
  return new Date(startMs + Number(quantity) * unitMs);
}

/**
 * Computes arrival window start and deadline based on specification:
 * arrival_window_start = GREATEST(booking created time, start_time)
 * arrival_deadline = arrival_window_start + 15 minutes
 *
 * @param {Date|string} startTime
 * @param {Date|string} createdTime
 * @returns {{ windowStart: Date, deadline: Date }}
 */
function calculateArrivalWindow(startTime, createdTime = new Date()) {
  const startMs = new Date(startTime).getTime();
  const createMs = new Date(createdTime).getTime();

  const windowStartMs = Math.max(createMs, startMs);
  const deadlineMs = windowStartMs + config.arrivalWindowMinutes * 60 * 1000;

  return {
    windowStart: new Date(windowStartMs),
    deadline: new Date(deadlineMs)
  };
}

/**
 * Parses a time string (HH:MM or HH:MM:SS) to minutes from midnight (0 - 1439).
 * @param {string} timeStr
 * @returns {number|null}
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1] || '0', 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Formats time string (HH:MM or HH:MM:SS) or Date object into 12-hour AM/PM format (e.g. "06:00 AM").
 * @param {string|Date} timeInput
 * @returns {string}
 */
function formatTime12h(timeInput) {
  if (!timeInput) return '';
  let hours, minutes;
  if (timeInput instanceof Date) {
    hours = timeInput.getHours();
    minutes = timeInput.getMinutes();
  } else {
    const parts = String(timeInput).split(':');
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1] || '0', 10);
  }
  if (isNaN(hours) || isNaN(minutes)) return String(timeInput);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  const mStr = String(minutes).padStart(2, '0');
  return `${String(h12).padStart(2, '0')}:${mStr} ${ampm}`;
}

/**
 * Checks if a location is currently open based on a reference time (defaults to now).
 * @param {object} loc
 * @param {Date} [refDate]
 * @returns {boolean}
 */
function isLocationCurrentlyOpen(loc, refDate = new Date()) {
  const is24_7 = loc.is_24_7 !== undefined ? loc.is_24_7 : loc.is_24_hours;
  if (is24_7 || !loc.opens_at || !loc.closes_at) {
    return true;
  }
  const openMins = parseTimeToMinutes(loc.opens_at);
  const closeMins = parseTimeToMinutes(loc.closes_at);
  if (openMins === null || closeMins === null) return true;

  const nowMins = refDate.getHours() * 60 + refDate.getMinutes();

  if (openMins < closeMins) {
    // Standard daytime schedule (e.g. 06:00 to 22:00)
    return nowMins >= openMins && nowMins < closeMins;
  } else {
    // Overnight schedule (e.g. 18:00 to 02:00)
    return nowMins >= openMins || nowMins < closeMins;
  }
}

/**
 * Validates whether a booking interval from startTime to endTime is strictly within the operating hours.
 * Supports overnight operating schedules (e.g. 18:00 to 02:00).
 *
 * @param {Date|string} startTime
 * @param {Date|string} endTime
 * @param {object} loc
 * @returns {{ valid: boolean, message?: string }}
 */
function validateBookingOperatingHours(startTime, endTime, loc) {
  const is24_7 = loc.is_24_7 !== undefined ? loc.is_24_7 : loc.is_24_hours;
  if (is24_7 || !loc.opens_at || !loc.closes_at) {
    return { valid: true };
  }

  const reqStart = new Date(startTime);
  const reqEnd = new Date(endTime);
  const openMins = parseTimeToMinutes(loc.opens_at);
  const closeMins = parseTimeToMinutes(loc.closes_at);

  if (openMins === null || closeMins === null) {
    return { valid: true };
  }

  if (openMins === closeMins) {
    return {
      valid: false,
      message: 'Invalid facility operating schedule: opening and closing times are identical.'
    };
  }

  const durationMs = reqEnd.getTime() - reqStart.getTime();
  if (durationMs <= 0) {
    return {
      valid: false,
      message: 'Booking departure time must be after arrival time'
    };
  }

  const durationMins = durationMs / (60 * 1000);
  const openStr = formatTime12h(loc.opens_at);
  const closeStr = formatTime12h(loc.closes_at);

  const isOvernight = openMins > closeMins;
  const maxContinuousOpenMins = isOvernight
    ? (1440 - openMins) + closeMins
    : closeMins - openMins;

  if (durationMins > maxContinuousOpenMins) {
    return {
      valid: false,
      message: `Booking duration (${(durationMins / 60).toFixed(1)} hrs) exceeds the facility's maximum continuous operating window (${(maxContinuousOpenMins / 60).toFixed(1)} hrs: ${openStr} - ${closeStr})`
    };
  }

  const startMins = reqStart.getHours() * 60 + reqStart.getMinutes();
  const endMins = reqEnd.getHours() * 60 + reqEnd.getMinutes();

  if (!isOvernight) {
    // Standard daytime schedule (e.g. 06:00 to 22:00)
    // Booking must start and end on the same calendar day
    const isSameDay = reqStart.getFullYear() === reqEnd.getFullYear() &&
                      reqStart.getMonth() === reqEnd.getMonth() &&
                      reqStart.getDate() === reqEnd.getDate();

    if (!isSameDay) {
      return {
        valid: false,
        message: `Booking cannot span across overnight closure hours. Facility operates daily from ${openStr} to ${closeStr}.`
      };
    }

    if (startMins < openMins || startMins >= closeMins) {
      return {
        valid: false,
        message: `Facility is closed at chosen arrival time (${formatTime12h(reqStart)}). Operating hours are ${openStr} to ${closeStr}.`
      };
    }

    if (endMins > closeMins || endMins < openMins) {
      return {
        valid: false,
        message: `Facility is closed at chosen departure time (${formatTime12h(reqEnd)}). Operating hours are ${openStr} to ${closeStr}.`
      };
    }

    return { valid: true };
  } else {
    // Overnight schedule (e.g. 18:00 to 02:00)
    const isStartEvening = startMins >= openMins;
    const isStartMorning = startMins < closeMins;

    if (!isStartEvening && !isStartMorning) {
      return {
        valid: false,
        message: `Facility is closed at chosen arrival time (${formatTime12h(reqStart)}). Operating hours are ${openStr} to ${closeStr} (Overnight).`
      };
    }

    const startDay = new Date(reqStart.getFullYear(), reqStart.getMonth(), reqStart.getDate());
    const endDay = new Date(reqEnd.getFullYear(), reqEnd.getMonth(), reqEnd.getDate());
    const dayDiff = Math.round((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));

    if (isStartEvening) {
      if (dayDiff === 0) {
        if (endMins < openMins) {
          return {
            valid: false,
            message: `Facility is closed at chosen departure time (${formatTime12h(reqEnd)}). Operating hours are ${openStr} to ${closeStr} (Overnight).`
          };
        }
      } else if (dayDiff === 1) {
        if (endMins > closeMins) {
          return {
            valid: false,
            message: `Facility is closed at chosen departure time (${formatTime12h(reqEnd)}). Operating hours are ${openStr} to ${closeStr} (Overnight).`
          };
        }
      } else {
        return {
          valid: false,
          message: `Booking cannot span multiple days outside operating hours (${openStr} to ${closeStr}).`
        };
      }
    } else {
      if (dayDiff !== 0 || endMins > closeMins) {
        return {
          valid: false,
          message: `Facility closes at ${closeStr}. Bookings starting in the early morning must conclude by ${closeStr}.`
        };
      }
    }

    return { valid: true };
  }
}

module.exports = {
  DURATION_MS,
  calculateEndTime,
  calculateArrivalWindow,
  parseTimeToMinutes,
  formatTime12h,
  isLocationCurrentlyOpen,
  validateBookingOperatingHours
};
