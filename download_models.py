"""Download the NLP resources that must be bundled in a deployment image."""

from __future__ import annotations

import os
from pathlib import Path

import stanza

from subject_verb_extractor.parse import STANZA_PROCESSORS


def main() -> None:
    target = Path(
        os.environ.get("STANZA_RESOURCES_DIR", "/opt/stanza_resources")
    )
    target.mkdir(parents=True, exist_ok=True)
    stanza.download(
        "en",
        model_dir=str(target),
        processors=STANZA_PROCESSORS,
        verbose=True,
    )


if __name__ == "__main__":
    main()
