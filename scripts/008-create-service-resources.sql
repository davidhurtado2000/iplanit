-- Junction table: many-to-many between services and resources (sedes)
-- A service can be offered at multiple resources, and a resource can offer multiple services.

CREATE TABLE IF NOT EXISTS service_resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_id, resource_id)
);

ALTER TABLE service_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members can manage service_resources"
  ON service_resources FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );
