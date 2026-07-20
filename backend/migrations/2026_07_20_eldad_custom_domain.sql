-- Attach the purchased custom domain to the الضاد tenant (أ. خالد الشريف).
--
-- TenantContext resolves production hostnames against tenants.domain (it
-- strips a leading "www." first), so after this both the apex and www of
-- mrkhalidelsharif.com open the الضاد tenant directly.
-- Other tenants keep resolving by slug / ?tenant= until they get domains.

UPDATE tenants
SET domain = 'mrkhalidelsharif.com'
WHERE slug = 'eldad';
