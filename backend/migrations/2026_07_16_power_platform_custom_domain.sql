-- Attach the purchased custom domain to the power-platform tenant
-- (slug "sherif-programming", branded "منصة باور" / power-platform).
--
-- TenantContext resolves production hostnames against tenants.domain
-- (with any leading "www." stripped in the frontend), so after this the
-- apex and www of mrmohamedabdella.com open the power tenant directly.
-- Other tenants keep resolving by slug / ?tenant= until they get domains.

UPDATE tenants
SET domain = 'mrmohamedabdella.com'
WHERE slug = 'sherif-programming';
