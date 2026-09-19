"""
LangChain-based multi-provider LLM client with automatic fallback
rotation: Groq -> Gemini -> OpenAI. A provider is only tried once its API
key is set (Gemini accepts GEMINI_API_KEY or GOOGLE_API_KEY) -- no code
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
# Repo-root .env too (same path email_sender.py reads): the bare call above stops at backend/.env.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

PROVIDER_ORDER = ("groq", "gemini", "openai")

_ENV_VARS = {
    "groq": ("GROQ_API_KEY",),
    "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "openai": ("OPENAI_API_KEY",),
}

_DEFAULT_MODELS = {
    "groq": "openai/gpt-oss-120b",
    "gemini": "gemini-3.5-flash",  # override with GEMINI_MODEL; Google retires model ids
    "openai": "gpt-4o-mini",
}

_REQUEST_TIMEOUT_SECONDS = 20


def _api_key(provider: str) -> Optional[str]:
    return next((value for name in _ENV_VARS[provider] if (value := os.getenv(name))), None)


def get_available_providers() -> List[str]:
    return [p for p in PROVIDER_ORDER if _api_key(p)]


def _build_client(provider: str) -> Optional[BaseChatModel]:
    api_key = _api_key(provider)
    if not api_key:
        return None

    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(model=_DEFAULT_MODELS["groq"], api_key=api_key, timeout=_REQUEST_TIMEOUT_SECONDS)
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL") or _DEFAULT_MODELS["gemini"],
            google_api_key=api_key,
            timeout=_REQUEST_TIMEOUT_SECONDS,
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


def _response_text(response) -> str:
    content = response.content
    if isinstance(content, str):
        return content
    # Gemini 3 and other reasoning models reply with a list of content blocks.
    return "".join(
        block if isinstance(block, str) else block.get("text", "")
        for block in content or []
        if isinstance(block, str) or block.get("type") == "text"
    )


def invoke_with_fallback(messages: List[BaseMessage]) -> Tuple[str, str]:
    """
    Tries each configured provider in PROVIDER_ORDER until one succeeds.
    Returns (response_text, provider_name). Raises RuntimeError if every
    configured provider fails, or if none are configured at all.
    """
    errors = {}
    for provider in PROVIDER_ORDER:
        try:
            # Built inside the try: a provider that can't even be constructed
            # (missing package, bad argument) is a failure to fall past, not a
            # reason to abort the providers after it.
            client = _build_client(provider)
            if client is None:
                continue
            text = _response_text(client.invoke(messages))
            if not text.strip():
                raise ValueError("empty response")
            return _fix_mojibake(text), provider
        except Exception as exc:  # noqa: BLE001 -- intentional: any single provider's
            # failure (timeout, rate limit, auth, etc.) must fall through to the next
            # provider rather than aborting the whole rotation.
            errors[provider] = str(exc)

    if not errors:
        key_names = [name for names in _ENV_VARS.values() for name in names]
        raise RuntimeError(f"No LLM provider is configured. Set one of {key_names} in backend/.env.")
    raise RuntimeError(f"All configured providers failed: {errors}")
