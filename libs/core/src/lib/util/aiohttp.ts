/**
 * Utilities to help with aiohttp.
 */
import io
import json
from typing import any, Dict, Optional
from urllib.parse import parse_qsl

from multidict import CIMultiDict, MultiDict

from homeassistant.const import HTTP_OK


/**
 * Small mock to imitate stram reader.
 */
export class MockStreamReader {

    /**
     * Initialize mock stram reader.
     */
    constructor(content: bytes) {
        this._content = io.BytesIO(content)
    }

    /**
     * Read bytes.
     */
    async read(byte_count: number = -1): bytes {
        if (byte_count === -1) {
            return this._content.read()
        }
        return this._content.read(byte_count)
    }
}

/**
 * Mock an aiohttp request.
 */
export class MockRequest {

    mock_source: Optional<string> = null

    /**
     * Initialize a request.
     */
    constructor(

        content: bytes,
        mock_source: string,
        method: string = "GET",
        status: number = HTTP_OK,
        headers: Optional[Dict[str, string]] = null,
        query_string: Optional<string> = null,
        url: string = "",
    ) {
        this.method = method
        this.url = url
        this.status = status
        this.headers: CIMultiDict<string> = CIMultiDict(headers or {})
        this.query_string = query_string or ""
        this._content = content
        this.mock_source = mock_source
    }

    // @property
    /**
     * Return a dictionary with the query variables.
     */
    query(): "MultiDict[str]" {
        return MultiDict(parse_qsl(this.query_string, keep_blank_values=true))
    }

    // @property
    /**
     * Return the body as text.
     */
    _text(): string {
        return this._content.decode("utf-8")
    }

    // @property
    /**
     * Return the body as text.
     */
    content(): MockStreamReader {
        return MockStreamReader(this._content)
    }

    /**
     * Return the body as JSON.
     */
    async json(): any {
        return json.loads(this._text)
    }

    /**
     * Return POST parameters.
     */
    async post(): "MultiDict[str]" {
        return MultiDict(parse_qsl(this._text, keep_blank_values=true))
    }

    /**
     * Return the body as text.
     */
    async text(): string {
        return this._text
    }
}
