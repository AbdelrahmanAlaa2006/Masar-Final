// tenants.config.registration = { open, closes_at }. Missing config = open.
// Shared by the public register page and the admin switch (RegistrationSwitch).
export function isRegistrationClosed(registration) {
  if (!registration) return false
  if (registration.open === false) return true
  const closesAt = registration.closes_at ? Date.parse(registration.closes_at) : NaN
  return !Number.isNaN(closesAt) && Date.now() > closesAt
}
