MATCH (p:Person {org_id:$org_id})-[r:OWNS|MAINTAINS]->(t)
WHERE t:Service OR t:Project
OPTIONAL MATCH (p)-[:MEMBER_OF]->(team:Team)
RETURN p, r, t, team
