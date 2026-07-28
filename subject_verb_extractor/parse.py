import os
import re
import warnings
from contextlib import contextmanager
from functools import lru_cache

import spacy
import spacy_stanza
import stanza
from spacy.tokens import Doc


STANZA_PROCESSORS = "tokenize,pos,lemma,depparse"


def _stanza_resources_dir() -> str | None:
    """Return the configured model directory, if one was provided."""
    return os.environ.get("STANZA_RESOURCES_DIR") or None


def _allow_model_download() -> bool:
    """Allow convenient first-run downloads outside immutable deployments."""
    return os.environ.get("STANZA_ALLOW_DOWNLOAD", "1").lower() in {
        "1",
        "true",
        "yes",
    }


def _input_sentences(text: str) -> list[str]:
    """Split the corpus into parseable sentence strings."""
    return [
        sentence if sentence.endswith((".", "!", "?")) else f"{sentence}."
        for segment in re.split(r"\s*<[ph]>\s*", text)
        for sentence in re.split(r"(?<=[.!?])\s+", segment.strip())
        if sentence and "@ @ @ @ @ @ @ @ @ @" not in sentence
    ]


def spacy_parse(text: str, model="en_core_web_trf") -> list:
    """
    Parse the text using spaCy and return the parsed document.
    
    Args:
        text (str): The text to parse.
        model: The spaCy model to use for parsing. If None, the default model will be used.
    
    Returns:
        doc: As a list of parsed sentences, where each sentence is a spaCy Doc object.
    """

    nlp = spacy.load(model)
    doc = []
    for sentence in _input_sentences(text):
        parsed_sentence = nlp(sentence)
        if parsed_sentence:
            doc.append(parsed_sentence)

    return doc


@contextmanager
def _trusted_stanza_checkpoint_loading():
    """Allow Stanza's official legacy checkpoints during pipeline startup.

    PyTorch 2.6+ defaults to ``weights_only=True``. Stanza 1.6 checkpoints
    predate that format and need the documented compatibility mode. Scope the
    override to pipeline initialization and restore the process environment
    immediately afterwards.
    """
    variable = "TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"
    previous = os.environ.get(variable)
    if "TORCH_FORCE_WEIGHTS_ONLY_LOAD" not in os.environ:
        os.environ[variable] = "1"
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=(
                    "Environment variable TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD "
                    "detected.*"
                ),
                category=UserWarning,
            )
            yield
    finally:
        if previous is None:
            os.environ.pop(variable, None)
        else:
            os.environ[variable] = previous


@lru_cache(maxsize=1)
def _load_stanza_pipeline():
    """Load the English pipeline once and reuse it across analyses."""
    resources_dir = _stanza_resources_dir()
    directory_options = {"dir": resources_dir} if resources_dir else {}
    with _trusted_stanza_checkpoint_loading():
        try:
            return spacy_stanza.load_pipeline(
                "en",
                processors=STANZA_PROCESSORS,
                download_method=None,
                use_gpu=False,
                verbose=False,
                **directory_options,
            )
        except FileNotFoundError as error:
            if not _allow_model_download():
                location = resources_dir or "the default Stanza directory"
                raise RuntimeError(
                    "The English Stanza model is not installed in "
                    f"{location}. Rebuild the container image to include it."
                ) from error

            # Preserve convenient first-run behaviour for local development.
            download_options = (
                {"model_dir": resources_dir} if resources_dir else {}
            )
            stanza.download(
                "en",
                processors=STANZA_PROCESSORS,
                verbose=False,
                **download_options,
            )
            return spacy_stanza.load_pipeline(
                "en",
                processors=STANZA_PROCESSORS,
                download_method=None,
                use_gpu=False,
                verbose=False,
                **directory_options,
            )


def preload_stanza_pipeline() -> None:
    """Initialize the pipeline so readiness implies that the model is usable."""
    _load_stanza_pipeline()


def spacy_stanza_parse(text: str, add_conll: bool = False) -> list[Doc]:
    """
    Parse the text with stanza wrapped with spaCy
    Args:
        text (str): The text to parse.
    Returns:
        List[Doc]: A list of spaCy Doc objects, each representing a parsed sentence.
    """

    nlp = _load_stanza_pipeline()
    if add_conll and "conll_formatter" not in nlp.pipe_names:
        # The web API reads spaCy token attributes directly. Keep this optional
        # component isolated to the CLI path that explicitly saves CoNLL-U.
        import spacy_conll  # noqa: F401 - registers the pipeline factory.

        nlp.add_pipe("conll_formatter", last=True)

    doc = []
    for sentence in _input_sentences(text):
        parsed_sentence = nlp(sentence)
        if parsed_sentence:
            doc.append(parsed_sentence)

    return doc
