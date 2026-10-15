MATCH (d:Decision {org_id:$org_id})
WHERE ($decision_id IS NULL OR d.id = $decision_id)
  AND ($service_id IS NULL OR (d)-[:AFFECTS]->(:Service {id:$service_id}))
OPTIONAL MATCH p1 = (d)-[:DECIDED_IN|DOCUMENTED_IN|TRACKED_BY]->(src)
OPTIONAL MATCH p2 = (d)-[:SUPERSEDES*1..3]->(old:Decision)
OPTIONAL MATCH p3 = (old)-[:DECIDED_IN|DOCUMENTED_IN|TRACKED_BY]->(oldsrc)
OPTIONAL MATCH p4 = (src)-[:IMPLEMENTED_BY]->(pr:PullRequest)
RETURN d, p1, p2, p3, p4
