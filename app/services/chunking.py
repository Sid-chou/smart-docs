from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Why RecursiveCharacterTextSplitter and not a word-counter:
#
# Naive word splitting (text.split()) cuts blindly mid-sentence.
# Example: "The revenue was $4.2M. Operating costs rose 12%." split at
# word 8 becomes ["The revenue was $4.2M. Operating"] and ["costs rose 12%."]
# The first chunk now misleads the vector search — it looks like a revenue
# fact but has no complete context. The second chunk looks like an orphan.
#
# RecursiveCharacterTextSplitter tries to split at paragraph → sentence →
# word boundaries in that priority order. It preserves semantic units.
# Your embeddings become coherent representations of real ideas, not
# arbitrary word windows.

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,          # characters (not tokens)
    chunk_overlap=50,        # overlap preserves context at boundaries
    separators=[
        "\n\n",              # paragraph break — highest priority split point
        "\n",                # line break
        ". ",                # sentence boundary
        "? ",
        "! ",
        "; ",
        ", ",
        " ",                 # word boundary — last resort
        "",                  # character — absolute last resort
    ],
    length_function=len,
    is_separator_regex=False,
)


def chunk_text(text: str) -> List[str]:
    """
    Split text into semantically coherent overlapping chunks.
    Returns empty list for empty input.
    """
    if not text or not text.strip():
        return []
    chunks = _splitter.split_text(text)
    # Filter out chunks that are too short to be meaningful
    return [c for c in chunks if len(c.strip()) > 50]
