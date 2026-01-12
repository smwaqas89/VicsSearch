"""LLM providers for RAG generation."""
import os
from abc import ABC, abstractmethod
from typing import Optional, Generator
import logging

from .config import get_rag_config, LLMProvider


logger = logging.getLogger(__name__)


class BaseLLM(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate response from prompt."""
        pass
    
    @abstractmethod
    def generate_stream(self, prompt: str, system: Optional[str] = None) -> Generator[str, None, None]:
        """Generate streaming response."""
        pass
    
    @property
    @abstractmethod
    def is_available(self) -> bool:
        """Check if the LLM is available."""
        pass


class OllamaLLM(BaseLLM):
    """Ollama local LLM."""
    
    def __init__(self, model: Optional[str] = None, base_url: Optional[str] = None):
        config = get_rag_config()
        self.model = model or config.ollama_model
        self.base_url = base_url or config.ollama_base_url
        self.temperature = config.temperature
    
    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate response from Ollama."""
        import httpx
        
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        
        response = httpx.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": self.temperature},
            },
            timeout=120.0,
        )
        response.raise_for_status()
        return response.json()["message"]["content"]
    
    def generate_stream(self, prompt: str, system: Optional[str] = None) -> Generator[str, None, None]:
        """Generate streaming response from Ollama."""
        import httpx
        import json
        
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        
        with httpx.stream(
            "POST",
            f"{self.base_url}/api/chat",
            json={"model": self.model, "messages": messages, "stream": True},
            timeout=120.0,
        ) as response:
            for line in response.iter_lines():
                if line:
                    data = json.loads(line)
                    if "message" in data and "content" in data["message"]:
                        yield data["message"]["content"]
    
    @property
    def is_available(self) -> bool:
        """Check if Ollama is running."""
        try:
            import httpx
            response = httpx.get(f"{self.base_url}/api/tags", timeout=5.0)
            return response.status_code == 200
        except:
            return False


class AnthropicLLM(BaseLLM):
    """Anthropic Claude API."""
    
    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None):
        config = get_rag_config()
        self.model = model or config.anthropic_model
        self.api_key = api_key or config.anthropic_api_key or os.getenv("ANTHROPIC_API_KEY")
        self.temperature = config.temperature
    
    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate response from Claude."""
        import httpx
        
        if not self.api_key:
            raise ValueError("Anthropic API key required")
        
        body = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.temperature,
        }
        if system:
            body["system"] = system
        
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=body,
            timeout=120.0,
        )
        response.raise_for_status()
        return response.json()["content"][0]["text"]
    
    def generate_stream(self, prompt: str, system: Optional[str] = None) -> Generator[str, None, None]:
        """Generate streaming response from Claude."""
        import httpx
        import json
        
        if not self.api_key:
            raise ValueError("Anthropic API key required")
        
        body = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.temperature,
            "stream": True,
        }
        if system:
            body["system"] = system
        
        with httpx.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=body,
            timeout=120.0,
        ) as response:
            for line in response.iter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    if data.get("type") == "content_block_delta":
                        yield data["delta"].get("text", "")
    
    @property
    def is_available(self) -> bool:
        return bool(self.api_key)


class NoLLM(BaseLLM):
    """Placeholder when no LLM is configured."""
    
    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        return "LLM not configured. Set llm_provider in config."
    
    def generate_stream(self, prompt: str, system: Optional[str] = None) -> Generator[str, None, None]:
        yield "LLM not configured."
    
    @property
    def is_available(self) -> bool:
        return False


def get_llm(provider: Optional[LLMProvider] = None) -> BaseLLM:
    """Get LLM based on configuration."""
    config = get_rag_config()
    provider = provider or config.llm_provider
    
    if provider == LLMProvider.OLLAMA:
        return OllamaLLM()
    elif provider == LLMProvider.ANTHROPIC:
        return AnthropicLLM()
    else:
        return NoLLM()
