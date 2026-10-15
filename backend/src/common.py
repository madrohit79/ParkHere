from flask import jsonify
from .db import clean


def ok(data=None, message=None, status=200, **extra):
    payload = {'success': True}
    if message is not None:
        payload['message'] = message
    if data is not None:
        payload['data'] = clean(data)
    payload.update(clean(extra))
    return jsonify(payload), status


def fail(message, status=400, **extra):
    payload = {'success': False, 'error': message}
    payload.update(clean(extra))
    return jsonify(payload), status


def rows(sql, params=None):
    from .db import query
    return query(sql, params)['rows']


def one(sql, params=None):
    found = rows(sql, params)
    return found[0] if found else None

class HTTPProblem(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message
