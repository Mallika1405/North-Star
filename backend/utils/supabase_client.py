from supabase import create_client, Client
from config import settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return the shared Supabase client (service role for backend operations)."""
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def get_supabase_user_client(jwt: str) -> Client:
    """
    Return a Supabase client scoped to a specific user's JWT.
    Use this when you want RLS to apply — the service client bypasses RLS.
    """
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.auth.set_session(jwt, "")
    return client
