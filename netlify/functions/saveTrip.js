
// Netlify Function: saveTrip to FaunaDB (Collection: Trips)
// Env: FAUNA_SECRET

const faunadb = require('faunadb');
const q = faunadb.query;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method Not Allowed' };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    if (!process.env.FAUNA_SECRET) {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: false, warning: 'FAUNA_SECRET not set – skipping save' }) };
    }
    const client = new faunadb.Client({ secret: process.env.FAUNA_SECRET });
    const result = await client.query(q.Create(q.Collection('Trips'), { data: body }));
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, result }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ ok: false, error: err.message }) };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
