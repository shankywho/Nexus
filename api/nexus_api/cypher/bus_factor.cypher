MATCH (p:Person {org_id:$org_id})-[r]-()
WITH p, count(r) AS degree
OPTIONAL MATCH (p)-[k:KNOWS_ABOUT]->(s:Service)
RETURN p, degree, collect({service:s.id, weight:k.weight}) AS expertise
ORDER BY degree DESC LIMIT 10
