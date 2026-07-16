-- Rename the power-platform tenant's physical slug to match its owner
-- and custom domain (mrmohamedabdella.com).
--
-- Safe because nothing durable keys on the slug: auth emails embed the
-- tenant UUID, RLS keys on tenant_id, and brand/theme matching also works
-- via config.subject = 'cyber'. Frontend remaps (?tenant=power-platform
-- and legacy sherif-programming links) are updated in the same commit.

UPDATE tenants
SET slug = 'mohamed-abdella'
WHERE slug = 'sherif-programming';
