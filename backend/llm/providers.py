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
            return response.content, provider
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
