MATCH (d:Decision {org_id:$org_id})-[e:DECIDED_IN|DOCUMENTED_IN|TRACKED_BY]->(s)
RETURN d, e, s, e.status AS status
ORDER BY d.decided_at DESC
