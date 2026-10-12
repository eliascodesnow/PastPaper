module.exports = function config(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return response.status(500).json({ error: "Supabase environment variables are not configured." });
  }
  return response.status(200).json({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
};