import unittest
from unittest.mock import patch, MagicMock
import sys
import os

# Set up environment variables before importing settings
os.environ["EMBEDDING_STRATEGY"] = "openai"
os.environ["OPENAI_API_KEY"] = "fake-gemini-key"

# Ensure 'app' is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.services.embeddings import get_embeddings


class TestGeminiEmbeddingSanitization(unittest.TestCase):
    @patch("app.services.embeddings.settings")
    @patch("openai.OpenAI")
    def test_direct_gemini_api_version_rewrite(self, mock_openai_class, mock_settings):
        """Test that direct calls to generativelanguage.googleapis.com get rewritten to v1beta/openai/"""
        # Set up mocks
        mock_settings.embedding_strategy = "openai"
        mock_settings.openai_api_key = "fake-key"
        
        test_cases = [
            ("https://generativelanguage.googleapis.com", "models/text-embedding-004"),
            ("https://generativelanguage.googleapis.com/", "models/text-embedding-004"),
            ("https://generativelanguage.googleapis.com/v1", "models/text-embedding-004"),
            ("https://generativelanguage.googleapis.com/v1/", "models/text-embedding-004"),
            ("https://generativelanguage.googleapis.com/v1/openai", "models/text-embedding-004"),
            ("https://generativelanguage.googleapis.com/v1/openai/", "models/text-embedding-004"),
            ("https://generativelanguage.googleapis.com/v1beta/openai/", "models/text-embedding-004"),
            ("https://generativelanguage.googleapis.com/v1beta/openai/", "text-embedding-004"),
        ]
        
        for base_url, model_name in test_cases:
            mock_settings.openai_base_url = base_url
            mock_settings.embedding_model = model_name
            
            # Reset mock
            mock_openai_class.reset_mock()
            
            # Setup mock client context manager
            mock_client = MagicMock()
            mock_openai_class.return_value.__enter__.return_value = mock_client
            mock_client.embeddings.create.return_value.data = [MagicMock(embedding=[0.1, 0.2])]
            
            # Call function
            get_embeddings(["test text"])
            
            # Verify OpenAI client initialization parameters
            mock_openai_class.assert_called_once()
            called_kwargs = mock_openai_class.call_args[1]
            self.assertEqual(called_kwargs["base_url"], "https://generativelanguage.googleapis.com/v1beta/openai/")
            
            # Verify the model used in creation did NOT have 'models/' prefix
            mock_client.embeddings.create.assert_called_once()
            create_kwargs = mock_client.embeddings.create.call_args[1]
            self.assertEqual(create_kwargs["model"], "text-embedding-004")

    @patch("app.services.embeddings.settings")
    @patch("openai.OpenAI")
    def test_proxy_gemini_api_version_rewrite(self, mock_openai_class, mock_settings):
        """Test that calls to proxy/gateway URLs using a Gemini model get sanitized"""
        mock_settings.embedding_strategy = "openai"
        mock_settings.openai_api_key = "fake-key"
        
        # Test cases for proxies/gateways
        test_cases = [
            ("https://gateway.ai.cloudflare.com/v1/my-account/my-gateway", "models/text-embedding-004", "https://gateway.ai.cloudflare.com/v1beta/my-account/my-gateway/", "text-embedding-004"),
            ("https://my-proxy.com/v1", "models/text-embedding-004", "https://my-proxy.com/v1beta/", "text-embedding-004"),
            ("https://my-proxy.com/v1beta/", "text-embedding-004", "https://my-proxy.com/v1beta/", "text-embedding-004"),
        ]
        
        for base_url, model_name, expected_url, expected_model in test_cases:
            mock_settings.openai_base_url = base_url
            mock_settings.embedding_model = model_name
            
            mock_openai_class.reset_mock()
            mock_client = MagicMock()
            mock_openai_class.return_value.__enter__.return_value = mock_client
            mock_client.embeddings.create.return_value.data = [MagicMock(embedding=[0.1, 0.2])]
            
            get_embeddings(["test text"])
            
            mock_openai_class.assert_called_once()
            called_kwargs = mock_openai_class.call_args[1]
            self.assertEqual(called_kwargs["base_url"], expected_url)
            
            mock_client.embeddings.create.assert_called_once()
            create_kwargs = mock_client.embeddings.create.call_args[1]
            self.assertEqual(create_kwargs["model"], expected_model)


if __name__ == "__main__":
    unittest.main()
