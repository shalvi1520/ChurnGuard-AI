"""
LangChain-based multi-provider LLM client with automatic fallback
rotation: Groq -> Gemini -> OpenAI. Groq is tried first because it's the
only provider currently configured (backend/.env); Gemini and OpenAI
activate automatically the moment their API keys are added -- no code
changes needed. API keys are read from environment variables only, never
hardcoded.
"""
import os
from typing import List, Optional, Tuple

from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

PROVIDER_ORDER = ("groq", "gemini", "openai")

_ENV_VARS = {
    "groq": "GROQ_API_KEY",
    "gemini": "GOOGLE_API_KEY",
    "openai": "OPENAI_API_KEY",
}

_DEFAULT_MODELS = {
    "groq": "openai/gpt-oss-120b",
    "gemini": "gemini-1.5-flash",
    "openai": "gpt-4o-mini",
}

_REQUEST_TIMEOUT_SECONDS = 20


def get_available_providers() -> List[str]:
    return [p for p in PROVIDER_ORDER if os.getenv(_ENV_VARS[p])]


def _build_client(provider: str) -> Optional[BaseChatModel]:
    api_key = os.getenv(_ENV_VARS[provider])
    if not api_key:
        return None

    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(model=_DEFAULT_MODELS["groq"], api_key=api_key, timeout=_REQUEST_TIMEOUT_SECONDS)
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=_DEFAULT_MODELS["gemini"], google_api_key=api_key, timeout=_REQUEST_TIMEOUT_SECONDS
        )
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=_DEFAULT_MODELS["openai"], api_key=api_key, timeout=_REQUEST_TIMEOUT_SECONDS)
    return None


def _fix_mojibake(text: str) -> str:
    """Some provider responses come back with UTF-8 bytes (e.g. an em dash,
    non-breaking hyphen) mis-decoded as Windows-1252 (the classic 'â€"'
    artifact -- cp1252 is what maps byte 0x80 to '€', not Latin-1). Encoding
    back through cp1252 and decoding as UTF-8 reverses exactly that mistake.
    It's a safe no-op for already-correct text: a genuine character outside
    cp1252's repertoire makes the .encode() step raise; a genuine cp1252-only
    character (e.g. a real em dash) still round-trips through .encode(), but
    the resulting single byte is virtually never valid standalone UTF-8, so
    .decode('utf-8') raises and the original text is kept."""
    try:
        return text.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def invoke_with_fallback(messages: List[BaseMessage]) -> Tuple[str, str]:
    """
    Tries each configured provider in PROVIDER_ORDER until one succeeds.
    Returns (response_text, provider_name). Raises RuntimeError if every
    configured provider fails, or if none are configured at all.
    """
    errors = {}
    tried_any = False
    for provider in PROVIDER_ORDER:
        client = _build_client(provider)
        if client is None:
            continue
        tried_any = True
        try:
            response = client.invoke(messages)
            return _fix_mojibake(response.content), provider
        except Exception as exc:  # noqa: BLE001 -- intentional: any single provider's
            # failure (timeout, rate limit, auth, etc.) must fall through to the next
            # provider rather than aborting the whole rotation.
            errors[provider] = str(exc)
            continue

    if not tried_any:
        raise RuntimeError(
            f"No LLM provider is configured. Set one of {list(_ENV_VARS.values())} in backend/.env."
        )
    raise RuntimeError(f"All configured providers failed: {errors}")
