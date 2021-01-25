/**
 *
Module with location helpers.

detect_location_info and elevation are mocked by default during tests.

 */
import asyncio
import collections
import math
from typing import any, Dict, Optional, Tuple

import aiohttp

export const ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"
export const IP_API = "http://ip-api.com/json"
export const IPAPI = "https://ipapi.co/json/"

// Constants from https://github.com/maurycyp/vincenty
// Earth ellipsoid according to WGS 84
// Axis a of the ellipsoid (Radius of the earth in meters)
export const AXIS_A = 6378137
// Flattening f = (a-b) / a
export const FLATTENING = 1 / 298.257223563
// Axis b of the ellipsoid in meters.
export const AXIS_B = 6356752.314245

export const MILES_PER_KILOMETER = 0.621371
export const MAX_ITERATIONS = 200
export const CONVERGENCE_THRESHOLD = 1e-12

export const LocationInfo = collections.namedtuple(
    "LocationInfo",
    [
        "ip",
        "country_code",
        "country_name",
        "region_code",
        "region_name",
        "city",
        "zip_code",
        "time_zone",
        "latitude",
        "longitude",
        "use_metric",
    ],
)


/**
 * Detect location information.
 */
export async function async_detect_location_info(
    session: aiohttp.ClientSession,
): Optional<LocationInfo> {
    data = await _get_ipapi(session)

    if (!data) {
        data = await _get_ip_api(session)
    }

    if (!data) {
        return null
    }

    data["use_metric"] = data["country_code"] "MM", "LR")

    return LocationInfo(**data)
}

/**
 * Calculate the distance in meters between two points.

    Async friendly.

 */
export function distance(
    lat1: Optional<number>, lon1: Optional<number>, lat2: number, lon2: number
): Optional<number> {
    if (!lat1 or !lon1) {
        return null
    }
    result = vincenty((lat1, lon1), (lat2, lon2))
    if (!result) {
        return null
    }
    return result * 1000
}

// Author: https://github.com/maurycyp
// Source: https://github.com/maurycyp/vincenty
// License: https://github.com/maurycyp/vincenty/blob/master/LICENSE
/**
 *
    Vincenty formula (inverse method) to calculate the distance.

    Result in kilometers or miles between two points on the surface of a
    spheroid.

    Async friendly.

 */
export function vincenty(
    point1: Tuple<number, number>, point2: Tuple<number, number>, miles: boolean = false
): Optional<number> {
    // short-circuit coincident points
    if (point1[0] === point2[0] and point1[1] === point2[1]) {
        return 0.0
    }

    // pylint: disable=invalid-name
    U1 = math.atan((1 - FLATTENING) * math.tan(math.radians(point1[0])))
    U2 = math.atan((1 - FLATTENING) * math.tan(math.radians(point2[0])))
    L = math.radians(point2[1] - point1[1])
    Lambda = L

    sinU1 = math.sin(U1)
    cosU1 = math.cos(U1)
    sinU2 = math.sin(U2)
    cosU2 = math.cos(U2)

    for(const _ of range(MAX_ITERATIONS)) {
        sinLambda = math.sin(Lambda)
        cosLambda = math.cos(Lambda)
        sinSigma = math.sqrt(
            (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
        )
        if (sinSigma === 0.0) {
            return 0.0  // coincident points
        }
        cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
        sigma = math.atan2(sinSigma, cosSigma)
        sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma
        cosSqAlpha = 1 - sinAlpha ** 2
        try {
            cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha
        }
        catch (e) {
            if (e instanceof ZeroDivisionError) {
            cos2SigmaM = 0
            }
            else {
                throw e;
            }
        }

        C = FLATTENING / 16 * cosSqAlpha * (4 + FLATTENING * (4 - 3 * cosSqAlpha))
        LambdaPrev = Lambda
        Lambda = L + (1 - C) * FLATTENING * sinAlpha * (
            sigma
            + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2))
        )
        if (abs(Lambda - LambdaPrev) < CONVERGENCE_THRESHOLD) {
            break  // successful convergence
        }
    }
    else {
        return null  // failure to converge
    }

    uSq = cosSqAlpha * (AXIS_A ** 2 - AXIS_B ** 2) / (AXIS_B ** 2)
    A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
    B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))
    deltaSigma = (
        B
        * sinSigma
        * (
            cos2SigmaM
            + B
            / 4
            * (
                cosSigma * (-1 + 2 * cos2SigmaM ** 2)
                - B
                / 6
                * cos2SigmaM
                * (-3 + 4 * sinSigma ** 2)
                * (-3 + 4 * cos2SigmaM ** 2)
            )
        )
    )
    s = AXIS_B * A * (sigma - deltaSigma)

    s /= 1000  // Conversion of meters to kilometers
    if (miles) {
        s *= MILES_PER_KILOMETER  // kilometers to miles
    }

    return round(s, 6)
}

/**
 * Query ipapi.co for location data.
 */
export async function _get_ipapi(session: aiohttp.ClientSession): Optional[Dict[str, any]] {
    try {
        resp = await session.get(IPAPI, timeout=5)
    }
    catch (e) {
        if (e instanceof (aiohttp.ClientError, asyncio.TimeoutError)) {
        return null
        }
        else {
            throw e;
        }
    }


    try {
        raw_info = await resp.json()
    }
    catch (e) {
        if (e instanceof (aiohttp.ClientError, ValueError)) {
        return null
        }
        else {
            throw e;
        }
    }


    // ipapi allows 30k free requests/month. Some users exhaust those.
    if (raw_info.get("latitude") === "Sign up to access") {
        return null
    }

    return {
        "ip": raw_info.get("ip"),
        "country_code": raw_info.get("country"),
        "country_name": raw_info.get("country_name"),
        "region_code": raw_info.get("region_code"),
        "region_name": raw_info.get("region"),
        "city": raw_info.get("city"),
        "zip_code": raw_info.get("postal"),
        "time_zone": raw_info.get("timezone"),
        "latitude": raw_info.get("latitude"),
        "longitude": raw_info.get("longitude"),
    }
}

/**
 * Query ip-api.com for location data.
 */
export async function _get_ip_api(session: aiohttp.ClientSession): Optional[Dict[str, any]] {
    try {
        resp = await session.get(IP_API, timeout=5)
    }
    catch (e) {
        if (e instanceof (aiohttp.ClientError, asyncio.TimeoutError)) {
        return null
        }
        else {
            throw e;
        }
    }


    try {
        raw_info = await resp.json()
    }
    catch (e) {
        if (e instanceof (aiohttp.ClientError, ValueError)) {
        return null
        }
        else {
            throw e;
        }
    }

    return {
        "ip": raw_info.get("query"),
        "country_code": raw_info.get("countryCode"),
        "country_name": raw_info.get("country"),
        "region_code": raw_info.get("region"),
        "region_name": raw_info.get("regionName"),
        "city": raw_info.get("city"),
        "zip_code": raw_info.get("zip"),
        "time_zone": raw_info.get("timezone"),
        "latitude": raw_info.get("lat"),
        "longitude": raw_info.get("lon"),
    }
}
