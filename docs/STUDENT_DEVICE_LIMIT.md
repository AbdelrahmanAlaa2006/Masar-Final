# Student Device Limit

Per-tenant feature (Super Admin → tenant → الميزات المفعلة → «أمان حسابات الطلاب»).
Default **off**. When on, each student may use `max_devices` registered devices
(default 1, 1–10 per student). Staff (admin, assistant, super_admin) are never limited.

This is **not** MAC-address limiting. Browsers cannot read MAC addresses or any
hardware ID, and the system does not try to.

## What a "device" is

A browser install that holds a random 256-bit token **minted by the server**.
The database stores only `sha256(token)`. The client keeps the token per student
in localStorage, a first-party cookie (400 days) and IndexedDB (`backend/deviceIdentity.js`),
so losing one store does not make the browser a "new device". Logout does not clear it.
No fingerprinting, no IP address.

## Enforcement (server side)

| Step | Where |
|---|---|
| After sign-in: register / recognise / deny, atomically per student (advisory lock) | `authorize_student_device(token)` |
| Authorized session (JWT `session_id`) is bound to the device | `student_device_sessions` |
| Unbound student session in a limited tenant gets `NULL` tenant → no tenant data in ~130 RLS policies and the student RPCs | `current_tenant_id()` |
| Same gate on `video_parts_select`, `lectures_select_by_grade`, and the `bunny-signed-url` and `r2-download-url` edge functions | `student_session_authorized()` |
| Deny → the auth session that just logged in is deleted | `auth.sessions` |
| Revoke → device marked revoked, its bindings and auth sessions deleted (access ends immediately) | `admin_revoke_student_device` |

Skipping the client call does not help: the session simply sees nothing.

## Admin workflow

Control Panel → حسابات الطلاب → «الأجهزة» on a student row (visible only when the
feature is on; needs admin, or assistant with the `students` permission):
allowed-devices stepper, `registered / allowed`, device list (platform · browser,
last active, registered/revoked date), «إلغاء التسجيل», and the last refused attempt.
Lowering the allowance keeps existing devices and only refuses new ones.
All actions go to `audit_logs` (`student_device_registered`, `student_device_revoked`,
`student_device_limit_changed`, `student_device_limit_enabled/disabled`).

## Turning it on for a tenant with logged-in students

No one is logged out by the switch. On each student's next app start or login,
that device is registered lazily if a slot is free (first come, first served);
other devices get the "limit reached" message. Expect a few support requests
from students who were using two devices. Raise their allowance or revoke the old device.

## Limitations (web platform)

- A new browser, a private/incognito window, another browser profile, or
  clearing all site data = a new device. With the default limit this **locks the student
  out until an admin revokes the old device**. The failure is closed, not a bypass.
- A technically skilled user could copy the token (and session) from one
  browser to another with developer tools. Nothing in a web app can prevent that fully.
- Revocation is final for that token. If a device was revoked by mistake, that
  browser needs its site data cleared (or another browser) to register again.
- iPadOS Safari may report itself as macOS. Labels are informational only.
- Access tokens of a denied/revoked session stay cryptographically valid until
  expiry (≤1h), but they no longer resolve to any tenant data.

## Tests

`node scripts/test_student_device_limit.mjs`: real GoTrue sign-ins against the
linked project, throwaway `zz-devtest-*` tenants that are deleted afterwards. It covers disabled/enabled,
same device, limit 1/2, decrease, revoke, staff, bypass attempts, tenant isolation,
8-way concurrent registration, the feature toggle and the audit logs.

Migration: `backend/migrations/2026_09_23_student_device_limit.sql`
(rollback: `backend/migrations/rollback/2026_09_23_student_device_limit.rollback.sql`).
