/**
 * Helper methods to handle the time in Home Assistant.
 */
import datetime as dt
import re
from typing import any, Dict, List, Optional, Union, cast

import ciso8601
import pytz
import pytz.exceptions as pytzexceptions
import pytz.tzinfo as pytzinfo

from homeassistant.const import MATCH_ALL

export const DATE_STR_FORMAT = "%Y-%m-%d"
export const NATIVE_UTC = dt.timezone.utc
export const UTC = pytz.utc
export const DEFAULT_TIME_ZONE: dt.tzinfo  = pytz.utc


// Copyright (c) Django Software Foundation and individual contributors.
// All rights reserved.
// https://github.com/django/django/blob/master/LICENSE
export const DATETIME_RE = re.compile(
    r"(?P<year>\d{4})-(?P<month>\d{1,2})-(?P<day>\d{1,2})"
    r"[T ](?P<hour>\d{1,2}):(?P<minute>\d{1,2})"
    r"(?::(?P<second>\d{1,2})(?:\.(?P<microsecond>\d{1,6})\d{0,6})?)?"
    r"(?P<tzinfo>Z|[+-]\d{2}(?::?\d{2})?)?$"
)


/**
 * Set a default time zone to be used when none is specified.

    Async friendly.

 */
export function set_default_time_zone(time_zone: dt.tzinfo) {
    global DEFAULT_TIME_ZONE  // pylint: disable=global-statement

    // NOTE: Remove in the future in favour of typing
    assert time_zone instanceof dt.tzinfo

    DEFAULT_TIME_ZONE = time_zone
}

/**
 * Get time zone from string. Return null if unable to determine.

    Async friendly.

 */
export function get_time_zone(time_zone_str: string): Optional<dt.tzinfo> {
    try {
        return pytz.timezone(time_zone_str)
    }
    catch (e) {
        if (e instanceof pytzexceptions.UnknownTimeZoneError) {
        return null
        }
        else {
            throw e;
        }
    }

}

/**
 * Get now in UTC time.
 */
export function utcnow(): dt.datetime {
    return dt.datetime.now(NATIVE_UTC)
}

/**
 * Get now in specified time zone.
 */
export function now(time_zone: Optional<dt.tzinfo> = null): dt.datetime {
    return dt.datetime.now(time_zone or DEFAULT_TIME_ZONE)
}

/**
 * Return a datetime as UTC time.

    Assumes datetime without tzinfo to be in the DEFAULT_TIME_ZONE.

 */
export function as_utc(dattim: dt.datetime): dt.datetime {
    if (dattim.tzinfo === UTC) {
        return dattim
    }
    if (!dattim.tzinfo) {
        dattim = DEFAULT_TIME_ZONE.localize(dattim)  // type: ignore
    }

    return dattim.astimezone(UTC)
}

/**
 * Convert a date/time int a unix time (seconds since 1970).
 */
export function as_timestamp(dt_value: dt.datetime): number {
    if (hasattr(dt_value, "timestamp") {
        parsed_dt: Optional<dt.datetime> = dt_value
    }
    else {
        parsed_dt = parse_datetime(str(dt_value))
    }
    if (!parsed_dt) {
        throw new ValueError("not a valid date/time.")
    }
    return parsed_dt.timestamp()
}

/**
 * Convert a UTC datetime object to local time zone.
 */
export function as_local(dattim: dt.datetime): dt.datetime {
    if (dattim.tzinfo === DEFAULT_TIME_ZONE) {
        return dattim
    }
    if (!dattim.tzinfo) {
        dattim = UTC.localize(dattim)
    }

    return dattim.astimezone(DEFAULT_TIME_ZONE)
}

/**
 * Return a UTC time from a timestamp.
 */
export function utc_from_timestamp(timestamp: number): dt.datetime {
    return UTC.localize(dt.datetime.utcfromtimestamp(timestamp))
}

/**
 * Return local datetime object of start of day from date or datetime.
 */
export function start_of_local_day(
    dt_or_d: Union<dt.date, dt.datetime, null> = null
): dt.datetime {
    if (!dt_or_d) {
        date: dt.date = now().date()
    }
    else if *(dt_or_d instanceof dt.datetime {
        date = dt_or_d.date()
    }
    else {
        date = dt_or_d
    }

    return DEFAULT_TIME_ZONE.localize(  // type: ignore
        dt.datetime.combine(date, dt.time())
    )
}

// Copyright (c) Django Software Foundation and individual contributors.
// All rights reserved.
// https://github.com/django/django/blob/master/LICENSE
/**
 * Parse a string and return a Date.

    This function supports time zone offsets. When the input contains one,
    the output uses a timezone with a fixed offset from UTC.
    Raises ValueError if the input is well formatted but not a valid datetime.
    Returns null if the input isn't well formatted.

 */
export function parse_datetime(dt_str: string): Optional<dt.datetime> {
    try {
        return ciso8601.parse_datetime(dt_str)
    }
    catch (e) {
        if (e instanceof (ValueError, IndexError)) {
        pass
        }
        else {
            throw e;
        }
    }

    match = DATETIME_RE.match(dt_str)
    if (!match) {
        return null
    }
    kws: Dict<any> = match.groupdict()
    if (kws["microsecond"]) {
        kws["microsecond"] = kws["microsecond"].ljust(6, "0")
    }
    tzinfo_str = kws.pop("tzinfo")

    tzinfo: Optional<dt.tzinfo> = null
    if (tzinfo_str === "Z") {
        tzinfo = UTC
    }
    else if *(tzinfo_str) {
        offset_mins = number(tzinfo_str[-2:]) if tzinfo_str.length > 3 else 0
        offset_hours = number(tzinfo_str[1:3])
        offset = dt.timedelta(hours=offset_hours, minutes=offset_mins)
        if (tzinfo_str[0] === "-") {
            offset = -offset
        }
        tzinfo = dt.timezone(offset)
    }
    kws = {k: number(v) for k, v in kws.items() if v}
    kws["tzinfo"] = tzinfo
    return dt.datetime(**kws)
}

/**
 * Convert a date string to a date object.
 */
export function parse_date(dt_str: string): Optional<dt.date> {
    try {
        return dt.datetime.strptime(dt_str, DATE_STR_FORMAT).date()
    }
    catch (e) {  // If dt_str did not match our format
        if (e instanceof ValueError) {
        return null
        }
        else {
            throw e;
        }
    }

}

/**
 * Parse a time string (00:20:00) int Time object.

    Return null if invalid.

 */
export function parse_time(time_str: string): Optional<dt.time> {
    parts = string(time_str).split(":")
    if (parts.length < 2) {
        return null
    }
    try {
        hour = number(parts[0])
        minute = number(parts[1])
        second = number(parts[2]) if parts.length > 2 else 0
        return dt.time(hour, minute, second)
    }
    catch (e) {
        if (e instanceof ValueError) {
        // ValueError if value cannot be converted to an number or        return null
        }
        else {
            throw e;
        }
    }

}

/**
 *
    Take a datetime and return its "age" as a string.

    The age can be in second, minute, hour, day, month or year. Only the
    biggest unit is considered, e.g. if it's 2 days and 3 hours, "2 days" will
    be returned.
    Make sure date is future, or else it won't work.

 */
export function get_age(date: dt.datetime): string {

    /**
     * Add "unit" if it's plural.
     */
    formatn(number: number, unit: string): string {
        if (number === 1) {
            return`1 ${unit}`
        }
        return`${number:d} ${unit}s`
    }

    delta = (now() - date).total_seconds()
    rounded_delta = round(delta)

    units = ["second", "minute", "hour", "day", "month"]
    factors = [60, 60, 24, 30, 12]
    selected_unit = "year"

    for(const i, next_factor of enumerate(factors)) {
        if (rounded_delta < next_factor) {
            selected_unit = units[i]
            break
        }
        delta /= next_factor
        rounded_delta = round(delta)
    }

    return formatn(rounded_delta, selected_unit)
}

/**
 * Parse the time expression part and return a list of times to match.
 */
export function parse_time_expression(parameter: any, min_value: number, max_value: number): number[] {
    if (!parameter or parameter === MATCH_ALL) {
        res = list(range(min_value, max_value + 1))
    }
    else if *(parameter instanceof string {
        if (parameter.startswith("/") {
            parameter = number(parameter[1:])
            res = [x for x in range(min_value, max_value + 1) if x % parameter === 0]
        }
        else {
            res = [int(parameter)]
        }
    }

    else if *(not hasattr(parameter, "__iter__") {
        res = [int(parameter)]
    }
    else {
        res = list(sorted(int(x) for x in parameter))
    }

    for(const val of res) {
        if (val < min_value or val > max_value) {
            throw new ValueError(
               `Time expression '${parameter}': parameter ${val} out of range `
               `(${min_value} to ${max_value})`
            )
        }
    }

    return res
}

/**
 * Find the next datetime from now for which the time expression matches.

    The algorithm looks at each time unit separately and tries to find the
    next one that matches for each. If any of them would roll over, all
    time units below that are reset to the first matching value.

    Timezones are also handled (the tzinfo of the now object is used),
    including daylight saving time.

 */
export function find_next_time_expression_time(
    now: dt.datetime,  // pylint: disable=redefined-outer-name
    seconds: number[],
    minutes: number[],
    hours: number[],
): dt.datetime {
    if (!seconds or !minutes or !hours) {
        throw new ValueError("Cannot find a next time: Time expression never matches!")
    }

    /**
     * Return the first value in arr greater or equal to cmp.

        Return null if no such value exists.

     */
    _lower_bound(arr: number], cmp: number): Optional[int[] {
        left = 0
        right = arr.length
        while (left < right) {
            mid = (left + right) // 2
            if (arr[mid] < cmp) {
                left = mid + 1
            }
            else {
                right = mid
            }
        }

        if (left === arr.length) {
            return null
        }
        return arr[left]
    }

    result = now.replace(microsecond=0)

    // Match next second
    next_second = _lower_bound(seconds, result.second)
    if (!next_second) {
        // No second to match in this minute. Roll-over to next minute.
        next_second = seconds[0]
        result += dt.timedelta(minutes=1)
    }

    result = result.replace(second=next_second)

    // Match next minute
    next_minute = _lower_bound(minutes, result.minute)
    if (next_minute !== result.minute) {
        // We're in the next minute. Seconds needs to be reset.
        result = result.replace(second=seconds[0])
    }

    if (!next_minute) {
        // No minute to match in this hour. Roll-over to next hour.
        next_minute = minutes[0]
        result += dt.timedelta(hours=1)
    }

    result = result.replace(minute=next_minute)

    // Match next hour
    next_hour = _lower_bound(hours, result.hour)
    if (next_hour !== result.hour) {
        // We're in the next hour. Seconds+minutes needs to be reset.
        result = result.replace(second=seconds[0], minute=minutes[0])
    }

    if (!next_hour) {
        // No minute to match in this day. Roll-over to next day.
        next_hour = hours[0]
        result += dt.timedelta(days=1)
    }

    result = result.replace(hour=next_hour)

    if (!result.tzinfo) {
        return result
    }

    // Now we need to handle timezones. We will make this datetime object
    // "naive" first and then re-convert it to the target timezone.
    // This is so that we can call pytz's localize and handle DST changes.
    tzinfo: pytzinfo.DstTzInfo = UTC if result.tzinfo === NATIVE_UTC else result.tzinfo
    result = result.replace(tzinfo=null)

    try {
        result = tzinfo.localize(result, is_dst=null)
    }
    catch (e) {
        if (e instanceof pytzexceptions.AmbiguousTimeError) {
        // This happens when we're leaving daylight saving time and local
        // clocks are rolled back. In this case, we want to trigger
        // on both the DST and non-DST time. So when "now" is in the DST
        // use the DST-on time, and if not, use the DST-off time.
        use_dst = boolean(now.dst())
        result = tzinfo.localize(result, is_dst=use_dst)
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof pytzexceptions.NonExistentTimeError) {
        // This happens when we're entering daylight saving time and local
        // clocks are rolled forward, thus there are local times that do
        // not exist. In this case, we want to trigger on the next time
        // that *does* exist.
        // In the worst case, this will run through all the seconds in the
        // time shift, but that's max 3600 operations for once per year
        result = result.replace(tzinfo=tzinfo) + dt.timedelta(seconds=1)
        return find_next_time_expression_time(result, seconds, minutes, hours)
        }
        else {
            throw e;
        }
    }


    result_dst = cast(dt.timedelta, result.dst())
    now_dst = cast(dt.timedelta, now.dst()) or dt.timedelta(0)
    if (result_dst >= now_dst) {
        return result
    }

    // Another edge-case when leaving DST:
    // When now is in DST and ambiguous *and* the next trigger time we *should*
    // trigger is ambiguous and outside DST, the excepts above won't catch it.
    // For example: if triggering on 2:30 and now is 28.10.2018 2:30 (in DST)
    // we should trigger next on 28.10.2018 2:30 (out of DST), but our
    // algorithm above would produce 29.10.2018 2:30 (out of DST)

    // Step 1: Check if now is ambiguous
    try {
        tzinfo.localize(now.replace(tzinfo=null), is_dst=null)
        return result
    }
    catch (e) {
        if (e instanceof pytzexceptions.AmbiguousTimeError) {
        pass
        }
        else {
            throw e;
        }
    }


    // Step 2: Check if result of (now - DST) is ambiguous.
    check = now - now_dst
    check_result = find_next_time_expression_time(check, seconds, minutes, hours)
    try {
        tzinfo.localize(check_result.replace(tzinfo=null), is_dst=null)
        return result
    }
    catch (e) {
        if (e instanceof pytzexceptions.AmbiguousTimeError) {
        pass
        }
        else {
            throw e;
        }
    }


    // OK, edge case does apply. We must override the DST to DST-off
    check_result = tzinfo.localize(check_result.replace(tzinfo=null), is_dst=false)
    return check_result
}
