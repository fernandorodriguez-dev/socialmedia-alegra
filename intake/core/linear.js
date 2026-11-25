'use strict';

/**
 * Cliente mínimo de la API GraphQL de Linear.
 * Reglas (ver skill linear-graphql-integration):
 *  - Leer el cuerpo del error: Linear responde 400 con el tipo GraphQL exacto.
 *  - Paginar siempre con pageInfo.
 *  - Nunca inventar ids: se resuelven contra la API.
 */

const ENDPOINT = 'https://api.linear.app/graphql';

function makeClient(apiKey) {
  if (!apiKey) throw new Error('Falta LINEAR_API_KEY en el entorno.');

  async function gql(query, variables) {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables: variables || {} }),
    });

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`Linear devolvió una respuesta no-JSON (HTTP ${resp.status}): ${text.slice(0, 300)}`);
    }

    if (!resp.ok) {
      const msg = (json.errors || []).map((e) => e.message).join(' | ') || text.slice(0, 300);
      throw new Error(`Linear HTTP ${resp.status}: ${msg}`);
    }
    if (json.errors && json.errors.length) {
      throw new Error('Linear API: ' + json.errors.map((e) => e.message).join(' | '));
    }
    return json.data;
  }

  return { gql };
}

/** Labels y estados del equipo, en paralelo y sin paginar el workspace entero. */
async function getTeamContext(gql, teamId) {
  const [labelsRes, statesRes] = await Promise.all([
    gql(
      `query($t: String!, $after: String) {
         team(id: $t) {
           labels(first: 250, after: $after) {
             nodes { id name parent { id name } }
             pageInfo { hasNextPage endCursor }
           }
         }
       }`,
      { t: teamId, after: null }
    ),
    gql(`query($t: String!) { team(id: $t) { states(first: 50) { nodes { id name type } } } }`, {
      t: teamId,
    }),
  ]);

  let labels = labelsRes.team.labels.nodes;
  let page = labelsRes.team.labels.pageInfo;
  let after = page.endCursor;
  let guard = 0;
  while (page.hasNextPage && guard < 10) {
    guard++;
    const more = await gql(
      `query($t: String!, $after: String) {
         team(id: $t) { labels(first: 250, after: $after) { nodes { id name parent { id name } } pageInfo { hasNextPage endCursor } } }
       }`,
      { t: teamId, after }
    );
    labels = labels.concat(more.team.labels.nodes);
    page = more.team.labels.pageInfo;
    after = page.endCursor;
  }

  return { labels, states: statesRes.team.states.nodes };
}

/** Usuarios por email exacto (no depende de la primera página de 250). */
async function getUsersByEmail(gql, emails) {
  const unique = [...new Set(emails.filter(Boolean).map((e) => String(e).toLowerCase()))];
  if (!unique.length) return {};
  const data = await gql(
    `query($f: UserFilter) { users(first: 50, filter: $f) { nodes { id name email url displayName active } } }`,
    { f: { email: { in: unique } } }
  );
  const map = {};
  for (const u of data.users.nodes) {
    if (u.email) map[u.email.toLowerCase()] = u;
  }
  return map;
}

/** Busca un issue ya creado con la misma llave de idempotencia. */
async function findDuplicate(gql, teamId, marker) {
  const data = await gql(
    `query($t: ID!, $q: String) {
       issues(first: 5, filter: { team: { id: { eq: $t } }, description: { contains: $q } }) {
         nodes { id identifier url title }
       }
     }`,
    { t: teamId, q: marker }
  );
  return data.issues.nodes[0] || null;
}

async function createIssue(gql, input) {
  const data = await gql(
    `mutation($input: IssueCreateInput!) {
       issueCreate(input: $input) { success issue { id identifier url title } }
     }`,
    { input }
  );
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error('Linear no confirmó la creación del issue.');
  }
  return data.issueCreate.issue;
}

async function addComment(gql, issueId, body) {
  await gql(
    `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    { input: { issueId, body } }
  );
}

async function subscribe(gql, issueId, userId) {
  await gql(
    `mutation($input: IssueUpdateInput!, $id: String!) { issueUpdate(id: $id, input: $input) { success } }`,
    { id: issueId, input: { subscriberIds: [userId] } }
  );
}

module.exports = {
  makeClient,
  getTeamContext,
  getUsersByEmail,
  findDuplicate,
  createIssue,
  addComment,
  subscribe,
};
