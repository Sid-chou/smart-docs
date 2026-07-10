import sys
import os

# Make sure we load the backend app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.services.embeddings import get_embeddings

print("CURRENT SETTINGS:")
print(f"Base URL: {settings.openai_base_url}")
print(f"Model: {settings.embedding_model}")
print(f"Strategy: {settings.embedding_strategy}")

try:
    print("\nAttempting to generate embeddings...")
    embeddings = get_embeddings(["Testing if the Gemini API version rewrite works."])
    print(f"Success! Generated {len(embeddings)} embeddings. Dimension: {len(embeddings[0])}")
except Exception as e:
    print(f"\nFAILED: {e}")
